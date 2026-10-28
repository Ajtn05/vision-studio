# Architecture and design choices

## Two independent programs

The Mac owns the camera, local video element, settings, and Canvas. React does not render video frames: MediaDevices attaches a stream directly to `<video>`. A timer samples the current video into an offscreen Canvas, preserves its aspect ratio within the selected resolution, and uses asynchronous JPEG encoding. Encoding does not alter the displayed video.

The Linux server owns all machine learning. FastAPI loads one real detector during startup, including one synthetic warmup to initialize lazy provider code. A missing or broken local model is logged; `/health` and `/api/info` remain available with `model_ready: false`. Health checks never run inference. Model preparation is an explicit command, never an automatic service download.

`InferenceWorker` uses one `ThreadPoolExecutor` worker for decoding and detection. This keeps blocking OpenCV/PyTorch calls off the ASGI event loop. WebSocket ping/pong and HTTP health checks remain responsive while inference runs. The detector is called serially and never shared concurrently between clients.

## Bounded work

The browser permits one encode and one transmitted frame in flight, and checks the WebSocket send buffer. It samples at most the selected FPS and skips sampling while busy. It does not enqueue frames or retry rejected frames. A per-connection generation prevents an old asynchronous JPEG encode from entering a new connection. Changing camera or inference configuration invalidates old results.

The server accepts one client. Its reader remains available while a separate async task awaits one inference. Excess frames are acknowledged as dropped, so a misbehaving client cannot create an inference queue. The entry point uses transport flow control to pause socket reads while received messages await the application, disables redundant JPEG compression, and sets the maximum message size. Use `python -m app` to retain these limits.

Timeouts cannot terminate a running Python thread. `asyncio.shield` keeps the real worker future alive. Reconnecting clients are rejected while that future remains busy, preventing new tasks from accumulating. Shutdown waits for the worker; systemd's stop timeout handles a truly stuck native call by terminating the process. For hard per-frame isolation in a future version, move the detector to a supervised process.

## Coordinates

The transmitted image is always unmirrored. Ultralytics returns coordinates relative to that actual image after undoing its internal preprocessing. The adapter clamps corners and converts them into normalized `x`, `y`, `width`, and `height`.

`detectionToCanvas` matches `object-fit: contain`: multiply by the fitted video content dimensions, then add the horizontal or vertical letterbox offset. A mirrored preview uses `1 - x - width` for the left coordinate. Text is drawn normally so labels remain readable. Canvas backing pixels account for device pixel ratio; drawing coordinates remain CSS pixels. `ResizeObserver` redraws on resize without an unnecessary animation loop.

## State and resource ownership

`useCamera` stops all tracks on stop, replacement, or unmount. A request counter safely disposes of a stream returned after cancellation. Device disconnects are surfaced. `useDetectionStream` cancels its sampling timer and ignores late encode callbacks on cleanup. `DetectionSocket` owns and clears socket handlers, heartbeat timers, and reconnect timers. React Strict Mode's development cleanup is supported.

The session goes from disconnected to connecting, then connected only after the matching configuration acknowledgement. Unexpected disconnects retry at 1, 2, 4, 8, then 10 seconds. Explicit disconnect cancels retries. Policy/protocol errors stop retrying and remain visible. Results over two seconds old, from another configuration, or with an unexpected frame ID are discarded. Fresh boxes expire after two seconds.

## Configuration and extension

Server environment settings are separate from per-session `SessionConfig`. Client `Settings` has explicit defaults, validation on restore, and localStorage persistence. URLs containing credentials, queries, or fragments are rejected and never stored. Client model selection is deliberately unsupported: `/api/info` advertises this, and the server validates any requested model name against the model already loaded.

To add another inference provider, implement `Detector.model_name`, `provider`, and `detect(image, confidence, image_size)`. Return `list[Detection]` for the unmirrored input. Construct it during startup and give it to `InferenceWorker`; leave HTTP, framing, and React components unchanged. Tests construct the app with a fake detector to verify transport without weights. A future multi-client scheduler should be an explicit design change rather than increasing Uvicorn workers and duplicating the model.

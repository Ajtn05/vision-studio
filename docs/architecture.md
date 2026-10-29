# Architecture and design choices

## Two independent programs

The client owns the camera, local video element, settings, and Canvas. Browser mode uses standard web APIs on Linux, macOS, or Windows; the optional native shell is configured for macOS. React does not render video frames: MediaDevices attaches a stream directly to `<video>`. Capture wakes when the socket can accept a frame and the sampling interval has elapsed. It checks decoded frame counts, waits with video-frame callbacks when needed, and falls back to animation callbacks. A reused offscreen Canvas preserves aspect ratio and encodes JPEGs asynchronously. Encoding does not alter the displayed video.

The backend owns all machine learning. It can run on an external server over
private Tailscale WSS or on the client computer over loopback
`ws://127.0.0.1:8000`. Client and server operating systems can differ. FastAPI loads
the configured object detector and any installed optional hand detector during
startup, including synthetic warmups to initialize lazy provider code. A missing
or broken local model is logged; `/health` and `/api/info` remain available with
`model_ready: false` when no detector is available. Health checks never run
inference. Model preparation is an explicit command, never an automatic service
download. [Setup](SETUP.md) explains both deployment choices.

`InferenceWorker` uses one `ThreadPoolExecutor` worker for decoding and detection. This keeps blocking OpenCV/PyTorch calls off the ASGI event loop. WebSocket ping/pong and HTTP health checks remain responsive while inference runs. The detector is called serially and never shared concurrently between clients.

The CPU adapter reapplies the configured Torch thread limit after lazy provider
setup, because Ultralytics device initialization resets that value. Model
benchmarks report the effective thread count after initialization.

## Bounded work

The browser permits one encode and one transmitted frame in flight, and checks the WebSocket send buffer. It samples at most the selected FPS and skips sampling while busy. It does not enqueue frames or retry rejected frames. A per-connection generation prevents an old asynchronous JPEG encode from entering a new connection. Changing camera or inference configuration invalidates old results.

The server accepts one client. Its reader remains available while a separate async task awaits one inference. Excess frames are acknowledged as dropped, so a misbehaving client cannot create an inference queue. The entry point uses transport flow control to pause socket reads while received messages await the application, disables redundant JPEG compression, and sets the maximum message size. Use `python -m app` to retain these limits.

Timeouts cannot terminate a running Python thread. `asyncio.shield` keeps the real worker future alive. Reconnecting clients are rejected while that future remains busy, preventing new tasks from accumulating. Shutdown waits for the worker; systemd's stop timeout handles a truly stuck native call by terminating the process. For hard per-frame isolation in a future version, move the detector to a supervised process.

## Coordinates

The transmitted image is always unmirrored. Ultralytics returns coordinates relative to that actual image after undoing its internal preprocessing. The adapter clamps corners and converts them into normalized `x`, `y`, `width`, and `height`.

`detectionToCanvas` matches `object-fit: contain`: multiply by the fitted video content dimensions, then add the horizontal or vertical letterbox offset. A mirrored preview uses `1 - x - width` for the left coordinate. Text is drawn normally so labels remain readable. Canvas backing pixels account for device pixel ratio; drawing coordinates remain CSS pixels. `ResizeObserver` redraws on resize without an unnecessary animation loop.

## State and resource ownership

`useCamera` stops all tracks on stop, replacement, or unmount. A request counter safely disposes of a stream returned after cancellation. Device disconnects are surfaced. `useDetectionStream` disposes of its sampler, including availability subscriptions, scheduled callbacks, visibility listeners, and late encodes. `DetectionSocket` owns and clears socket handlers, heartbeat timers, and reconnect timers. React Strict Mode's development cleanup is supported.

The session goes from disconnected to connecting, then connected only after the matching configuration acknowledgement. Unexpected disconnects retry at 1, 2, 4, 8, then 10 seconds. Explicit disconnect cancels retries. Policy/protocol errors stop retrying and remain visible. Results over two seconds old, from another configuration, or with an unexpected frame ID are discarded. Boxes expire two seconds after capture; processing and delivery consume part of that budget. Reading age updates every 100 ms from the same monotonic capture timestamp.

## Configuration and extension

Server environment settings are separate from per-session `SessionConfig`. Client `Settings` has explicit defaults, validation on restore, and localStorage persistence. URLs containing credentials, queries, or fragments are rejected and never stored. The server advertises installed modes in `/api/info`; the client can select objects, hands, or measurement with a new configuration revision. Each frame keeps its received configuration, and all detectors share one inference thread. Model weights are loaded only at startup.

The optional MediaPipe hand adapter returns 21 landmarks, handedness, and a
geometric estimate of raised fingers. It uses independent IMAGE-mode inference
and closes its native graph on the inference thread at shutdown. Measurement
reuses YOLO boxes; a client-only known-width reference converts them to approximate
physical dimensions. Calibration belongs to the camera session and is discarded
when its camera, connection, mode, or reference changes. See [vision modes](vision-modes.md).

`inference_size` independently controls detector input resolution while `resolution` bounds JPEG dimensions. Older clients omit it and retain frame-width-based inference. New clients discover the extension through the original ready handshake before sending it. The real adapter reports its loaded vocabulary size. YOLOE checkpoints with baked LVIS embeddings expand recognition beyond COCO; a boxes-only segmentation predictor parses their outputs without constructing unused masks. See [detection quality and speed](detection-quality.md).

To add another inference provider, implement `Detector.model_name`, `provider`, and `detect(image, confidence, image_size)`. Return `list[Detection]` for the unmirrored input. Construct it during startup and give it to `InferenceWorker`; leave HTTP, framing, and React components unchanged. Tests construct the app with a fake detector to verify transport without weights. A future multi-client scheduler should be an explicit design change rather than increasing Uvicorn workers and duplicating the model.

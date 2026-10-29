# Verification guide

## Automated checks

`frontend`: `npm test` covers coordinate scaling, both kinds of letterboxing, mirroring, aspect-preserving capture, envelope byte order, URL/TLS restrictions, response validation, connection acknowledgement, bounded in-flight frames, stale/out-of-order results, configuration revisions, heartbeat RTT, reconnects, policy rejection, and cleanup. `npm run build` checks strict TypeScript and production bundling.

`backend`: `python -m pytest -q` covers envelope parsing, invalid IDs/timestamps/size, malformed/truncated JPEGs, dimensions before allocation, detection serialization/bounds, health without inference or weights, restricted CORS/origins, configuration errors, the full JPEG-to-response WebSocket path, one-client admission, busy-frame dropping, responsive ping/health while inference runs, and runtime revisions. The test fake lives in `tests/conftest.py`; normal `python -m app` always uses the real adapter.

Run `python -m ruff check app tests scripts` and `python -m ruff format --check app tests scripts` for Python code consistency. Build the native bundle with `npm run tauri -- build --debug --bundles app` or the release build documented in the README.

## Synthetic transport/overlay check

This explicit test fixture uses a generated Canvas video and a fake detector. It requires no webcam permission or model weights; its timings measure actual encoding/network/fixture work and say nothing about YOLO speed. The harness is not a production entry and is not in the built client assets.

1. In `backend`, install `requirements-test.txt`, then run `python tests/serve_fixture.py`. This binds loopback port 8000 and announces that it is a test fixture.
2. In `frontend`, run `npm run dev` and open `http://127.0.0.1:1420/tests/stream-harness.html`.
3. Enter `ws://127.0.0.1:8000` and Connect, then Start camera.
4. Confirm the synthetic video moves, a `test object` box covers the rectangle, the count is one, and measurements populate only after real responses.
5. Toggle mirroring and resize the view; the box should stay aligned and its text readable. Change resolution/confidence and check the connection remains live.
6. Stop the fixture server; video should continue and the connection should show reconnecting. Restart it and confirm recovery. Stop camera and Disconnect; measurements/boxes should clear and no retry should occur.
7. Close the harness and stop the fixture. Use the normal root page and `python -m app` for actual detection.

## Real client-to-server webcam acceptance check

Run this with the intended server model, client browser and camera permission,
and tailnet. The client and server can use different operating systems.
A synthetic fixture cannot establish hardware performance or model quality.

1. Prepare the real CPU model on the server using its operating system's setup commands. Start the backend and confirm both endpoints report `model_ready:true`, provider `cpu`, and the intended model.
2. Confirm loopback health on the server, then HTTPS health from the client through private Serve. Inspect Serve/Funnel status before and after; other routes must remain intact.
3. Open the browser client on localhost or HTTPS. Enter the private WSS backend URL, Connect, Start camera, and grant access. Select the desired built-in/external camera. Repeat in the optional macOS desktop app when validating that bundle.
4. Show an object from the model's class list (for example a person or bottle). Confirm labels/confidence/boxes appear over local video, count matches the latest fresh frame, and all metrics derive from received results. Empty scenes may correctly yield zero objects.
5. Move left/right, toggle mirror, resize the window, and switch between a 16:9 and 4:3 camera if available. Boxes should follow the displayed image without letterbox/mirroring offsets. Some motion lag equals measured frame latency.
6. Change confidence, resolution, target FPS, and JPEG quality. The preview should stay smooth. Inference FPS may be below target. Settings should survive app restart; the app should start with camera stopped and backend disconnected.
7. Stop the backend or temporarily interrupt the test connection without changing other services. Confirm the preview keeps playing, status becomes reconnecting, boxes clear, and recovery occurs when connectivity returns. Explicit Disconnect must stop attempts.
8. Stop camera; the operating system's camera indicator should go out. Unplug an external camera and confirm a useful error. Close/reopen the app to check resources were released.
9. If using a managed service, repeat after logging out of the server's desktop and after a planned reboot. For Linux systemd, check `journalctl`; on other systems, use the appropriate service logs. Check resource use and unrelated workloads. Do not reboot or interrupt unrelated services just to run automated tests.
10. Benchmark the intended backend provider on its actual host with the same local image and thread/resolution configuration. Record measured median/p95 model time, full-session FPS/latency, memory, and stability. Compare CPU/OpenVINO where available and choose based on results.

Passing the local automated suite does not establish a real-camera check,
tailnet deployment, or performance on another operating system. Historical
validation below covers Linux and macOS; Windows has not yet had an end-to-end
project check. macOS signing and notarization are separate distribution checks.

## Original local validation record

The implemented client passed 26 Vitest tests, strict TypeScript/production bundling, and Prettier checks. The backend passed 38 model-free pytest tests and Ruff checks. A macOS ARM64 debug `.app` compiled and opened with the technical interface; its bundled camera description and configured entitlement plists were inspected.

Using the explicit test server and synthetic camera harness, the real browser capture → JPEG → binary envelope → loopback WebSocket → decode → test detector → JSON → Canvas path was exercised. Boxes matched both mirrored and unmirrored video and remained aligned after changing inference resolution. Backend stop/restart showed reconnecting while video continued, cleared results, and automatically resumed detections. Explicit camera stop/disconnect cleared measurements and released the test session. The fixture was stopped afterward.

At that point, actual Linux Mint CPU/OpenVINO inference, the private Tailscale route, macOS camera permission, and signed/notarized distribution remained hardware/deployment acceptance steps. A Starlette warning noted its planned TestClient HTTPX migration; it did not fail tests. That original check did not install model weights or PyTorch on the Mac.

## Detection improvements — October 29, 2026

The updated backend passed 53 model-free pytest tests and Ruff lint/format
checks. The updated frontend passed 37 Vitest tests and the TypeScript/production
build. New coverage includes independent inference size and legacy defaults,
capability negotiation with old/new servers, invalid overlap thresholds, bulk
box conversion, fresh-frame sampling, FPS limits, hidden-page suspension,
availability subscriptions, and cleanup of callbacks and late encodes.
An initialization regression test also verifies that the requested Torch CPU
thread limit survives Ultralytics' lazy provider initialization.

Official YOLOE nano and small checkpoints were prepared with 1,203 LVIS object
categories. Both prepared models loaded and inferred without the preparation
tokenizer on the Python import path, on Ultralytics' public `bus.jpg` and
`zidane.jpg` images at inference sizes 320, 640, and 960. The smoke checks verify
the vocabulary count, nonempty valid boxes, and absence of unused decoded masks.
These are model integration checks, not a labeled accuracy evaluation. The
full 4,585-name prompt-free alternatives also loaded, but produced abstract
labels, so the practical default uses the LVIS object vocabulary.

The browser's synthetic camera check exercised actual Canvas capture, JPEG
encoding, binary frames, the WebSocket, decoding, and overlay rendering. It
received results at 640×360, 320×180, and 960×540, changed inference size
independently, toggled mirroring, and confirmed that camera stop halted binary
transmission. It completed without page errors. Source images were synthetic;
this did not request access to the user's camera.

## Linux CPU measurements — October 29, 2026

The isolated benchmark ran on an Intel i5-8265U Linux server, using
Ultralytics 8.4.191, CPU inference, two effective Torch threads after the fix,
confidence 0.4, and the public `zidane.jpg` sample. Each row used 30 measured
runs after three warmups, in addition to the adapter's startup warmup.

| Model | Image bounds / inference size | Median | p95 |
| --- | --- | --- | --- |
| YOLO11n, before restoring the thread limit | 640×360 / 640 | 1,669.4 ms | 2,609.8 ms |
| YOLO11n, fixed thread limit | 640×360 / 640 | 126.2 ms | 132.5 ms |
| YOLOE-26n + LVIS, Fast sizes | 320×180 / 320 | 101.7 ms | 112.5 ms |
| YOLOE-26n + LVIS, Balanced sizes | 640×360 / 640 | 356.9 ms | 365.1 ms |
| YOLOE-26s + LVIS | 640×360 / 640 | 634.7 ms | 658.3 ms |
| YOLOE-26n + LVIS, Detail sizes | 960×540 / 960 | 736.1 ms | 803.0 ms |

The same-model median improved about 13.2× after restoring the CPU thread
limit. These timings include the detector's preprocessing and box conversion,
but exclude camera capture, JPEG encoding, network transport, and UI rendering.
This sample is not a bounding-box accuracy benchmark, and the timing rows use
the same confidence rather than the different preset confidence values.
Nano is the practical default on this CPU; the small model remains an option
when its additional capacity is worth the latency.

The benchmark used an isolated temporary directory without changing the
deployed backend's source, model selection, or Tailscale route. A production
upgrade and restart remain separate deployment steps.

## Continuous live readings (2026-10-29)

The Live preset now defaults to 320 × 180 frames, 320-pixel inference, and a
10 FPS target. Regression coverage includes 30 consecutive captures with
playback counters frozen at zero and one, media-clock fallback, pacing after
variable JPEG encoding time, reading age measured from capture, and recovery
after a late result. All 47 frontend tests, TypeScript/production bundling,
Prettier checks, and a macOS debug app build passed.

The synthetic camera harness connected to the already-running real local
YOLOE-26n/LVIS backend. After correcting send pacing, the UI reported about
8.6 inference FPS, 39 ms frame latency, and 55 ms reading age at one sample.
The server-drop counter did not increase between the post-fix observations.
This checks continuous capture, JPEG encoding, inference, and result display;
synthetic object labels do not establish recognition accuracy or webcam FPS.

A separate local CPU timing check used two Torch threads, blank synthetic
frames, two warmups per size, and ten measured calls. Median model-call time
was 19.6 ms at 320 pixels and 68.1 ms at 640 pixels. These timings exclude
capture, JPEG encoding, transport, and display and are not Linux-server results.

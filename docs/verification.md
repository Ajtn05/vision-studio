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

## Real Mac-to-Linux webcam acceptance check

This must be run with the actual Linux model, Mac camera permission, and tailnet. A synthetic fixture cannot establish hardware performance or model quality.

1. Prepare the real CPU model on Linux. Start the server/service and confirm both endpoints report `model_ready:true`, provider `cpu`, and the intended model.
2. Confirm local health, then HTTPS health from the Mac through private Serve. Inspect Serve/Funnel status before and after; other routes must remain intact.
3. Open the bundled Mac app. Enter its private WSS URL, Connect, Start camera, and grant access. Select the desired built-in/external camera.
4. Show an object from the model's class list (for example a person or bottle). Confirm labels/confidence/boxes appear over local video, count matches the latest fresh frame, and all metrics derive from received results. Empty scenes may correctly yield zero objects.
5. Move left/right, toggle mirror, resize the window, and switch between a 16:9 and 4:3 camera if available. Boxes should follow the displayed image without letterbox/mirroring offsets. Some motion lag equals measured frame latency.
6. Change confidence, resolution, target FPS, and JPEG quality. The preview should stay smooth. Inference FPS may be below target. Settings should survive app restart; the app should start with camera stopped and backend disconnected.
7. Stop the backend or temporarily interrupt the test connection without changing other services. Confirm the preview keeps playing, status becomes reconnecting, boxes clear, and recovery occurs when connectivity returns. Explicit Disconnect must stop attempts.
8. Stop camera; the operating system's camera indicator should go out. Unplug an external camera and confirm a useful error. Close/reopen the app to check resources were released.
9. Repeat with the systemd service after logging out of the Linux desktop, then after a planned reboot. Check `journalctl`, service resource use, and concurrent Jellyfin playback. Do not reboot or interrupt unrelated services just to run automated tests.
10. Benchmark CPU/OpenVINO on Linux with the same local image and thread/resolution configuration. Record measured median/p95 model time, full-session FPS/latency, memory, and stability. Choose the provider based on results.

No real Linux hardware benchmark, tailnet deployment, macOS camera grant, or signed/notarized distribution is implied by passing the local automated suite.

## Local validation record

The implemented client passed 26 Vitest tests, strict TypeScript/production bundling, and Prettier checks. The backend passed 38 model-free pytest tests and Ruff checks. A macOS ARM64 debug `.app` compiled and opened with the technical interface; its bundled camera description and configured entitlement plists were inspected.

Using the explicit test server and synthetic camera harness, the real browser capture → JPEG → binary envelope → loopback WebSocket → decode → test detector → JSON → Canvas path was exercised. Boxes matched both mirrored and unmirrored video and remained aligned after changing inference resolution. Backend stop/restart showed reconnecting while video continued, cleared results, and automatically resumed detections. Explicit camera stop/disconnect cleared measurements and released the test session. The fixture was stopped afterward.

Actual Linux Mint CPU/OpenVINO inference, the private Tailscale route, macOS camera permission, and signed/notarized distribution remain hardware/deployment acceptance steps. A Starlette warning currently notes its planned TestClient HTTPX migration; it does not fail tests. No model weights or PyTorch were installed on the Mac.

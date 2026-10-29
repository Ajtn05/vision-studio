# Troubleshooting

## Connection does not become connected

First check the saved **Backend URL** against the [two setup modes](SETUP.md).
Local testing uses `ws://127.0.0.1:8000`; Linux server testing uses
`wss://<server-hostname>:8443`, replacing `<server-hostname>` with the `.ts.net`
hostname printed by Tailscale Serve.

1. On the machine running detection, `/health` must report `model_ready:true`. Use `curl --fail http://127.0.0.1:8000/health` on the Mac for local mode, or `curl --fail http://127.0.0.1:8001/health` inside the Linux SSH session for the port-8001 server guide. Fresh Linux installations use 8000. Check the matching foreground logs, or the installed service's journal. A model failure leaves the API available but rejects detection sessions.
2. For server mode, `tailscale status` on the Mac should show the server reachable; `curl 'https://<actual-serve-hostname>:8443/health'` must succeed with normal certificate verification. Check the hostname and port printed by `tailscale serve status`, tailnet access policies, HTTPS certificates, and MagicDNS. Mac-only mode needs no Tailscale checks. Never use `curl -k` as a solution.
3. Enter a WSS/HTTPS root URL or `/ws/detect`, without credentials or query parameters. Remote hosts must end with `.ts.net`. Plain WS is reserved for loopback port 8000. Verify the selected port is private Serve, not Funnel.
4. A successful health request with failed WebSocket handshake often indicates an Origin rejection. The log prints the exact rejected origin. Set an explicit allowlist in `.env`, including `tauri://localhost` for the Mac app or the exact browser development origin, then restart. Do not replace it with `*` or `null`.
5. Close another connected client. Only one session is supported; other clients receive `unavailable`. A previous timed-out inference may still own the worker until it finishes. Inspect logs before restarting the service.

The client retries temporary interruptions at bounded intervals. Click Disconnect to cancel retries. Protocol/policy errors require a corrected URL/configuration or matching client/server version and a manual Connect.

## Camera does not start

Use a secure context: packaged app, localhost, or HTTPS. Check macOS camera permission for Vision Studio (or the browser), quit other apps that own the camera, reconnect external hardware, and select a currently available device. Camera device names may appear only after the first permission grant. The app requests video only. If the operating system stops a track, restart it using Start camera.

The default request is ideal 1280×720/30, not a promise that every camera supports it. The camera output header shows actual video dimensions. If a `tauri dev` process lacks the expected permission identity, test the debug `.app` bundle or browser mode; see [macOS setup](macos-setup.md).

## Boxes are absent, stale, or misaligned

Boxes require a connected backend, an active camera, and a result younger than two seconds. The preview can work with no backend. Start with the default confidence; lower it if the scene has uncertain objects. Check the loaded vocabulary, inference errors, and readiness on the machine running the backend.

When frames take over two seconds, detections are discarded to avoid drawing old positions over current video. Select **Live** to use 320×180 frames, 320-pixel inference, and continuous sampling up to 10 FPS. Reducing target FPS does not shorten a model call; only one frame runs at a time. Reading age shows the capture-to-now delay. A steady preview with slow inference remains smooth. Inference FPS is measured from received usable results, not inferred from the target setting.

The client always transmits the unmirrored video and applies mirroring only while displaying it. If extending the capture pipeline, do not mirror twice or stretch the JPEG independently of the source. Use `detectionToCanvas` and its tests to preserve letterbox offsets. Detections lag moving subjects by the measured frame latency; there is no tracker/prediction that can eliminate this lag.

## Slow startup or model errors

Prepare models explicitly on the backend machine, using `.venv/bin/python scripts/prepare_model.py` on Linux or `.venv-mac/bin/python scripts/prepare_model.py` on the Mac after installing the preparation requirements. Verify `.env` paths relative to `backend`, and ensure the process user can read the files. First inference provider initialization happens during startup; it may take time. Weights are never downloaded by the service. The test suite does not prove real model availability.

Do not install both `opencv-python` and `opencv-python-headless` into the same venv. Use the headless Ultralytics distribution in this project's requirements. Recreate a dedicated venv if an unrelated environment contains conflicting OpenCV packages. On Linux, use the official CPU wheel index to avoid unnecessary CUDA libraries; on macOS, use the native pip installation in [Mac-only setup](macos-local.md). Use the selected venv's explicit interpreter. For a fresh environment, use Python 3.12 on Linux or 3.12/3.13 on the Mac; avoid accidentally creating it with a newer system Python that lacks compatible wheels.

An OpenVINO error may reflect unsupported operators, incompatible runtime versions, or a static-shape export. Re-export dynamically on Linux with compatible packages, verify the benchmark, and fall back to CPU if needed. Keep `YOLO_AUTOINSTALL=false` so a missing export dependency produces a visible error instead of an unexpected install.

## Service fails or uses too many resources

Run `systemd-analyze verify` on the generated unit before installation. Check that its user, working directory, venv path, and model permissions are correct. The interpreter path must point inside `.venv` and must not resolve the Python symlink to the system interpreter. Store the checkout on a boot-mounted local filesystem; an encrypted home mounted only on desktop login would defeat independent boot startup.

Inspect memory pressure, process exit reason, logs, and service resource limits. A native call that hangs cannot be safely killed per thread; stop/restart the service to recover the process. The service's stop timeout provides a final process termination boundary. Avoid changing other service units or network routes while investigating Vision Studio.

## Settings do not persist

Settings use localStorage scoped to the app/browser origin. Private browsing or storage restrictions can prevent persistence; the UI reports this while keeping in-memory settings usable. Browser and desktop settings are separate. Device IDs, credentials, frames, and detections are not written to storage. Reset inference settings restores defaults and preserves the current backend URL.

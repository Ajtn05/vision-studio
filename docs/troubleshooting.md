# Troubleshooting

## Connection does not become connected

1. On Linux, `curl http://127.0.0.1:8000/health` must work and report `model_ready:true`. Check `journalctl -u vision-studio.service -n 100 --no-pager` or foreground logs. A model failure leaves the API available but rejects detection sessions.
2. From the Mac, `tailscale status` should show the server reachable; `curl 'https://<actual-serve-hostname>:8443/health'` must succeed with normal certificate verification. Check the hostname and port printed by `tailscale serve status`, tailnet access policies, HTTPS certificates, and MagicDNS. Never use `curl -k` as a solution.
3. Enter a WSS/HTTPS root URL or `/ws/detect`, without credentials or query parameters. Remote hosts must end with `.ts.net`. Plain WS is reserved for loopback port 8000. Verify the selected port is private Serve, not Funnel.
4. A successful health request with failed WebSocket handshake often indicates an Origin rejection. The log prints the exact rejected origin. Set an explicit allowlist in `.env`, including `tauri://localhost` for the Mac app or the exact browser development origin, then restart. Do not replace it with `*` or `null`.
5. Close another connected client. Only one session is supported; other clients receive `unavailable`. A previous timed-out inference may still own the worker until it finishes. Inspect logs before restarting the service.

The client retries temporary interruptions at bounded intervals. Click Disconnect to cancel retries. Protocol/policy errors require a corrected URL/configuration or matching client/server version and a manual Connect.

## Camera does not start

Use a secure context: packaged app, localhost, or HTTPS. Check macOS camera permission for Vision Studio (or the browser), quit other apps that own the camera, reconnect external hardware, and select a currently available device. Camera device names may appear only after the first permission grant. The app requests video only. If the operating system stops a track, restart it using Start camera.

The default request is ideal 1280×720/30, not a promise that every camera supports it. The camera output header shows actual video dimensions. If a `tauri dev` process lacks the expected permission identity, test the debug `.app` bundle or browser mode; see [macOS setup](macos-setup.md).

## Boxes are absent, stale, or misaligned

Boxes require a connected backend, an active camera, and a result younger than two seconds. The preview can work with no backend. Start with the default confidence; lower it if the scene has uncertain objects. YOLO recognizes its pretrained classes, not arbitrary items. Check inference errors and the model's readiness on Linux.

When frames take over two seconds, detections are deliberately discarded to avoid drawing old positions over current video. Lower resolution to 320×180, lower sampling FPS, and compare CPU/OpenVINO on the server. A steady preview with slow inference is expected to remain smooth. Inference FPS is measured from received usable results, not inferred from the target setting.

The client always transmits the unmirrored video and applies mirroring only while displaying it. If extending the capture pipeline, do not mirror twice or stretch the JPEG independently of the source. Use `detectionToCanvas` and its tests to preserve letterbox offsets. Detections lag moving subjects by the measured frame latency; there is no tracker/prediction that can eliminate this lag.

## Slow startup or model errors

Run `python scripts/prepare_model.py` explicitly on Linux, verify `.env` paths relative to `backend`, and ensure the service user can read the files. First inference provider initialization happens during startup; it may take time. Weights are never downloaded by the service. The test suite does not prove real model availability.

Do not install both `opencv-python` and `opencv-python-headless` into the same venv. Use the headless Ultralytics distribution in this project's requirements. Recreate a dedicated venv if an unrelated environment contains conflicting OpenCV packages. CPU PyTorch should come from the official CPU wheel index to avoid unnecessary CUDA libraries. Python versions newer than supported wheels can fail installation; use Python 3.10–3.12.

An OpenVINO error may reflect unsupported operators, incompatible runtime versions, or a static-shape export. Re-export dynamically on Linux with compatible packages, verify the benchmark, and fall back to CPU if needed. Keep `YOLO_AUTOINSTALL=false` so a missing export dependency produces a visible error instead of an unexpected install.

## Service fails or uses too many resources

Run `systemd-analyze verify` on the generated unit before installation. Check that its user, working directory, venv path, and model permissions are correct. The interpreter path must point inside `.venv` and must not resolve the Python symlink to the system interpreter. Store the checkout on a boot-mounted local filesystem; an encrypted home mounted only on desktop login would defeat independent boot startup.

Inspect memory pressure, process exit reason, logs, and service resource limits. A native call that hangs cannot be safely killed per thread; stop/restart the service to recover the process. The service's stop timeout provides a final process termination boundary. Avoid changing other service units or network routes while investigating Vision Studio.

## Settings do not persist

Settings use localStorage scoped to the app/browser origin. Private browsing or storage restrictions can prevent persistence; the UI reports this while keeping in-memory settings usable. Browser and desktop settings are separate. Device IDs, credentials, frames, and detections are not written to storage. Reset inference settings restores defaults and preserves the current backend URL.

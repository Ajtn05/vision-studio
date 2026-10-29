# Linux backend and optional systemd service

## Prepare an isolated CPU environment

This guide covers Linux dependencies and service management. The Linux backend
can serve a browser client on any operating system, or run on the client
computer itself. See [setup](SETUP.md) to choose a deployment.

Clone or copy the project into a directory of your choice as your normal Linux user. Replace `/path/to/vision-studio` below with that checkout location. Use Python 3.12. If `venv` is missing on Mint/Ubuntu, install the venv package matching that Python version through your normal package-management process. No NVIDIA driver installation or desktop login is needed.

```bash
cd /path/to/vision-studio/backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
python -m pip install -r requirements-vocabulary.txt
cp .env.example .env
python scripts/prepare_model.py
python -m app
```

The official headless Ultralytics distribution provides the same `ultralytics` import while using OpenCV without GUI libraries. See [headless installation](https://docs.ultralytics.com/quickstart/#headless-server-installation). Default preparation downloads `yoloe-26n-seg.pt` and bakes in 1,203 LVIS object categories as `yoloe-26n-lvis.pt`. Install `requirements-vocabulary.txt` first; its tokenizer and the downloaded text encoder are used only during preparation. Standard YOLO11/YOLO26 and the higher-capacity YOLOE small variant are explicit options; see [detection quality and speed](detection-quality.md). Existing `.env` files retain their model path. No model is downloaded at boot. Only load weights from a trusted source.

`python -m app` reads `.env`, binds `127.0.0.1:8000`, sets one worker, enforces message limits and transport flow control, and disables redundant compression. Do not use `--workers 2`, `0.0.0.0`, or an auto-reloader for the deployed service. Readiness failures appear in logs; `/health` still returns availability and `model_ready:false`.

Check locally:

```bash
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/api/info
```

Both should report `model_ready:true` after startup. `.env` controls provider, local model path, CPU threads, allowed origins, and timeouts. Paths are relative to `backend` unless explicitly configured otherwise. Environment variables override `.env`. The backend uses trusted local configuration; clients cannot submit a model path.

## Private Tailscale Serve, preserving existing routes

Use this section when the Linux backend serves an external client. These commands run on the backend computer; this project does not change Tailscale automatically. Tailscale must already be installed and connected on both machines. HTTPS certificates/MagicDNS must be configured for your tailnet, and access policies must permit the client to reach the chosen server port.

First inspect and save existing state. Replace the backup path below with a
location of your choice outside the repository:

```bash
tailscale status
tailscale serve status
tailscale funnel status
tailscale serve status --json > /path/to/tailscale-serve-before.json
```

Choose an unused HTTPS port, for example 8443. **Stop if that port has any existing Serve/Funnel handler.** A root route on an occupied port can replace another service's handler, and a Funnel-enabled port can expose routes publicly. Leave Jellyfin and other ports/paths untouched. Do not run `tailscale serve reset` or any Funnel command that enables exposure.

After confirming 8443 is unused:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:8000
tailscale serve status
tailscale funnel status
```

Add `sudo` only if your Tailscale installation requires it. `--bg` persists the route through tailscaled. Use the exact `.ts.net` hostname printed in the command output; do not guess one from the Linux desktop hostname. From the client computer, open the health URL in a browser or test with curl:

```bash
curl --fail 'https://<the-hostname-from-serve>:8443/health'
```

Then use `wss://<the-hostname-from-serve>:8443` in the app. Replace the angle-bracket placeholder with the printed hostname. HTTPS and WSS use the same port and path routing; Serve proxies the WebSocket upgrade. Keep certificate verification enabled. If HTTPS setup prompts for tailnet administrator action, finish that action through Tailscale's normal flow. See the official [Serve command reference](https://tailscale.com/docs/reference/tailscale-cli/serve) and [Serve overview](https://tailscale.com/docs/features/tailscale-serve).

To remove only this service later, after verifying it is still the sole route you added on that port, run `tailscale serve --https=8443 off`. Do not reset all routes. Preserve and re-check existing configuration before any change. Tailnet membership/access rules are the authentication boundary in this MVP; origin checks are an additional browser control, not user authentication. Do not use Funnel or publish the backend publicly.

## Origin allowlist

For the packaged Mac client, keep `tauri://localhost` in `VISION_ALLOWED_ORIGINS`. For browser development, include exactly `http://127.0.0.1:1420` and/or `http://localhost:1420`, according to the URL you open. Remove development origins from production if unused. WebSocket origins are checked explicitly; HTTP CORS alone does not protect WebSockets.

The default rejects missing and `null` origins. Native diagnostic clients can set an explicit allowed Origin header. `VISION_ALLOW_MISSING_ORIGIN=true` is a deliberate option for trusted non-browser tools and should normally stay false. Wildcards are rejected in configuration. HTTP GET CORS supports only the configured origins and does not permit credentials.

## Boot service

Stop the foreground backend with Ctrl-C before installing the service. The renderer substitutes your ordinary user and the current absolute checkout paths; it only writes to standard output and never installs or starts anything.

```bash
cd /path/to/vision-studio
python3 deployment/render_service.py > /tmp/vision-studio.service
cat /tmp/vision-studio.service
systemd-analyze verify /tmp/vision-studio.service
sudo install -m 0644 /tmp/vision-studio.service /etc/systemd/system/vision-studio.service
sudo systemctl daemon-reload
sudo systemctl enable --now vision-studio.service
systemctl status vision-studio.service --no-pager
journalctl -u vision-studio.service -n 100 --no-pager
```

After changing `.env` or updating code:

```bash
sudo systemctl restart vision-studio.service
journalctl -u vision-studio.service -f
```

The system service runs as your ordinary user, with an explicit venv interpreter, no graphical target dependency, and only loopback networking. It restarts on process failure and starts at boot. It does not depend on or change SSH, Jellyfin, or Tailscale. Conservative CPU, memory, task, and scheduling limits reduce competition on an 8 GB server. Adjust those limits only after measuring resource use. The writable state/cache directories are managed by systemd; the checkout and home remain read-only. A degraded model does not terminate the process, so check `model_ready` and logs after every deployment.

## Optional OpenVINO and benchmarking

CPU is the baseline. The MX110's presence is not proof of compatible CUDA or better performance. This project never selects CUDA or installs drivers.

On Linux, explicitly install OpenVINO and export a dynamic model in the same venv:

```bash
cd /path/to/vision-studio/backend
source .venv/bin/activate
python -m pip install 'openvino>=2024.6,<2027'
python scripts/prepare_model.py --model yolo11n.pt --openvino
```

Dynamic export allows the resolution selector to keep working. No INT8 calibration dataset is downloaded. If the installed Ultralytics exporter requires another package, install the named compatible dependency explicitly; automatic dependency installation is disabled. See the official [OpenVINO integration](https://docs.ultralytics.com/integrations/openvino/).

Use a representative local JPEG you own, with the same CPU thread setting and resolution for both runs:

```bash
python scripts/benchmark.py /path/to/local-test.jpg --model models/yolo11n.pt --provider cpu --runs 30
python scripts/benchmark.py /path/to/local-test.jpg --model models/yolo11n_openvino_model --provider openvino --runs 30
```

The script prints median/p95 elapsed detector durations after warmup, never canned numbers. It excludes network and camera costs. OpenVINO manages its own internal threads; the service CPU quota remains a useful ceiling. Also compare full-session FPS, frame latency, memory (`systemctl status`, `top`), and Jellyfin playback under normal concurrent load. Check label/box quality on the same scenes. Keep CPU if it is more stable.

To select the exported provider, edit `.env` to `VISION_PROVIDER=openvino` and `VISION_MODEL_PATH=models/yolo11n_openvino_model`, then restart and verify `model_ready` and `provider`. Switching back requires only restoring `cpu` and `models/yolo11n.pt`. The protocol remains unchanged.

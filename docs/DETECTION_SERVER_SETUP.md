# External server and client

Run the inference backend on an external computer and connect a browser client
through private Tailscale WSS. Client and server are roles; their operating
systems can differ. Use the [quick start](../README.md#quick-start) for Linux,
macOS, or Windows dependency commands. The [setup overview](SETUP.md) also
covers a backend on the client computer.

```text
Client browser -- private WSS / Tailscale --> External server --> Inference
  camera, preview, controls                    FastAPI, local model weights
```

## Example paths and addresses

Replace the placeholders before running commands:

| Placeholder | Meaning |
| --- | --- |
| `/path/to/vision-studio` | Your repository location on the machine running the command; use your own path and shell syntax on Windows |
| `<server-ssh-host>` | Your server's SSH address or configured alias, if using SSH |
| `<server-hostname>` | The `.ts.net` hostname printed by Tailscale Serve on the server |

| Component | Location | Address |
| --- | --- | --- |
| Inference backend | External server | `127.0.0.1:8000` on the server |
| Private Tailscale Serve route | External server | HTTPS/WSS port `8443`, forwarding to backend port `8000` |
| Browser client | Client computer | `http://127.0.0.1:1420` in development mode |

The complete application is in the repository. Keep native environments, `.env`,
and model files on their own computer. The client needs no inference packages.
The backend does not need a webcam or a desktop login to process client frames.

## 1. Prepare or update the backend

Open a terminal on the server, directly or through SSH if configured:

```sh
ssh '<server-ssh-host>'
```

Clone the repository on that server and follow its operating system's backend
[quick-start commands](../README.md#2-prepare-the-backend-for-your-operating-system).
For an update, deploy the matching source revision and install requirements
only when they change. Reuse a working environment and preserve `.env`.

Prepare the selected weights on the server, or transfer an already-prepared
`.pt` file from another computer into `backend/models`. Prepared weights can be
reused across machines; native Python environments and packages cannot. See
[detection quality and speed](detection-quality.md) for broad-vocabulary setup,
model choices, and one-time preparation dependencies. Normal startup performs
no downloads.

To select the broad model, edit these values in the server's `backend/.env`,
preserving its other settings:

```dotenv
VISION_MODEL_PATH=models/yoloe-26n-lvis.pt
VISION_PROVIDER=cpu
VISION_CPU_THREADS=2
VISION_NMS_IOU=0.5
```

Copying source or weights alone does not change an existing model selection.
The original 80-class model can be selected with
`VISION_MODEL_PATH=models/yolo11n.pt` if its weights are present.

## 2. Run and verify the backend

From the server's `backend` directory, use its environment's interpreter:

| Server system | Start command |
| --- | --- |
| Linux | `.venv/bin/python -m app` |
| macOS | `.venv-mac/bin/python -m app` |
| Windows PowerShell | `.\.venv\Scripts\python.exe -m app` |

Keep the process running. These commands bind to `127.0.0.1:8000`, use one
worker, and enforce the project's WebSocket limits. After changing code,
packages, or `.env`, stop the foreground process with Ctrl-C and restart it.
If a service manages the process, restart that service instead. An optional
systemd service is described in [Linux setup](linux-setup.md#boot-service).

On the server, open `http://127.0.0.1:8000/health` and
`http://127.0.0.1:8000/api/info`, or request them with your terminal's HTTP tool.
Expect `model_ready: true`. For the broad object model, info should also show
`model_name: "yoloe-26n-lvis.pt"`, `provider: "cpu"`, and `class_count: 1203`.
Check startup logs and `.env` if the model is unavailable or unexpected.

### Alternative backend port

If another service occupies server port 8000, use an available port such as
8001. From `backend`, replace `python` below with the interpreter from the table
above and run this as one line in your shell:

```sh
python -m uvicorn app.main:app --env-file .env --host 127.0.0.1 --port 8001 --workers 1 --ws websockets-sansio --ws-max-size 1048576 --ws-per-message-deflate false --timeout-graceful-shutdown 20
```

Then use 8001 in server health checks and the Serve proxy target below. The
external client URL still uses the chosen Serve port, such as 8443. A backend
on the client computer must use loopback port 8000 with the current client.

## 3. Configure or verify private Tailscale Serve

Install and connect [Tailscale](https://tailscale.com/docs/install) on both
computers. HTTPS/MagicDNS and tailnet access rules must permit the client to
reach the chosen server port. Ensure the Tailscale CLI is available on the
server. On Windows, run Serve commands in an administrator terminal; on
Linux or macOS, add `sudo` only if your installation requires it. See the
[Tailscale Serve examples](https://tailscale.com/docs/reference/examples/serve).

Inspect the server's existing configuration:

```sh
tailscale status
tailscale serve status
tailscale funnel status
```

Save the JSON output of `tailscale serve status --json` to a backup file outside
the repository before changing routes. If HTTPS port 8443 already proxies
privately to the intended backend, reuse it. An application restart does not
require recreating the route. If 8443 has any other Serve or Funnel handler,
choose another unused HTTPS port and use it consistently in the client URL.
Preserve unrelated routes.

Only when 8443 is unused, create the private route on the server:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:8000
tailscale serve status
tailscale funnel status
```

Use `http://127.0.0.1:8001` as the target if you chose the alternative backend
port. Use the exact `.ts.net` hostname printed by Serve for
`<server-hostname>`. The client currently requires private Tailscale WSS for
external backends. Keep certificate verification enabled. See the
[Tailscale Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

With the backend running, open these URLs from the client computer and confirm
readiness:

```text
https://<server-hostname>:8443/health
https://<server-hostname>:8443/api/info
```

A route created with `--bg` persists after application terminals close. Keep
Tailscale connected on both computers and start the backend separately.

## 4. Connect the browser client

From the repository root on the client computer, in Bash, Zsh, or PowerShell:

```sh
cd frontend
npm ci
npm run dev
```

Install dependencies on first use or after the lockfile changes. Open
`http://127.0.0.1:1420`, enter `wss://<server-hostname>:8443` in **Backend URL**,
and click **Connect**. Confirm the intended model and provider before clicking
**Start camera** and granting access. The client appends `/ws/detect`
automatically. The camera and preview remain on the client computer.

For browser development, the server's `VISION_ALLOWED_ORIGINS` must include
`http://127.0.0.1:1420` and/or `http://localhost:1420`, matching the page you
open. A hosted browser client needs HTTPS and its exact origin in the allowlist;
ordinary LAN HTTP cannot access the camera. The optional macOS desktop client
uses `tauri://localhost`. These development/desktop origins are included in the
example configuration. Restart the backend after editing `.env`.

## Switch to a local backend or finish

To run inference on the client computer instead, follow
[local backend setup](SETUP.md#client--local-backend), click **Disconnect**, and
change **Backend URL** to `ws://127.0.0.1:8000` before reconnecting. The app saves
this URL, so check it when switching deployments. Each backend has independent
model selection and configuration.

Stop the camera and disconnect when finished. Ctrl-C stops a foreground client
or backend process. A saved Serve route can remain present while its backend
is stopped; verify model readiness when starting the next session.

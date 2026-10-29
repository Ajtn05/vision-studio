# Vision Studio setup: client and backend

The **client** owns the camera, preview, controls, and overlays. The **backend**
runs inference. Browser mode uses the same application on Linux, macOS, and
Windows; the client and backend can use different operating systems.

Choose where the backend runs:

| Deployment | Camera and interface | Inference | Backend URL in the client |
| --- | --- | --- | --- |
| Client + external server | Client computer | Another computer | `wss://<server-hostname>:8443` |
| Client + local backend | Client computer | Same computer | `ws://127.0.0.1:8000` |

Replace `<server-hostname>` with the `.ts.net` hostname printed by Tailscale
Serve on the server. The current client accepts external backends through
private Tailscale WSS. A local backend needs no Tailscale connection.

## First-time setup by operating system

Clone the repository into a directory of your choice on each computer that
runs source. Only the backend computer needs Python, weights, and inference
dependencies. Running or building the web client locally needs Node.js 22.12+;
viewing an already-hosted client needs only a compatible browser.

Use the backend computer's operating system to select the quick-start commands:

| System | Backend quick start | Additional instructions |
| --- | --- | --- |
| Linux | [Linux commands](../README.md#linux-bash) | [Linux packages and systemd service](linux-setup.md) |
| macOS | [macOS commands](../README.md#macos-zsh-or-bash) | [macOS backend environment](macos-local.md) |
| Windows | [PowerShell commands](../README.md#windows-powershell) | Use the venv interpreter directly; no activation script is required |

The [browser client commands](../README.md#4-start-the-browser-client-linux-macos-or-windows)
are the same on all three systems. Linux and macOS validation is recorded in
[verification](verification.md); Windows instructions still need an end-to-end
project check. The optional desktop bundle is configured for macOS separately.

In shell examples, replace `/path/to/vision-studio` with your checkout location.
Windows uses its own checkout path, such as `C:\path\to\vision-studio`. Keep
virtual environments and `.env` files on the machine where they are used.

## Client + external server

Complete [external server setup](DETECTION_SERVER_SETUP.md) once. For everyday
use, start the backend from that server's `backend` directory with the command
for its operating system:

| Backend system | Start command |
| --- | --- |
| Linux | `.venv/bin/python -m app` |
| macOS | `.venv-mac/bin/python -m app` |
| Windows PowerShell | `.\.venv\Scripts\python.exe -m app` |

These commands use loopback port 8000. If another server process needs that
port, the external server guide explains how to use an alternative backend
port. Keep its health checks and Serve target consistent. A port on the server
does not conflict with the same port on the client computer.

Keep the backend running and verify its health. Reuse the private Serve route
if it already points to the right backend; an application restart does not
require recreating the route. Both computers need to be connected to the
appropriate tailnet with access to the chosen Serve port.

On the client computer, start the browser client using the commands below.
Connect to `wss://<server-hostname>:8443`, then start the camera.

## Client + local backend

Complete the quick start for your operating system once. Start the backend
from `backend` using the start-command table above. It binds to
`127.0.0.1:8000`; this port must be free on the client computer. The current
client requires port 8000 for a loopback backend.

Keep the backend terminal open. In a separate terminal on the same computer,
start the browser client using the commands below. Connect to
`ws://127.0.0.1:8000`, then start the camera. This runs real local CPU inference.

The backend reads model selection and other settings from `backend/.env`.
Preserve existing values when updating source. To select the broad vocabulary,
set `VISION_MODEL_PATH=models/yoloe-26n-lvis.pt`, ensure the prepared file exists,
and restart the backend. See [model setup](detection-quality.md).

## Start the browser client

From the repository root on the client computer, in Bash, Zsh, or PowerShell:

```sh
cd frontend
npm ci
npm run dev
```

Run `npm ci` on first use or after the lockfile changes. Open
`http://127.0.0.1:1420`, enter the chosen **Backend URL**, click **Connect**,
then **Start camera** and allow access. The camera belongs to the client
computer, regardless of where inference runs.

The dev server listens on loopback. Opening the page over ordinary LAN HTTP
does not provide a secure camera context. A hosted browser client needs HTTPS
and its exact page origin in the backend's `VISION_ALLOWED_ORIGINS`; a WSS
backend alone does not make an HTTP page secure. See
[browser camera requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).

On the backend computer, open `/health` and `/api/info` at
`http://127.0.0.1:8000`. Check `model_ready: true` and the intended loaded model.
For the default object model, info should include
`model_name: "yoloe-26n-lvis.pt"` and `class_count: 1203`.

## Switch deployments or use the desktop app

Click **Disconnect**, replace **Backend URL**, then **Connect** again. The app
saves the URL, so check it when switching between an external and local backend.
The loaded model, provider, and vocabulary identify the backend you reached.

For the optional macOS desktop app, use [desktop setup](macos-setup.md).
Stop standalone Vite before running `npm run tauri -- dev` from `frontend`;
both commands use frontend port 1420. The native bundle contains the client,
so keep the selected backend running separately.

Use **Live** for responsiveness, **Balanced** for a middle ground, and **Detail**
for more source pixels at higher processing cost. See [detection quality and
speed](detection-quality.md). A preset does not switch the backend or model.

Stop the camera and disconnect when finished. Ctrl-C stops a foreground client
or backend process. A saved Tailscale Serve route persists after the backend
stops; its presence does not establish backend readiness.

## Automated and synthetic tests

[Verification](verification.md) covers unit tests, the synthetic streaming
fixture, and real-camera acceptance checks. Model-free tests and synthetic
detections are separate from real inference with a local or external backend.

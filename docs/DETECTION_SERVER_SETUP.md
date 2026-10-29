# Detection backend on Linux Mint, app on Mac

Use this guide to run the Vision Studio backend on Linux and connect the Mac
client through private Tailscale WSS. Clone the repository into a directory of
your choice on each machine.

This is the **Mac + server** path. For both programs on the Mac, use
[Mac-only testing](macos-local.md). The [setup overview](SETUP.md) has short
everyday startup commands for both modes. Complete steps 1–2 below for a fresh
installation or an update; steps 3–5 are the normal server testing flow.

## Example paths and addresses

Replace the placeholders before running commands:

| Placeholder | Meaning |
| --- | --- |
| `/path/to/vision-studio` | Your repository location on the machine running the command; the Mac and Linux locations can differ |
| `<server-ssh-host>` | Your Linux server's SSH address or configured SSH alias |
| `<server-hostname>` | The `.ts.net` hostname printed by Tailscale Serve on Linux |

The complete frontend, backend, Tauri shell, tests, and documentation live in
the repository. Each machine keeps its own virtual environment, configuration,
and model files. This guide uses backend port **8001**, which can be useful
when another service occupies 8000. The [fresh Linux guide](linux-setup.md)
uses 8000; keep the chosen backend port consistent throughout your setup.

| Component | Machine | Address |
| --- | --- | --- |
| Detection model and FastAPI/WebSocket server | Linux Mint | `127.0.0.1:8001` on the server |
| Private Tailscale Serve route | Linux Mint | HTTPS/WSS port `8443`, forwarding to server port `8001` |
| Complete frontend | Mac | `http://127.0.0.1:1420` in browser development mode |

The example connection is:

```text
Mac client -- WSS over Tailscale --> Linux server:8443 --> FastAPI:8001
```

After configuring Serve, use this **Backend URL** with your server hostname:

```text
wss://<server-hostname>:8443
```

The app appends `/ws/detect` automatically. Keep Tailscale connected on both
machines. A Serve route created with `--bg` persists after the application
terminals close; the detection backend still needs to be running.

## 1. Copy matching backend changes (Mac end)

Clone the repository on Linux before the first transfer. Run on the Mac to
copy backend updates, replacing the destination path with the Linux checkout
location:

```sh
cd /path/to/vision-studio
rsync -av --exclude='.venv*/' --exclude='__pycache__/' \
  --exclude='.env' --exclude='models/' \
  backend/ '<server-ssh-host>:/path/to/vision-studio/backend/'
```

The server keeps its own virtual environment, configuration, and model files.

For the broader YOLOE vocabulary and independent inference-size control, copy
the updated source, then follow [detection quality and speed](detection-quality.md)
on Linux to prepare the selected weights and change `VISION_MODEL_PATH` in the
existing `.env`. Restart the detection process after the update. Copying source
alone preserves the previously selected model. The updated Mac client also
continues to connect to older backends, with separate inference-size control
disabled until the backend is upgraded.

## 2. Prepare dependencies if needed (Linux server end)

From a Mac terminal, open the server session with `ssh '<server-ssh-host>'`.
Run the following **inside that Linux session** for a new backend environment.
Use Python 3.12; if a working `.venv` already exists, skip its creation and
update packages only when requirements have changed:

```sh
cd /path/to/vision-studio/backend
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements.txt
```

For an existing `.venv`, only update packages when requirements have changed.
Create `.env` only if it does not already exist:

```sh
if [ ! -f .env ]; then cp .env.example .env; fi
```

### Choose how to obtain the prepared model

**If the model is already prepared on the Mac:** run these commands in a
**Mac terminal**, outside the SSH session, using the Linux checkout location
for both remote paths:

```sh
cd /path/to/vision-studio
ssh '<server-ssh-host>' 'mkdir -p /path/to/vision-studio/backend/models'
scp backend/models/yoloe-26n-lvis.pt \
  '<server-ssh-host>:/path/to/vision-studio/backend/models/'
```

Prepared `.pt` weights can be reused on both machines. Keep native Python
environments and installed packages on their own machine. Copying this prepared
file avoids installing the text encoder/tokenizer on Linux.

**Alternatively, prepare on Linux:** from the backend directory in the
**Linux SSH session**:

```sh
.venv/bin/python -m pip install -r requirements-vocabulary.txt
.venv/bin/python scripts/prepare_model.py
```

Preparation writes `models/yoloe-26n-lvis.pt`; later starts reuse that file.
The one-time preparation downloads are described in
[detection quality and speed](detection-quality.md).

In the **Linux SSH session**, edit `backend/.env` in your Linux checkout.
Preserve its other values and set these entries to select the broad model
persistently:

```dotenv
VISION_MODEL_PATH=models/yoloe-26n-lvis.pt
VISION_PROVIDER=cpu
VISION_CPU_THREADS=2
VISION_NMS_IOU=0.5
```

Keep the existing explicit origins for the browser and desktop app. To test
the original 80-class model instead, set `VISION_MODEL_PATH=models/yolo11n.pt`.
Copying source or weights alone does not change an existing `.env` selection.

## 3. Run the detection backend (Linux server end)

Run **inside the Linux SSH session**, from the backend directory:

```sh
cd /path/to/vision-studio/backend
.venv/bin/python -m uvicorn app.main:app --env-file .env \
  --host 127.0.0.1 --port 8001 --workers 1 \
  --ws websockets-sansio --ws-max-size 1048576 \
  --ws-per-message-deflate false --timeout-graceful-shutdown 20
```

Keep the session running. If the detection backend is already healthy, reuse it.
After changing code, dependencies, or `.env`, stop your foreground process with
Ctrl-C and start it again. If a service manages the process, use that service's
restart procedure instead of starting a second process on the same port.
In another **Linux server session**, verify:

```sh
curl --fail http://127.0.0.1:8001/health
curl --fail http://127.0.0.1:8001/api/info
```

Both responses should report `model_ready: true`.
For the expanded model, `/api/info` should also show
`model_name: "yoloe-26n-lvis.pt"`, `provider: "cpu"`, and `class_count: 1203`.
If readiness is false or the old model is shown, check this Linux terminal's
startup logs and `.env` before opening the camera.

## 4. Configure or verify the private Serve route (Linux server end)

Inspect the existing configuration **inside a Linux SSH session**. Save a local
backup outside the repository, replacing the backup path below with a location
of your choice:

```sh
tailscale serve status
tailscale funnel status
tailscale serve status --json > /path/to/tailscale-serve-before.json
```

If HTTPS port 8443 already proxies privately to `http://127.0.0.1:8001`, reuse
the route. A normal application restart does not require recreating it. If
8443 has any other Serve or Funnel handler, choose another unused HTTPS port
and use that port consistently in the client URL. Preserve unrelated routes.

Only when 8443 is unused, create the private route on Linux:

```sh
tailscale serve --bg --https=8443 http://127.0.0.1:8001
tailscale serve status
tailscale funnel status
```

Add `sudo` only if your Tailscale installation requires it. Use the exact
`.ts.net` hostname printed by Serve for `<server-hostname>`. This adds the
detection backend for devices permitted by your tailnet access rules. See the
[Tailscale Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

With the backend running, verify from the **Mac**:

```sh
curl --fail 'https://<server-hostname>:8443/health'
curl --fail 'https://<server-hostname>:8443/api/info'
```

## 5. Connect the complete app (Mac end)

Install frontend dependencies with `npm ci` from `frontend` on first use or
after its lockfile changes.

Use the existing desktop app, or run browser development mode from the complete
checkout on the Mac:

```sh
cd /path/to/vision-studio/frontend
npm run dev
```

Open `http://127.0.0.1:1420`, enter
`wss://<server-hostname>:8443` in **Backend URL**, and click **Connect**.
The app should display the ready model and provider before starting the camera.
For desktop development, stop standalone Vite and
run `npm run tauri -- dev` instead; keep the Linux backend running separately.

For browser mode, configure the server's `VISION_ALLOWED_ORIGINS` to include
`http://127.0.0.1:1420` and `http://localhost:1420`. The desktop app uses
`tauri://localhost`, also included in the example configuration. Keep
these exact origins when editing `.env`, and restart the backend after changes.

## Switch to Mac-only testing or finish

To test without the server, start the [local Mac backend](macos-local.md),
click **Disconnect**, and change **Backend URL** to `ws://127.0.0.1:8000` before
connecting again. The URL is saved, so check it when returning to server mode.
Mac port 8000 and Linux port 8000 are on different machines; only the local
machine's port can conflict with its own processes.

Stop the camera and disconnect at the end of a test. Ctrl-C stops a foreground
frontend/backend. The saved Tailscale Serve route continues to exist; its
presence does not mean the detection backend is running.

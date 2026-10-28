# Detection backend on Linux Mint, app on Mac

Use this guide for the existing Vision Studio deployment with a **Backend URL**
field and a detection WebSocket. The complete application is now in the Git
checkout at `~/CS/Computer-Vision`.

## Locations

All project source on this Mac is in one directory:

| Location | Contents |
| --- | --- |
| `~/CS/Computer-Vision` | Complete detection frontend, backend, Tauri shell, tests, and documentation |

The matching complete backend has been copied to
`~/vision-studio-detection-test/backend` on `mint-server`. Its dependencies and
YOLO model are installed in that server directory. The earlier diagnostic API
on the server uses port 8000; the detection backend uses **8001** for this
deployment. The generic fresh-install guide uses port 8000 instead.

| Component | Machine | Address |
| --- | --- | --- |
| Detection model and FastAPI/WebSocket server | Linux Mint | `127.0.0.1:8001` on the server |
| Private Tailscale Serve route | Linux Mint | HTTPS/WSS port `8443`, forwarding to server port `8001` |
| Complete frontend | Mac | `http://127.0.0.1:1420` in browser development mode |

The configured connection is:

```text
Mac client -- WSS over Tailscale --> mint-server:8443 --> FastAPI:8001
```

The approved **Backend URL** is:

```text
wss://mint-server.tail439626.ts.net:8443
```

The private Serve route has been verified to point to the detection backend on
port 8001. It was configured in background mode, so closing the backend and
frontend terminals does not remove the route. Keep Tailscale running on both
machines and restart the applications as described below.

The app appends `/ws/detect` automatically. Keep Tailscale connected on both
machines. The earlier diagnostic SSH tunnel and `http://127.0.0.1:8000` are
separate from this connection.

## 1. Copy matching backend changes (Mac end)

Run on the Mac when updating the complete application's backend:

```sh
VISION_APP_CHECKOUT="$HOME/CS/Computer-Vision"
rsync -av --exclude='.venv*/' --exclude='__pycache__/' \
  --exclude='.env' --exclude='models/' \
  "$VISION_APP_CHECKOUT/backend/" mint-server:vision-studio-detection-test/backend/
```

The server keeps its own virtual environment, configuration, and model files.

## 2. Prepare dependencies if needed (Linux server end)

From a Mac terminal, open the server session with `ssh mint-server`. Run the
following **inside that Linux session** for a fresh test directory:

```sh
cd ~/vision-studio-detection-test/backend
python3 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements.txt
```

On the initial setup only, copy `.env.example` to `.env` and prepare the model:

```sh
cp .env.example .env
.venv/bin/python scripts/prepare_model.py
```

This has already been completed on `mint-server`. Preserve the existing `.env`
when repeating setup.

## 3. Run the detection backend (Linux server end)

Run **inside the Linux SSH session**, from the backend directory:

```sh
cd ~/vision-studio-detection-test/backend
.venv/bin/python -m uvicorn app.main:app --env-file .env \
  --host 127.0.0.1 --port 8001 --workers 1 \
  --ws websockets-sansio --ws-max-size 1048576 \
  --ws-per-message-deflate false --timeout-graceful-shutdown 20
```

Keep the session running. If the detection backend is already running, reuse it.
In another **Linux server session**, verify:

```sh
curl --fail http://127.0.0.1:8001/health
curl --fail http://127.0.0.1:8001/api/info
```

Both responses should report `model_ready: true`.

## 4. Verify the saved Serve route (Linux server end)

The current Serve configuration has other services on ports 8080 and 8096.
The private route on 8443 already points to the detection API on 8001. The saved
configuration from before that correction is at
`~/vision-studio-detection-test/tailscale-serve-before.json` on Linux.

You do not need to recreate this route for a normal restart. Check it **inside
a Linux SSH session** with:

```sh
tailscale serve status
```

It should show HTTPS port 8443 proxying to `http://127.0.0.1:8001`. If this
project's route is missing or still points to its old diagnostic API, restore
the approved target with the following command on Linux. Preserve unrelated
routes and inspect any unexpected target before changing it.

```sh
sudo tailscale serve --bg --https=8443 http://127.0.0.1:8001
```

Alternatively, run this single command **in a Mac terminal**. SSH runs the Serve
command on Linux and prompts for your Linux sudo password:

```sh
ssh -t mint-server 'sudo tailscale serve --bg --https=8443 http://127.0.0.1:8001'
```

This adds the detection backend for devices permitted by the existing tailnet
access rules. It preserves the other Serve/Funnel routes. See the
[Tailscale Serve reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

With the backend running, verify from the **Mac**:

```sh
curl --fail https://mint-server.tail439626.ts.net:8443/health
curl --fail https://mint-server.tail439626.ts.net:8443/api/info
```

## 5. Connect the complete app (Mac end)

Use the existing desktop app, or run browser development mode from the complete
checkout on the Mac:

```sh
cd "$HOME/CS/Computer-Vision/frontend"
npm run dev
```

Open `http://127.0.0.1:1420`, enter
`wss://mint-server.tail439626.ts.net:8443` in **Backend URL**, and click **Connect**.
The app should display the ready model and provider before starting the camera.

For browser mode, the server's `VISION_ALLOWED_ORIGINS` includes
`http://127.0.0.1:1420` and `http://localhost:1420`. The desktop app uses
`tauri://localhost`, also included in the supplied server configuration. Keep
these exact origins when editing `.env`, and restart the backend after changes.

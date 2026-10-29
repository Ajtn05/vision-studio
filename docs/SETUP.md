# Vision Studio setup: choose where detection runs

Clone the repository into a directory of your choice. In the commands below,
replace `/path/to/vision-studio` with that location on the machine running the
command. Replace `<server-ssh-host>` with your server's SSH address or alias,
and `<server-hostname>` with the `.ts.net` hostname printed by Tailscale Serve.
Both modes use the same client, camera controls, detection protocol, and model
choices.

| Test mode | Camera and interface | Detection model | Backend URL in the app | Setup guide |
| --- | --- | --- | --- | --- |
| Mac + Linux server | Mac | Linux server, backend port 8001 | `wss://<server-hostname>:8443` | [Mac + server](DETECTION_SERVER_SETUP.md) |
| Mac alone | Mac | Same Mac, backend port 8000 | `ws://127.0.0.1:8000` | [Mac-only testing](macos-local.md) |

For a new Linux machine, use [fresh Linux setup](linux-setup.md); its default
backend port is 8000. The Mac + server examples below use 8001, which can be
useful when another service already occupies 8000 on the server. Keep the
backend port, health checks, and Serve target consistent.

## A. Everyday testing: Mac + server

Complete the server guide's dependency/model setup once. When testing again,
start the detection backend in a terminal connected to Linux:

```sh
ssh '<server-ssh-host>'
cd /path/to/vision-studio/backend
.venv/bin/python -m uvicorn app.main:app --env-file .env \
  --host 127.0.0.1 --port 8001 --workers 1 \
  --ws websockets-sansio --ws-max-size 1048576 \
  --ws-per-message-deflate false --timeout-graceful-shutdown 20
```

Keep that terminal open. Reuse a healthy running backend; after copying code or
changing `.env`, restart the process to load those changes. The server guide
explains how to check and reuse the saved private Tailscale route on 8443.

In a separate **Mac terminal**:

```sh
cd /path/to/vision-studio/frontend
npm run dev
```

Open `http://127.0.0.1:1420`. Set **Backend URL** to
`wss://<server-hostname>:8443`, click **Connect**, then **Start
camera**. Both machines need Tailscale for this mode. Python, PyTorch, and model
weights are needed on Linux; the Mac can run just the client.

## B. Everyday testing: Mac alone

Complete [Mac-only first-time setup](macos-local.md) once. If you have already
prepared `.venv-mac` and the LVIS model, reuse them.
This command selects the broad model for the current run even if `.env` still
selects an older model:

```sh
cd /path/to/vision-studio/backend
VISION_MODEL_PATH=models/yoloe-26n-lvis.pt VISION_PROVIDER=cpu \
  .venv-mac/bin/python -m app
```

Keep that **Mac terminal** open. In a second **Mac terminal**:

```sh
cd /path/to/vision-studio/frontend
npm run dev
```

Open `http://127.0.0.1:1420`. Set **Backend URL** to
`ws://127.0.0.1:8000`, click **Connect**, then **Start camera**. This mode runs
real CPU inference locally and needs no Linux server or Tailscale.

Check readiness in another Mac terminal:

```sh
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/api/info
```

Expect `model_ready: true`; the broad model should report
`model_name: "yoloe-26n-lvis.pt"` and `class_count: 1203`. If port 8000 is occupied,
check which program owns it; the client allows plain local WebSockets only on
8000. A different machine's port 8000 does not conflict with the Mac's port 8000.

## Switching modes or using the desktop app

Click **Disconnect**, replace **Backend URL** with the appropriate value in the
table, then **Connect** again. The app saves this URL, so check it when changing
modes. The loaded model/provider/vocabulary identify the backend you reached.

Browser mode and the desktop app can use either backend. To use desktop
development, stop the standalone Vite process with Ctrl-C and run
`npm run tauri -- dev` from `frontend` instead. Both commands use frontend port
1420. The desktop bundle contains the client; keep the chosen backend running
separately. See [macOS client setup](macos-setup.md) for builds and camera
permissions.

Use **Live** for responsiveness, **Balanced** for a middle ground, and **Detail**
for more source pixels at higher processing cost. See [detection quality and
speed](detection-quality.md). Selecting a preset does not switch the backend or
its loaded model.

Stop the camera and disconnect when finished. Ctrl-C stops a foreground
frontend/backend; in server mode the saved Tailscale Serve route persists.

## Automated and synthetic tests

[Verification](verification.md) covers unit tests and the explicit synthetic
streaming fixture. Model-free tests and synthetic detections are separate from
the real Mac-only inference mode described above.

# macOS backend setup

Use this guide to prepare the inference backend on macOS. The local example
below runs both programs on one computer: the browser client on port 1420 and
the backend on loopback port 8000. A local backend needs no Tailscale route.
The same backend can serve an [external client](DETECTION_SERVER_SETUP.md),
which can use a different operating system. The adapter uses PyTorch CPU
inference, including on Apple Silicon.

```text
Mac camera → local video
     ↓ sampled JPEG over ws://127.0.0.1:8000
Mac Python backend → local model → labels and boxes → Mac overlay
```

## 1. Check an existing environment and weights

Clone the repository into a directory of your choice. Replace
`/path/to/vision-studio` below with your checkout location. If you have already
prepared the local backend, check its environment and weights on the Mac:

```sh
cd /path/to/vision-studio/backend
.venv-mac/bin/python --version
.venv-mac/bin/python -c 'import torch, ultralytics; print(torch.__version__, ultralytics.__version__)'
ls models/yoloe-26n-lvis.pt
```

If `.venv-mac` and the prepared model exist and these checks succeed, continue
with step 3. Otherwise, complete step 2. Use the explicit venv
interpreter: the Mac's default `python3` can be a different version.

## 2. First-time backend setup

Use Node.js 22.12+ for the frontend and a native Python 3.12 or 3.13 for the
backend. Local backend validation used Python 3.13. Install the chosen Python
from the [Python macOS installers](https://www.python.org/downloads/macos/) or
your package manager if needed. If its versioned command is not on PATH, use
its full interpreter path. The optional vocabulary-preparation requirements
also need Git.

For a new environment, from `backend` on the Mac:

```sh
cd /path/to/vision-studio/backend
python3.13 -m venv .venv-mac
.venv-mac/bin/python -m pip install --upgrade pip
.venv-mac/bin/python -m pip install torch torchvision
.venv-mac/bin/python -m pip install -r requirements.txt
if [ ! -f .env ]; then cp .env.example .env; fi
```

Use `python3.12` in the venv creation command if that is the version you
installed. Reuse an existing working `.venv-mac` instead of rerunning venv
creation. Keep the Mac and Linux virtual environments separate; their native
libraries are platform-specific.

The ordinary pip command above follows [PyTorch's macOS installation
instructions](https://pytorch.org/get-started/locally/).
The Linux CPU wheel-index command belongs to Linux setup. This project uses
the headless Ultralytics distribution; install from `requirements.txt` to keep
one OpenCV distribution in the environment.

If `models/yoloe-26n-lvis.pt` already exists, skip preparation. Otherwise:

```sh
.venv-mac/bin/python -m pip install -r requirements-vocabulary.txt
.venv-mac/bin/python scripts/prepare_model.py
```

Preparation downloads the original YOLOE checkpoint and a roughly 254 MB text
encoder, then saves `models/yoloe-26n-lvis.pt` with 1,203 object categories. That
work happens once; normal inference uses the prepared file without the
tokenizer or text encoder. See [model choices](detection-quality.md) for the
small variant or a custom vocabulary.

Preserve an existing `.env`. Its model path may still select `yolo11n.pt`; use
the temporary selection in step 3, or edit `VISION_MODEL_PATH` to make the
broader model your persistent selection. The example config already includes
`tauri://localhost`, `http://127.0.0.1:1420`, and `http://localhost:1420` origins.
Keep the exact origins you use, and restart the backend after configuration
changes.

## 3. Start the real Mac backend — terminal 1

```sh
cd /path/to/vision-studio/backend
VISION_MODEL_PATH=models/yoloe-26n-lvis.pt VISION_PROVIDER=cpu \
  .venv-mac/bin/python -m app
```

Keep this terminal running. The environment variables select the broad nano
model for this process and override matching `.env` values. Other settings,
including CPU threads and the origin allowlist, still come from `.env`.

If `.env` already selects your desired local model and CPU provider, the
equivalent everyday command is `.venv-mac/bin/python -m app`. For the prepared
small model, use `VISION_MODEL_PATH=models/yoloe-26s-lvis.pt`; expect higher CPU
cost. Stop the current backend with Ctrl-C before starting another model.

`python -m app` binds only `127.0.0.1:8000`, uses one worker, and applies the
project's WebSocket limits. Port 8000 must be free on the Mac. To inspect it:

```sh
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

Reuse an already healthy Vision Studio process or stop the process you started
before restarting it. Identify unrelated programs before changing them.

## 4. Start the browser client for local testing — terminal 2

Install frontend dependencies once, or after their lockfile changes:

```sh
cd /path/to/vision-studio/frontend
npm ci
```

For each browser testing session:

```sh
cd /path/to/vision-studio/frontend
npm run dev
```

Open `http://127.0.0.1:1420`. In **Backend URL**, enter exactly:

```text
ws://127.0.0.1:8000
```

Click **Connect**, confirm the model/provider/vocabulary, then **Start camera**
and allow camera access. Try **Live** first, then compare **Balanced** or
**Detail** on the same scene. The app appends `/ws/detect` automatically.

For the desktop client, stop the standalone `npm run dev` with Ctrl-C and run
`npm run tauri -- dev` from the same directory. Both use port 1420. A built
`.app` can also connect to `ws://127.0.0.1:8000`; it does not start Python for
you. Keep terminal 1 open. See [macOS client setup](macos-setup.md) for native
prerequisites and permissions.

## 5. Verify and switch back to the server

In another Mac terminal:

```sh
curl --fail http://127.0.0.1:8000/health
curl --fail http://127.0.0.1:8000/api/info
```

Expect `model_ready: true`. For the recommended model, info should include
`model_name: "yoloe-26n-lvis.pt"`, `provider: "cpu"`, and `class_count: 1203`.
Zero detections in an empty scene are valid; a smooth preview alone does not
prove that inference is connected. Check the backend terminal if readiness is
false, and check **Backend URL** if the app still reaches the remote model.

To use an external server, **Disconnect**, change the URL to
`wss://<server-hostname>:8443`, then **Connect**. Replace `<server-hostname>`
with the `.ts.net` hostname printed by Tailscale Serve. Start and verify
the external backend using the [external server guide](DETECTION_SERVER_SETUP.md).
The two backends have independent model selections, environments, and ports.

When finished, stop camera, disconnect, and use Ctrl-C in the local backend
and frontend terminals. The local backend is a foreground process, so it stops
when its terminal session ends.

For tests that require no real model or webcam, use the separate [model-free
tests and synthetic streaming fixture](verification.md). Stop a local real
backend before running the fixture: both use Mac port 8000.

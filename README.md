# Vision Studio

A real-time computer vision web app with an optional macOS desktop shell. The client renders its webcam locally; a backend on the same computer or an external server receives sampled JPEGs and runs local YOLO/YOLOE object detection or optional MediaPipe hand landmarks. A separate Canvas draws detections, finger joints, or object measurements without slowing the preview. The interface is a compact technical control panel with explicit settings, a detection table, and measured statistics.

```text
Client / browser                             Backend / FastAPI
camera → local video                         serial local inference
          ↓ sampled JPEG + frame metadata    ↑
          └──── loopback WS or private WSS ───┘
          Canvas ← JSON detections and landmarks
```

The browser client uses standard web APIs and can run on Linux, macOS, or
Windows with a compatible browser. Client and server operating systems can
differ. Only the machine running the backend needs Python, model weights,
and inference dependencies. The optional desktop build is configured for macOS.

## Quick start

Choose where inference runs in the [setup guide](docs/SETUP.md):

| Deployment | Backend URL in the app | Detailed guide |
| --- | --- | --- |
| Client + external server | `wss://<server-hostname>:8443` | [External server setup](docs/DETECTION_SERVER_SETUP.md) |
| Client + local backend on the same computer | `ws://127.0.0.1:8000` | [Local backend setup](docs/SETUP.md#client--local-backend) |

### 1. Clone the repository

Clone the repository into a directory of your choice. It contains the complete frontend, backend, desktop shell, tests, and deployment documentation.

For a fresh checkout on either machine:

```bash
git clone https://github.com/Ajtn05/vision-studio.git
cd vision-studio
```

Start each setup block below from the repository root. In the guides,
`/path/to/vision-studio` means your own repository location on that computer.
Install dependencies separately on each machine; copy source without
`node_modules`, `.venv*`, model files, or `target`.

### 2. Prepare the backend for your operating system

Run this only on the computer performing inference, whether it is the client
computer or an external server. Install Git and Python 3.12 first; macOS can
also use Python 3.13 as shown below. Preparation needs internet access; normal
inference reuses local weights. Skip environment creation if you already have a
working environment, and preserve an existing `.env`.

The commands below install dependencies and prepare both the object and hand
models. For object detection only, skip the lines containing
`requirements-hands.txt` and `prepare_hand_model.py`. To add hands to an existing
installation, see [hand model installation](#install-or-add-the-hand-model).

#### Linux (Bash)

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m pip install -r requirements-vocabulary.txt
.venv/bin/python -m pip install -r requirements-hands.txt
if [ ! -f .env ]; then cp .env.example .env; fi
.venv/bin/python scripts/prepare_model.py
.venv/bin/python scripts/prepare_hand_model.py
.venv/bin/python -m app
```

See [Linux setup](docs/linux-setup.md) for package prerequisites and an optional
systemd service.

#### macOS (Zsh or Bash)

```sh
cd backend
python3.13 -m venv .venv-mac
.venv-mac/bin/python -m pip install --upgrade pip
.venv-mac/bin/python -m pip install torch torchvision
.venv-mac/bin/python -m pip install -r requirements.txt
.venv-mac/bin/python -m pip install -r requirements-vocabulary.txt
.venv-mac/bin/python -m pip install -r requirements-hands.txt
if [ ! -f .env ]; then cp .env.example .env; fi
.venv-mac/bin/python scripts/prepare_model.py
.venv-mac/bin/python scripts/prepare_hand_model.py
.venv-mac/bin/python -m app
```

Use `python3.12` if that is the installed version. See
[macOS backend setup](docs/macos-local.md) for environment reuse and model choices.

#### Windows (PowerShell)

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip install -r requirements-vocabulary.txt
.\.venv\Scripts\python.exe -m pip install -r requirements-hands.txt
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe scripts/prepare_model.py
.\.venv\Scripts\python.exe scripts/prepare_hand_model.py
.\.venv\Scripts\python.exe -m app
```

These commands use the environment's interpreter directly, so PowerShell script
activation is unnecessary. Linux and macOS have recorded validation in this
repository; Windows instructions have not yet had an end-to-end project check.
See [PyTorch installation](https://pytorch.org/get-started/locally/) for current
platform and wheel requirements.

All three paths start the backend on `127.0.0.1:8000`. Keep that terminal open.
Open `http://127.0.0.1:8000/health` and `http://127.0.0.1:8000/api/info` on the
backend computer and confirm `model_ready: true`. Existing `.env` files retain
their model selection; see [model setup](docs/detection-quality.md) to change it.

### 3. Connect an external server, if used

For a backend on another computer, connect both devices to your Tailscale
network and follow [external server setup](docs/DETECTION_SERVER_SETUP.md).
Use `wss://<server-hostname>:8443` with the `.ts.net` hostname printed by Serve.
The client currently accepts remote backends only through private Tailscale WSS;
plain WebSockets are allowed only on loopback port 8000.

For a backend on the client computer, skip Serve and use `ws://127.0.0.1:8000`.

### 4. Start the browser client (Linux, macOS, or Windows)

Install Node.js 22.12+ on the client computer. From the repository root in a
separate terminal, the commands are the same in Bash, Zsh, and PowerShell:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`, enter the chosen **Backend URL**, click **Connect**,
then **Start camera** and allow camera access. Camera capture needs localhost
or an HTTPS page; ordinary LAN HTTP does not provide a secure camera context.
See [browser camera requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).

### Optional: macOS desktop app

The desktop shell uses the same client and backend protocol. Building it needs
Rust stable and Xcode Command Line Tools in addition to Node.js. A prebuilt
`.app` needs macOS 12+ and a running backend. From `frontend`:

```bash
npm run tauri -- dev
npm run tauri -- build --bundles app,dmg
```

The app is created in `frontend/src-tauri/target/release/bundle/macos/Vision Studio.app`; the disk image is in `bundle/dmg`. Open the app, enter your private WSS backend URL, click **Connect**, and **Start camera**. Allow camera access when prompted. Switching the camera, mirroring, confidence, resolution, FPS, and JPEG quality works from the interface. Settings are saved locally; camera IDs and credentials are not persisted.

See [macOS setup](docs/macos-setup.md) for signing, permissions, and building. The default preview request is 1280×720 at 30 FPS; actual camera capabilities determine the result. The Live preset defaults to 320×180 frames, 320-pixel inference, a 10 FPS target, JPEG quality 0.65, confidence 0.4, and one frame in flight. Each response triggers capture of the newest available camera frame; actual update speed depends on inference and network latency.

## Learn the code

| Location | Responsibility |
| --- | --- |
| `frontend/src/hooks/useCamera.ts` | MediaDevices lifecycle, device selection, local preview |
| `frontend/src/hooks/useDetectionStream.ts` | Aspect-preserving sampling and JPEG encoding |
| `frontend/src/services/detectionSocket.ts` | One connection, backpressure, heartbeat, retries, measurements |
| `frontend/src/utils/coordinates.ts` | Source-to-preview conversion and mirroring |
| `frontend/src/components/` | Functional controls, overlay, status, and measured statistics |
| `frontend/src-tauri/` | Native shell, camera descriptions, entitlements, restricted CSP |
| `backend/app/main.py` | Health, capabilities, and WebSocket routes |
| `backend/app/websocket_handler.py` | Session controls and bounded frame intake |
| `backend/app/frame_processor.py` | Binary envelope and JPEG validation |
| `backend/app/inference_worker.py` | Single background worker with timeout protection |
| `backend/app/detector.py` | Small detector contract and real Ultralytics adapter |
| `deployment/` | Reviewable service template and local renderer |

Read [architecture](docs/architecture.md), [protocol](docs/protocol.md), [troubleshooting](docs/troubleshooting.md), and [verification](docs/verification.md). See [switching models](#switching-models) for weight changes and adding another detector implementation. The test fake exists only in tests and is never selected by normal startup.

See [detection quality and speed](docs/detection-quality.md) for the Live/Balanced/Detail presets, independent inference resolution, and broader model setup. New configurations use YOLOE-26n with a baked vocabulary of 1,203 LVIS object categories. Existing `.env` files retain their selected model; the guide explains how to upgrade. A small variant is available when localization quality matters more than CPU cost.

## Switching models

Supported YOLO/YOLOE weight changes require preparing the weights, updating the
backend configuration, and restarting the backend. The frontend needs no changes
or rebuild. The selected object model serves both **Object detection** and
**Object measurement**; **Hands & fingers** uses its separate MediaPipe model.
The **Vision mode** selector switches tasks during a session. Changing object
model weights requires a backend restart.

### Switch to another supported checkpoint

Run preparation on the computer performing inference. These are the choices in
[`prepare_model.py`](backend/scripts/prepare_model.py):

| Preparation argument (`--model`) | `VISION_MODEL_PATH` after preparation | Vocabulary |
| --- | --- | --- |
| `yoloe-26n-seg.pt` (default) | `models/yoloe-26n-lvis.pt` | 1,203 LVIS categories |
| `yoloe-26s-seg.pt` | `models/yoloe-26s-lvis.pt` | 1,203 LVIS categories; higher capacity and CPU cost |
| `yolo26n.pt` / `yolo26s.pt` | `models/yolo26n.pt` / `models/yolo26s.pt` | 80 COCO categories |
| `yolo11n.pt` / `yolo11s.pt` | `models/yolo11n.pt` / `models/yolo11s.pt` | 80 COCO categories |
| `yoloe-26n-seg-pf.pt` / `yoloe-26s-seg-pf.pt` | `models/yoloe-26n-seg-pf.pt` / `models/yoloe-26s-seg-pf.pt` | Optional 4,585-name exploration vocabulary |

For example, to switch to the small YOLOE variant, start from the repository root.
Use the backend environment's Python interpreter from your operating system's
[quick start](#2-prepare-the-backend-for-your-operating-system) in place of
`python`, or activate that environment first:

```bash
cd backend
python -m pip install -r requirements.txt -r requirements-vocabulary.txt
python scripts/prepare_model.py --model yoloe-26s-seg.pt
```

Edit these entries in the existing `backend/.env`, preserving other settings:

```dotenv
VISION_MODEL_PATH=models/yoloe-26s-lvis.pt
VISION_PROVIDER=cpu
```

Stop and restart the backend using the same launch method as before (`python -m
app` from `backend` for a manual launch, or restart its service). Existing process
environment variables take precedence over `.env`, so update them too if set.
Reconnect the client and check `/api/info`: `model_name` should match the selected
weights, `model_ready` should be `true`, and the `objects` entry in `models`
should have `available: true`. Normal startup loads local weights without
downloading missing files.

The `cpu` provider requires a local `.pt` checkpoint. For OpenVINO, prepare with
`--openvino`, set `VISION_PROVIDER=openvino`, and set `VISION_MODEL_PATH` to the
exported model directory printed by the script. See
[detection quality and speed](docs/detection-quality.md) for export dependencies,
custom YOLOE vocabularies, and benchmarking.

### Use another model framework or add a task

For another object detection framework, implement the
[`Detector` interface](backend/app/detector.py): `model_name`, `provider`, and
`detect(image, confidence, image_size)`. The input is an unmirrored BGR NumPy
image; return `list[Detection]` with labels, confidence scores, and bounding boxes
normalized to the input image in the range 0–1. Keeping this output contract lets
the existing transport and object detection UI work with the new implementation.

Startup currently constructs `YoloDetector` directly in
[`InferenceWorker.start`](backend/app/inference_worker.py). Wire the new adapter
into that startup path, or construct it and pass it through
`create_app(detector=...)`. Preserve single-worker ownership of model loading and
inference. There is no configuration-driven detector registry yet.

A new selectable task, such as pose or depth, also needs updates to the worker's
model catalog and selection path, protocol schemas, frontend mode types, and
rendering for its outputs. See [architecture](docs/architecture.md) and
[protocol](docs/protocol.md) for those boundaries.

## Vision modes

After connecting, use **Vision mode** to switch between **Object detection**,
**Hands & fingers**, and **Object measurement** without restarting the session.
Hands uses an optional local MediaPipe model to draw 21 joints per hand and
estimate raised fingers. Measurement uses the existing object detector, shows
bounding-box dimensions in pixels, and supports a known reference width for
approximate centimeters or inches.

### Install or add the hand model

The quick start above includes hand model installation. For an existing backend,
stop it before installing dependencies, then run the following from the repository
root on the computer performing inference. A client using an external backend
needs these steps only on the server. Use the same Python environment that runs
the backend: replace `python` with `.venv/bin/python` on Linux,
`.venv-mac/bin/python` on macOS, or `.\.venv\Scripts\python.exe` on Windows,
matching the quick start, or activate your existing environment first.

```bash
cd backend
python -m pip install -r requirements-hands.txt
python scripts/prepare_hand_model.py
```

`requirements-hands.txt` installs MediaPipe and its OpenCV dependency. The
preparation script downloads Google's Hand Landmarker bundle to
`backend/models/hand_landmarker.task`; it reuses the file if already present.
Installation and the initial download need internet access. Normal startup and
inference use the local bundle.

Ensure the existing `backend/.env` contains this setting, preserving other entries:

```dotenv
VISION_HAND_MODEL_PATH=models/hand_landmarker.task
```

The hand model path is separate from `VISION_MODEL_PATH`, which selects the object
model. For another bundle location, pass `--output` to the preparation script and
set `VISION_HAND_MODEL_PATH` to the same path. Update any process environment
override too, since it takes precedence over `.env`.

Restart the backend with the same interpreter (`python -m app` from `backend`
for a manual launch) or restart its service. Check `/api/info` on the backend:
the `models` entry with `id: "hands"` must have `available: true`. Overall
`model_ready: true` alone can mean only the object detector is ready. If hands
remain unavailable, inspect that entry's `reason` and the backend startup logs.

Reconnect the client, choose **Vision mode → Hands & fingers**, and show a hand
to the camera to check the joint overlay and estimated finger count. See
[vision modes and calibration](docs/vision-modes.md) for measurement limits and
further verification.

## Tests

Frontend tests and build:

```bash
cd frontend
npm ci
npm test
npm run build
```

Backend tests need no model, Ultralytics, or PyTorch. In Bash or Zsh:

```bash
cd backend
python3 -m venv .venv-test
source .venv-test/bin/activate
python -m pip install -r requirements-test.txt
python -m pytest -q
python -m ruff check app tests scripts
```

In PowerShell, create the test environment with `py -3.12 -m venv .venv-test`
and use `.\.venv-test\Scripts\python.exe` for the pip, pytest, and Ruff commands.

See [verification](docs/verification.md) for the synthetic fixture, real camera
acceptance steps, and measured CPU results on the i5-8265U server. OpenVINO and
camera accuracy require their own checks; model-call timings exclude webcam
capture and transport.

## Deployment and scope

This app supports one active client, selectable local vision modes, and private Tailscale networking. It has no recording, persistent tracking, or cloud upload. Neither the server nor client stores frames. In-flight inference threads cannot be killed safely: on a timeout the server retains the busy slot until the work exits; systemd can restart a stuck process. Server health reports availability separately from model readiness.

Before distributing, read [licensing considerations](docs/licensing.md). The Ultralytics runtime and pretrained weights have licensing obligations; a proprietary distribution must not be assumed permissible.

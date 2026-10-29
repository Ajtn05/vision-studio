# Vision Studio

A readable, real-time computer vision desktop app. Your Mac renders its webcam locally; a backend on Linux or the same Mac receives sampled JPEGs and runs local YOLO/YOLOE object detection or optional MediaPipe hand landmarks. A separate Canvas draws detections, finger joints, or object measurements without slowing the preview. The interface is a compact technical control panel with explicit settings, a detection table, and measured statistics.

```text
Mac / React + Tauri 2                         Linux Mint / FastAPI
camera → local video                         serial local inference
          ↓ sampled JPEG + frame metadata    ↑
          └──────── private WSS / Tailscale ──┘
          Canvas ← JSON object detections
```

With the Linux backend, the Mac runs only the client and needs no Python,
model weights, PyTorch, or OpenVINO. For Mac-only testing, the Mac runs both
the client and the Python backend. Browser and desktop modes use the same
application and protocol.

## Quick start

Start with the [two-mode setup guide](docs/SETUP.md):

| Test mode | Backend URL in the app | Detailed guide |
| --- | --- | --- |
| Mac + Linux server | `wss://<server-hostname>:8443` | [Mac + server](docs/DETECTION_SERVER_SETUP.md) |
| Mac alone, including real local inference | `ws://127.0.0.1:8000` | [Mac-only testing](docs/macos-local.md) |

The sections below describe fresh Linux setup and the shared Mac client.

Clone the repository into a directory of your choice. It contains the complete frontend, backend, desktop shell, tests, and deployment documentation.

For a fresh checkout on either machine:

```bash
git clone https://github.com/Ajtn05/vision-studio.git
cd vision-studio
```

Run commands from this project directory. In the guides, `/path/to/vision-studio` means your own repository location on the machine running the command. Replace `<server-hostname>` with the `.ts.net` hostname printed by Tailscale Serve. If copying source between machines, exclude `node_modules`, `.venv*`, model files, and `target`. Install dependencies separately on each machine.

For a Linux backend on port **8001**, follow [the detection server setup](docs/DETECTION_SERVER_SETUP.md). The fresh-install instructions below use port 8000. [Setup overview](docs/SETUP.md) links the machine-specific guides.

### Linux Mint: prepare and run the real backend

Use Python 3.10–3.12 (3.12 recommended) and an existing Tailscale installation. The CPU wheel command avoids downloading NVIDIA CUDA libraries. Installation and model preparation require internet access; normal operation uses local weights.

```bash
cd /path/to/vision-studio/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r requirements.txt
python -m pip install -r requirements-vocabulary.txt
cp .env.example .env
python scripts/prepare_model.py
python -m app
```

In another Linux terminal:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/info
tailscale serve status
tailscale funnel status
```

After confirming **8443 has no existing Serve or Funnel route**, add a private route:

```bash
tailscale serve --bg --https=8443 http://127.0.0.1:8000
```

Use the HTTPS hostname printed by Serve as `wss://<that-hostname>:8443` in the app. Review [Linux setup](docs/linux-setup.md) before changing Serve or installing the systemd service. Keep the server bound to `127.0.0.1`; use one Uvicorn worker.

### macOS: run or build the client

Install Node.js 22.12+ (an LTS release is recommended). Building Tauri also needs Rust stable and Xcode Command Line Tools. A prebuilt `.app` only needs macOS 12+.

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:1420` for browser mode. For the desktop app:

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

Read [architecture](docs/architecture.md), [protocol](docs/protocol.md), [troubleshooting](docs/troubleshooting.md), and [verification](docs/verification.md). To add a detector, implement the attributes and `detect` method in `Detector`, then register it in the worker's model catalog and selection path. Preserve normalized detection coordinates and single-worker ownership. The test fake exists only in tests and is never selected by normal startup.

See [detection quality and speed](docs/detection-quality.md) for the Live/Balanced/Detail presets, independent inference resolution, and broader model setup. New configurations use YOLOE-26n with a baked vocabulary of 1,203 LVIS object categories. Existing `.env` files retain their selected model; the guide explains how to upgrade. A small variant is available when localization quality matters more than CPU cost.

## Vision modes

After connecting, use **Vision mode** to switch between **Object detection**,
**Hands & fingers**, and **Object measurement** without restarting the session.
Hands uses an optional local MediaPipe model to draw 21 joints per hand and
estimate raised fingers. Measurement uses the existing object detector, shows
bounding-box dimensions in pixels, and supports a known reference width for
approximate centimeters or inches.

On the machine running the backend, enable hands with:

```bash
cd backend
# Activate your backend environment first (.venv on Linux, .venv-mac on macOS).
python -m pip install -r requirements-hands.txt
python scripts/prepare_hand_model.py
```

Restart the backend after installation. See [vision modes and calibration](docs/vision-modes.md)
for setup, measurement limits, and verification.

## Tests

Frontend tests and build:

```bash
cd frontend
npm ci
npm test
npm run build
```

Backend tests need no model, Ultralytics, or PyTorch. On a development machine with Python:

```bash
cd backend
python3 -m venv .venv-test
source .venv-test/bin/activate
python -m pip install -r requirements-test.txt
python -m pytest -q
python -m ruff check app tests scripts
```

See [verification](docs/verification.md) for the synthetic fixture, real camera
acceptance steps, and measured CPU results on the i5-8265U server. OpenVINO and
camera accuracy require their own checks; model-call timings exclude webcam
capture and transport.

## Deployment and scope

This app supports one active client, selectable local vision modes, and private Tailscale networking. It has no recording, persistent tracking, or cloud upload. Neither the server nor client stores frames. In-flight inference threads cannot be killed safely: on a timeout the server retains the busy slot until the work exits; systemd can restart a stuck process. Server health reports availability separately from model readiness.

Before distributing, read [licensing considerations](docs/licensing.md). The Ultralytics runtime and pretrained weights have licensing obligations; a proprietary distribution must not be assumed permissible.

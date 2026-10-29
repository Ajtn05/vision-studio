# Optional macOS desktop client

This guide covers the macOS desktop shell, builds, and camera permissions.
For the browser client on Linux, macOS, or Windows, use the shared
[quick start](../README.md#4-start-the-browser-client-linux-macos-or-windows).
The desktop client works with either deployment:

| Where detection runs | Backend URL | Instructions |
| --- | --- | --- |
| Local backend | `ws://127.0.0.1:8000` | [macOS backend setup](macos-local.md) |
| External server | `wss://<server-hostname>:8443` | [External server setup](DETECTION_SERVER_SETUP.md) |

Replace `<server-hostname>` with the `.ts.net` hostname printed by Tailscale
Serve on your server. Run the development commands from your own clone of
the repository.

Both modes use the frontend and camera steps below. For short everyday startup
commands, see [setup overview](SETUP.md).

## Development prerequisites

For browser development, use Node.js 22.12+ (prefer LTS). Native app
development on macOS 12+ additionally needs Rust stable and Xcode Command Line
Tools; the existing native setup is validated on Apple Silicon. Check versions
with `node --version`, `npm --version`, `rustc --version`, and `xcode-select -p`.
If Command Line Tools are missing, run `xcode-select --install` and finish the
installer. A prebuilt client app needs neither Node nor Rust to run.

From the project:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. The dev server listens only on loopback. The backend allowlist must contain this exact origin. `http://localhost:1420` is also allowed by the example, but an origin with another port is different. A remote browser requires HTTPS for MediaDevices; ordinary LAN HTTP is not a secure camera context.

The Mac needs Python, PyTorch, and weights when it also runs the local backend.
When connecting to an external server, client use and frontend development need no Mac ML
installation. The native app bundle contains the client; the selected backend
is always started separately.

## Desktop development and builds

```bash
npm run tauri -- dev
npm run tauri -- build --bundles app,dmg
```

The Apple Silicon app is `src-tauri/target/release/bundle/macos/Vision Studio.app`. Double-click it or run:

```bash
open "src-tauri/target/release/bundle/macos/Vision Studio.app"
```

The app needs Node/Rust only while building. The resulting bundle has the client assets and native shell; it does not bundle the inference server. A debug bundle can be made with `npm run tauri -- build --debug --bundles app` and appears under `target/debug/bundle/macos`.

For distribution to other Macs, configure Developer ID signing/notarization using [Tauri's macOS signing guide](https://v2.tauri.app/distribute/sign/macos/). The local unsigned/ad-hoc build is for development. Do not disable Gatekeeper or remove security attributes as a deployment strategy.

## Camera permission

`src-tauri/Info.plist` supplies `NSCameraUsageDescription`. `Entitlements.plist` includes camera and outbound network entitlements for hardened builds. The app requests video only, never microphone audio. When prompted, allow the camera. If access was denied, use System Settings → Privacy & Security → Camera, enable Vision Studio, then restart it. In browser mode, camera permission belongs to that browser and origin. Device names usually become available only after granting permission.

If a raw `tauri dev` executable does not receive camera permission on a particular macOS version, use the bundled debug `.app`, which has an explicit application identity and plist, or use browser development mode. Test the final `.app` separately from the browser.

## Tauri 2 security

The native capability grants no Rust/plugin permissions because this MVP uses browser MediaDevices, Canvas, WebSocket, and localStorage. There is no shell, filesystem, HTTP, or WebSocket native plugin. Capability scopes govern native commands; the CSP governs browser network connections. These are separate controls, as described in [Tauri capabilities](https://v2.tauri.app/security/capabilities/) and [CSP](https://v2.tauri.app/security/csp/).

The production CSP permits WSS only to `*.ts.net` and allows plain WS only to `localhost:8000` and `127.0.0.1:8000`. The client additionally rejects remote non-Tailscale hosts and insecure remote URLs. No global `connect-src *`, native network permission, remote script, remote font, or TLS bypass is used. For a deployment restricted to one tailnet server, replace the `wss://*.ts.net:*` CSP entry with that exact hostname/port before building. The development CSP adds only the local Vite HMR socket.

Packaged macOS pages use the `tauri://localhost` origin, which must be explicitly present in the selected backend's WebSocket allowlist, whether that backend runs locally or on an external server. Confirm the actual origin in backend rejection logs if using a different platform or custom scheme; do not allow `null` or wildcard origins to work around it.

## Using the workspace

1. Start and verify the chosen backend. For an external server, connect both machines to the same tailnet; for a local backend, start Python inference on this computer.
2. Paste its Backend URL from the table above. Click Disconnect before changing a saved URL.
3. Click Connect. The model name/provider appear only after a real configuration acknowledgement.
4. Start camera; select a built-in/external camera if needed. The video is local even if the server is disconnected.
5. Try Live/Balanced/Detail, or edit confidence, inference size, frame size, target FPS, JPEG quality, or mirroring. Settings apply immediately; the model/provider are selected on the machine running the backend.
6. Stop camera to release its tracks. Disconnect stops inference and cancels reconnect attempts; it does not stop local preview.

No recording or snapshot feature is present. The app retains only the latest detection result and a short array of completion timestamps in memory.

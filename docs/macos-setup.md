# macOS client

## Development prerequisites

Use macOS 12+ on Apple Silicon, Node.js 22.12+ (prefer LTS), Rust stable from the official installer, and Xcode Command Line Tools. Check versions with `node --version`, `npm --version`, `rustc --version`, and `xcode-select -p`. If Command Line Tools are missing, run `xcode-select --install` and finish the installer.

From the project:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. The dev server listens only on loopback. The backend allowlist must contain this exact origin. `http://localhost:1420` is also allowed by the example, but an origin with another port is different. A remote browser requires HTTPS for MediaDevices; ordinary LAN HTTP is not a secure camera context.

Only a developer running backend tests needs Python on the Mac. Normal client use and frontend development never need ML dependencies or model weights.

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

Packaged macOS pages use the `tauri://localhost` origin, which must be explicitly present in the Linux WebSocket allowlist. Confirm the actual origin in server rejection logs if using a different platform or custom scheme; do not allow `null` or wildcard origins to work around it.

## Using the workspace

1. Join the Mac and Linux server to the same tailnet with access to the Serve port.
2. Paste the WSS root URL printed by Linux's Serve command (including `:8443` if selected).
3. Click Connect. The model name/provider appear only after a real configuration acknowledgement.
4. Start camera; select a built-in/external camera if needed. The video is local even if the server is disconnected.
5. Change confidence, resolution, target FPS, JPEG quality, or mirroring. Settings apply immediately; model/provider are selected on Linux.
6. Stop camera to release its tracks. Disconnect stops inference and cancels reconnect attempts; it does not stop local preview.

No recording or snapshot feature is present. The app retains only the latest detection result and a short array of completion timestamps in memory.

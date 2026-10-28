# Vision Studio setup

The complete application and its Git history live at `~/CS/Computer-Vision`
on the Mac. Use this checkout for all frontend and backend changes.

## Existing Linux Mint deployment

Follow [the detection server guide](DETECTION_SERVER_SETUP.md) for the current
`mint-server` deployment. It uses a Linux backend on port **8001** and a private
Tailscale Serve route on HTTPS/WSS port **8443**. The guide includes source
transfer, startup commands, and the Backend URL to enter in the client.

The old diagnostic `/health` server on port 8000 is separate. It cannot handle
the complete application's `/ws/detect` connection.

## Mac client

```sh
cd "$HOME/CS/Computer-Vision/frontend"
npm ci
npm run dev
```

Open `http://127.0.0.1:1420`. Connect to the private WSS URL from the detection
server guide, then start the camera. For desktop development, stop the
standalone Vite process and run `npm run tauri -- dev` instead.

See [macOS setup](macos-setup.md) for prerequisites, desktop builds, and camera
permissions. Normal Mac client use does not need Python or model weights.

## Fresh Linux installation

Use [Linux setup](linux-setup.md) to prepare a new server. Its default backend
port is **8000**; adapt the port consistently when using the existing deployment
on 8001. Keep virtual environments, configuration, and models on the machine
where they are used.

## Validation

See [the verification guide](verification.md) for frontend and backend checks,
the synthetic streaming fixture, and the real camera acceptance check.

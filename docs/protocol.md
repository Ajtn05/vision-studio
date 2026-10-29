# WebSocket protocol v1

The public endpoints are `GET /health`, `GET /api/info`, and `WebSocket /ws/detect`. The client uses a single WebSocket for configuration, JPEGs, detections, and heartbeats. Tailscale Serve terminates valid HTTPS/WSS and proxies to HTTP on loopback. TLS verification is never bypassed.

## Session controls

Send a text JSON message before frames:

```json
{"type":"configure","revision":1,"confidence":0.4,"resolution":"640x360","model":null}
```

Confidence is 0.05–0.95; supported resolution bounds are `320x180`, `640x360`, and `960x540`. `model` may be omitted, null, the loaded object model filename, or an available mode ID (`objects`, `hands`, `measurement`). Omission chooses objects when available, otherwise hands. Model installation is a server operation; selecting an installed mode is a session operation. JPEG quality, sampling FPS, and mirroring are local client choices; the server caps intake at 10 FPS.

The server replies `{"type":"ready","config":{...},"info":{...}}`. The `info` field matches `/api/info`. Wait for this acknowledgement before sampling. To change confidence or resolution, send another configure with a strictly increasing positive revision. A frame uses the complete configuration active when it was received; its result echoes that revision. The client clears old boxes and waits for acknowledgement of the newest revision.

Servers with `info.supported_options.inference_sizes` accept optional `inference_size: 320 | 640 | 960 | null` in configure. This sets detector resolution independently of the JPEG bounds. Null or omission retains frame-width-based inference. A new client starts with the original configure format, discovers support, then sends a new revision with the requested inference size before sampling. This keeps the client compatible with servers that reject unknown fields. `info.class_count` reports the loaded vocabulary size when available; it is null or absent for adapters that do not report one.

Servers with `info.supported_options.model_selection: true` expose `info.models`,
an array of `{id, name, available, reason}` entries. The client selects only
available IDs after discovery. `ready.info.active_model` and `ready.config.model`
contain the selected mode; model name, provider, and class count describe that
mode's detector. `/api/info` describes the default mode. Changing the mode requires
a new revision and does not enqueue or interrupt an earlier inference.

Unknown fields and malformed or unsupported controls produce `{"type":"error","code":"invalid_control","message":"...","fatal":true}` and close with code 1008. A busy server or unavailable model produces an `unavailable` error and close 1013. A second client never evicts the first.

## Binary envelope

Every WebSocket binary message contains one header followed immediately by one complete JPEG. This atomic framing prevents metadata from being associated with the wrong image.

| Offset | Bytes | Encoding | Meaning |
| --- | --- | --- | --- |
| 0 | 4 | ASCII `VS01` | Protocol/version magic |
| 4 | 4 | unsigned 32-bit, big endian | Frame ID, starts at 1 and strictly increases |
| 8 | 8 | IEEE-754 float64, big endian | Capture timestamp, Unix milliseconds (`Date.now()`) |
| 16 | remaining | JPEG | Unmirrored source image |

Python uses `struct.Struct("!4sId")`; TypeScript uses `DataView` with `littleEndian=false`. Metadata is echoed without converting the timestamp to a server clock. Frame IDs reset only on a new connection. Before overflow, reconnect.

Default maximum binary message size including header: 1 MiB. Control messages: 4096 bytes. The entry point enforces the binary limit at the WebSocket implementation as well as in the parser. JPEG dimensions are read before OpenCV allocation; they must fit both the selected session bounds and the absolute 1280×720 bounds. Aspect-preserving transmission may produce smaller dimensions (for example 480×360 for a 4:3 camera). JPEGs must have SOI/EOI markers and a valid image header; decoded dimensions must match it.

## Detection responses

```json
{
  "type": "detections",
  "frame_id": 42,
  "captured_at": 1720000000000,
  "revision": 1,
  "processing_ms": 81.5,
  "inference_ms": 78.2,
  "image_width": 640,
  "image_height": 360,
  "objects": [
    {"class_id":0,"label":"person","confidence":0.94,"x":0.18,"y":0.12,"width":0.24,"height":0.7}
  ]
}
```

These values are an illustrative protocol message, not a benchmark. Coordinates are normalized to [0,1], measured from the top-left of the actual unmirrored JPEG; x grows right and y grows down. Width/height are extents, not bottom-right corners. The box must fit within the image. An empty `objects` array is a valid result. The real adapter caps detections at 100.

Current responses add `model: "objects" | "hands" | "measurement"`. Hand detections
include `hand: {handedness: "Left" | "Right", landmarks: [{x,y,z}, ...],
extended_fingers: ["thumb", "index", ...]}` with exactly 21 points and up to five
distinct finger names (`thumb`, `index`, `middle`, `ring`, `pinky`). Landmark x/y
are normalized and clamped to the image; z is finite relative depth from MediaPipe.
The common `confidence` on hands is the handedness classification score; hand
detection/presence thresholds are applied inside the model. Object detections
omit `hand`. Measurement uses the object detector's boxes; pixel conversion and
optional physical calibration run locally in the client.

The client only accepts a result matching the current pending ID and capture timestamp, a current revision, and an increasing result ID. A result more than 2000 ms old on arrival is discarded. Accepted boxes expire 2000 ms after capture, including processing and delivery time. Reading age updates every 100 ms using the browser's monotonic clock. The local video remains visible while waiting for a fresh reading or reconnecting.

## Backpressure, errors, heartbeat

Only one frame may be in flight. The server returns `{"type":"dropped","frame_id":43,"reason":"busy"}` (or `rate_limit`) for excess frames. The client releases that pending slot and samples a new frame later. It never resends the old JPEG.

A decode validation failure returns an `invalid_frame` error with `frame_id` and `fatal:false`, releasing the client slot. Invalid envelopes, duplicate IDs, or frames before configuration are fatal and close with 1008. Unexpected inference failure closes with 1011; a 15-second default inference timeout reports `inference_timeout`. Full details remain in server logs. Underlying thread work remains guarded until it finishes.

The client sends `{"type":"ping","nonce":1}` on open and every five seconds after a matching pong. The server replies `{"type":"pong","nonce":1}` promptly, even during inference. Missing a pong for 15 seconds, a configuration acknowledgement for 10 seconds, or a frame reply for 20 seconds closes and reconnects. Server initial configuration timeout is 10 seconds; inactivity timeout is 30 seconds by default. Uvicorn also supplies transport-level WebSocket pings.

## Measured performance

| UI value | Definition |
| --- | --- |
| Detections | Count in the latest fresh accepted result |
| Inference FPS | `(N-1)/(last-first)` accepted completion timestamps over the last 10 seconds, in FPS; requires at least two results |
| Inference | `perf_counter` duration of the detector call, including provider preprocessing/postprocessing |
| RTT | Browser monotonic elapsed time from application ping send to matching pong |
| Frame latency | Browser monotonic elapsed time from capture start, through JPEG encoding, transmission, processing, and result delivery |
| Reading age | Browser monotonic elapsed time since capture of the latest reading, including time on screen; resets on a new accepted result |
| Processing (`processing_ms`) | Server elapsed decode + detector time, sampled immediately before response construction |

Values are never generated for presentation. Missing measurements display a dash. Stale results hide inference/latency values and boxes; inference rate becomes zero. RTT includes event-loop and proxy overhead and is not one-way latency. Capture epoch timestamps are echoed for correlation; subtracting clocks on two machines is never used for latency.

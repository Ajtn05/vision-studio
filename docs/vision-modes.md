# Vision modes and object measurement

Connect to the backend, then choose **Vision mode** in Inference configuration.
The server advertises installed modes; missing models appear disabled with setup
details. Switching modes clears old readings and uses a new configuration revision.
All modes share the existing single inference worker and one-frame limit.

| Mode | Backend | Output |
| --- | --- | --- |
| Object detection | Existing local YOLO/YOLOE weights | Object labels, confidence, bounding boxes |
| Hands & fingers | Optional MediaPipe Hand Landmarker | Up to two hands, handedness, 21 joints, estimated raised fingers |
| Object measurement | Same local object detector | Bounding-box width and height in pixels or calibrated cm/in |

## Enable hands

Install on the machine running inference. A client using an external server
needs no additional inference dependencies. In the backend directory, with its virtual
environment activated:

```bash
python -m pip install -r requirements-hands.txt
python scripts/prepare_hand_model.py
```

The preparation script downloads Google's version 1 model bundle to
`backend/models/hand_landmarker.task`. Use `--output /absolute/path/file.task`
and `VISION_HAND_MODEL_PATH=/absolute/path/file.task` for another location.
Restart the backend after installation. There are no downloads during service
startup or inference. A missing hand model or optional package does not prevent
object detection and measurement from running. Hands can also run when object
weights are absent; readiness means at least one detector is available.

The implementation uses the CPU and MediaPipe Tasks IMAGE mode. Each sampled
frame is independent, so switching cameras, clients, or modes cannot reuse old
tracking state. The confidence slider changes the hand detection and presence
thresholds. The result table's **Handedness score** is confidence in the left/right
classification, not a hand detection score. Images remain unmirrored on the wire;
the preview mirrors landmarks using the same transform as boxes.

Finger extension is an estimate from 3D joint angles and wrist distance. It is
independent of screen orientation and handedness, but occlusion, bent fingers,
edge-on hands, or poor model landmarks can produce incorrect counts. Show the
whole hand and use Balanced or Detail if it is small in the frame.

The model and API are documented in Google's
[Hand Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python).
Review the model's licensing and redistribution terms before distributing weights.

## Measure objects

1. Choose **Object measurement**. Each detected object's enclosing box shows
   width × height in the transmitted JPEG's pixels.
2. Place an object with a known width on the same flat plane as the objects to
   measure. Face the camera straight toward that plane.
3. Enter its real width in **Known reference width**, and select centimeters or inches.
4. Click **Use width** on that reference object's table row. Its detected
   horizontal bounding-box width sets the scale. Very small boxes cannot be references.
5. Read approximate dimensions in the overlay and table. **Clear reference**
   restores pixel measurements.

Measurements describe the axis-aligned enclosing detection box, including empty
space. They are not 3D dimensions, depth estimates, rotated-edge measurements, or
precision metrology. A single camera cannot recover physical size without a scale
reference and assumptions about perspective. Depth differences, camera tilt,
object rotation, and imperfect boxes introduce error. Recalibrate after moving
the camera or changing object distance. Calibration clears on camera changes,
camera stop, mode changes, disconnect/reconnect, or editing the reference width/unit.
It is never saved across app sessions.

The scale uses normalized image width and actual source aspect ratio. It survives
transmission-resolution changes without changing real-world units; a different
aspect ratio falls back to pixels. Increase transmission resolution for smaller
objects and finer pixel measurements. No calibration data or additional images
are sent to the server.

## Compatibility and checks

Older clients can omit `model` or send the loaded object model filename. New
clients discover the catalog through the initial handshake before selecting a
mode. Against an older server, Object detection works and advanced modes stay
unavailable. Model choice resets to Object detection when the app is reopened.

Backend tests cover model availability, switching, hand-only startup, rotated and
curled finger geometry, RGB conversion, and threshold changes. Frontend tests
cover payload validation, stale results during switching, capability negotiation,
and calibrated dimensions across resolutions. To verify with a real camera:

- Open a hand, curl it, rotate it, and try both hands. Confirm joint markers and
  approximate finger counts, including mirrored and unmirrored previews.
- Switch modes during inference and confirm old overlays disappear.
- Measure a known flat reference and a second known object on the same plane.
  Move the camera, clear the reference, and recalibrate.
- Confirm missing hand dependencies disable only the hand option.

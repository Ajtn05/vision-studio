# Detection coverage, box quality, and speed

The live camera supports three local presets: **Live**, **Balanced**, and
**Detail**. They set JPEG size/quality, model input size, sampling rate, and
confidence together. Controls remain editable after choosing a preset.

| Preset | JPEG bounds | Model input | Target FPS | JPEG quality | Confidence |
| --- | --- | --- | --- | --- | --- |
| Live (default) | 320 × 180 | 320 | 10 | 0.65 | 0.40 |
| Balanced | 640 × 360 | 640 | 10 | 0.80 | 0.35 |
| Detail | 960 × 540 | 960 | 5 | 0.85 | 0.25 |

These are targets, not guaranteed frame rates or accuracy scores. Detail retains
more source pixels and can reveal small objects. Its lower confidence also
admits more false positives; raise confidence when boxes appear on background.
A larger inference size cannot recover detail already removed from the JPEG.
The former uncustomized 640 × 360 / 5 FPS defaults migrate to Live; customized
settings remain saved. Live continuously samples the newest available frame
after each response, subject to the target rate and server capacity.

## Broader object coverage

New server configurations use **YOLOE-26n with baked LVIS embeddings**, covering
1,203 object categories. Existing `.env` files keep their selected model until
explicitly changed. The client reports the loaded model and vocabulary size.
Switching from one standard COCO model to another still gives only 80 classes;
YOLOE with the broader object vocabulary expands recognition beyond that list.

Supported preparation choices:

| Weights | Purpose |
| --- | --- |
| `yoloe-26n-seg.pt` → `yoloe-26n-lvis.pt` | Broad coverage with the smallest supported YOLOE model |
| `yoloe-26s-seg.pt` → `yoloe-26s-lvis.pt` | Broad coverage with higher model capacity and CPU cost |
| `yoloe-26n-seg-pf.pt`, `yoloe-26s-seg-pf.pt` | Optional 4,585-name exploration vocabulary; includes abstract labels and more ambiguity |
| `yolo26n.pt`, `yolo26s.pt` | Fixed 80-class vocabulary, nano or small |
| `yolo11n.pt`, `yolo11s.pt` | Compatibility with existing YOLO11 installations |

Prepare the chosen weights on the machine running the backend, from `backend`.
In the commands below, use the environment's Python interpreter from your
operating system's [quick start](../README.md#2-prepare-the-backend-for-your-operating-system)
in place of `python`, or activate that environment first:

```bash
python -m pip install -r requirements.txt
python -m pip install -r requirements-vocabulary.txt
python scripts/prepare_model.py
```

Change only the model line in the existing `.env`, preserving origins and other
settings, then restart the detection backend:

```dotenv
VISION_MODEL_PATH=models/yoloe-26n-lvis.pt
VISION_PROVIDER=cpu
VISION_NMS_IOU=0.5
```

For the small variant, prepare with `--model yoloe-26s-seg.pt`, then select
`models/yoloe-26s-lvis.pt`. Preparation uses a tokenizer and downloads a text
encoder of about 254 MB once into the preparation directory. It stores the
class embeddings in the prepared weights; the text encoder is not needed for
inference. Only one model is loaded at a time. No weights or text encoders
download during normal service startup, and no camera frames are stored.

The source vocabulary is `backend/vocabularies/lvis-1203.txt`. Its duplicate
primary names are disambiguated using the dataset's next synonym, for example
the two meanings of bow. To bake your own object list, pass `--vocabulary
/path/to/names.txt`; this writes a separate `*-custom.pt` model. Names must be
unique, with one name per line, at most 2,048 names and 128 characters per name.
This validates labels before downloading/preparing the model. The list itself
does not train the model or guarantee recognition of those objects.

The adapter accepts detection and instance segmentation checkpoints. For YOLOE
it keeps the segmentation metadata and output parsing, but skips constructing
unused masks. Boxes remain the model's original predictions, mapped back from
letterboxing to the actual JPEG, then normalized and bounded to the image.
Non-finite and empty boxes are discarded. Other tasks, such as classification
and pose, are rejected.

YOLOE's broader vocabulary does not guarantee correct recognition of every
object. Zero-shot detection can be less accurate than a model trained for a
specific class. Evaluate the nano and small variants on the actual camera scenes.
The [official YOLOE documentation](https://docs.ultralytics.com/models/yoloe)
describes the vocabulary, model variants, and limitations.

## Bounding boxes

Use Detail in good lighting for small or distant objects, or use a larger JPEG
with inference size 640 for a middle ground. Confidence filters uncertain
detections; it does not change box coordinates. Higher-capacity weights can
improve localization, at additional CPU cost.

`VISION_NMS_IOU` controls suppression of overlapping predictions (0.1–0.9,
default 0.5). YOLOE uses class-agnostic suppression, which helps when multiple
vocabulary names describe the same object. Increase IoU if separate, overlapping
objects disappear; decrease it if duplicate boxes remain. Boxes for a person and
their visible body parts can both be legitimate model predictions.

Boxes are measurements of a sampled frame, not motion predictions. Fast motion
can still outpace a remote inference result; use Live to reduce delay. The
client invalidates boxes when the camera or configuration changes, and retains
the two-second stale-result limit measured from capture. The Session panel's
Reading age includes both processing time and time since the result arrived.

## Capture and compatibility

Capture wakes when the backend slot becomes available and the target interval
has elapsed. It reuses its Canvas and checks the decoded frame count, using
video-frame callbacks to wait for fresh frames and an animation-frame fallback
for older webviews. Video-frame callbacks confirm a new frame even when a
webview's playback statistics freeze; a zero playback counter falls back to
the media clock. It pauses while hidden and cancels scheduled work on stop.
One encode and one transmitted frame remain the limits; no queue accumulates.
Sampling respects the advertised server FPS limit, with a small pacing margin
at that limit. Pacing starts after JPEG transmission so variable encoding time
cannot compress consecutive sends and cause repeated intake drops.

New backends advertise `supported_options.inference_sizes`. The client first
performs the original handshake, then negotiates the requested inference size
only if advertised. With an older server it continues using that server's
frame-size-based inference, and disables the separate inference-size control.

## Compare on the actual server

Use the same image, thread count, and sizes when comparing weights/providers:

The multiline examples below use Bash/Zsh continuations. In PowerShell, put
each command on one line and use your backend environment's interpreter.

```bash
python scripts/benchmark.py /path/to/sample.jpg \
  --model models/yoloe-26n-lvis.pt --size 640 --inference-size 640 --runs 30
python scripts/benchmark.py /path/to/sample.jpg \
  --model models/yoloe-26s-lvis.pt --size 640 --inference-size 640 --runs 30
```

`--size` simulates the transmitted image bounds; `--inference-size` independently
sets model resolution. The output includes dimensions, thread count, confidence,
detected object count, median, and p95 time after warmup. Run benchmarks without
other benchmark jobs. These are model-call timings, not webcam FPS, network
latency, or a labeled bounding-box accuracy evaluation.

The existing OpenVINO preparation option remains available after installing its
export dependencies. Export with `--openvino`, select the returned model
directory, and set `VISION_PROVIDER=openvino`. Benchmark the chosen model on
the deployment CPU before selecting it. The new YOLOE OpenVINO path is not
covered by the PyTorch smoke checks.

The CPU adapter restores `VISION_CPU_THREADS` after the provider's lazy
initialization. Ultralytics otherwise resets that limit during device setup,
which caused severe oversubscription on the i5-8265U test server. The benchmark
prints requested and effective Torch thread counts so this is visible. OpenVINO
still manages its own internal inference threads.

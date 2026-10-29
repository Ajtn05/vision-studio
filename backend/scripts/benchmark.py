"""Benchmark the same image and adapter used by the server; no invented numbers."""

import argparse
import statistics
import sys
import time
from dataclasses import replace
from pathlib import Path

import cv2
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import ServerConfig  # noqa: E402
from app.detector import YoloDetector  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--provider", choices=["cpu", "openvino"], default="cpu")
    parser.add_argument("--runs", type=int, default=30)
    parser.add_argument("--size", type=int, choices=[320, 640, 960], default=640)
    parser.add_argument(
        "--inference-size",
        type=int,
        choices=[320, 640, 960],
        help="Model input size; defaults to --size (JPEG transmission width)",
    )
    parser.add_argument("--confidence", type=float, default=0.4)
    args = parser.parse_args()
    if not 2 <= args.runs <= 1000:
        parser.error("--runs must be between 2 and 1000")
    if not 0.05 <= args.confidence <= 0.95:
        parser.error("--confidence must be between 0.05 and 0.95")
    load_dotenv()
    image = cv2.imread(str(args.image))
    if image is None:
        parser.error("Image could not be decoded")
    height, width = image.shape[:2]
    scale = min(args.size / width, args.size * 9 / 16 / height, 1)
    image = cv2.resize(image, (max(1, int(width * scale)), max(1, int(height * scale))))
    config = replace(ServerConfig.from_environment(), model_path=args.model, provider=args.provider)
    print(f"Starting {args.model.name} / {args.provider}", flush=True)
    detector = YoloDetector(config)
    print(f"Torch threads: requested {config.cpu_threads}, effective {detector.cpu_threads}", flush=True)
    inference_size = args.inference_size or args.size
    for _ in range(3):
        detector.detect(image, args.confidence, inference_size)
    durations = []
    for _ in range(args.runs):
        started = time.perf_counter()
        objects = detector.detect(image, args.confidence, inference_size)
        durations.append((time.perf_counter() - started) * 1000)
    durations.sort()
    print(f"{args.model.name} / {args.provider}: {args.runs} runs after 3 warmups")
    print(
        f"Input: {image.shape[1]}x{image.shape[0]}; inference size: {inference_size}; "
        f"threads: {config.cpu_threads}; confidence: {args.confidence}; objects: {len(objects)}"
    )
    print(
        f"Median: {statistics.median(durations):.1f} ms; p95: {durations[min(len(durations) - 1, int(len(durations) * 0.95))]:.1f} ms"
    )
    print("These are local model timings, not camera-to-result latency or network performance.")


if __name__ == "__main__":
    main()

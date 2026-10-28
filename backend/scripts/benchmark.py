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
    args = parser.parse_args()
    if not 2 <= args.runs <= 1000:
        parser.error("--runs must be between 2 and 1000")
    load_dotenv()
    image = cv2.imread(str(args.image))
    if image is None:
        parser.error("Image could not be decoded")
    height, width = image.shape[:2]
    scale = min(args.size / width, args.size * 9 / 16 / height, 1)
    image = cv2.resize(image, (max(1, int(width * scale)), max(1, int(height * scale))))
    detector = YoloDetector(
        replace(ServerConfig.from_environment(), model_path=args.model, provider=args.provider)
    )
    for _ in range(3):
        detector.detect(image, 0.4, args.size)
    durations = []
    for _ in range(args.runs):
        started = time.perf_counter()
        detector.detect(image, 0.4, args.size)
        durations.append((time.perf_counter() - started) * 1000)
    durations.sort()
    print(f"{args.model.name} / {args.provider}: {args.runs} runs after 3 warmups")
    print(
        f"Median: {statistics.median(durations):.1f} ms; p95: {durations[min(len(durations) - 1, int(len(durations) * 0.95))]:.1f} ms"
    )
    print("These are local model timings, not camera-to-result latency or network performance.")


if __name__ == "__main__":
    main()

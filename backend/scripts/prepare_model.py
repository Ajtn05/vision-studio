"""Explicit, small model download on Linux, separate from service startup."""

import argparse
import os
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=["yolo11n.pt", "yolo26n.pt"], default="yolo11n.pt")
    parser.add_argument("--directory", type=Path, default=Path("models"))
    parser.add_argument("--openvino", action="store_true", help="Also export a dynamic CPU OpenVINO model")
    args = parser.parse_args()
    # Ultralytics can otherwise try installing export extras at runtime.
    os.environ["YOLO_AUTOINSTALL"] = "false"
    from ultralytics import YOLO

    args.directory.mkdir(parents=True, exist_ok=True)
    os.chdir(args.directory)
    model = YOLO(args.model, task="detect")
    print(f"Prepared {Path(args.model).resolve()}")
    if args.openvino:
        exported = model.export(format="openvino", imgsz=640, dynamic=True, device="cpu")
        print(f"Exported {exported}; set VISION_PROVIDER=openvino and VISION_MODEL_PATH accordingly.")


if __name__ == "__main__":
    main()

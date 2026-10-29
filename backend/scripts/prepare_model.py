"""Prepare local weights and bake object vocabulary once, outside service startup."""

import argparse
import importlib.util
import os
from pathlib import Path

DEFAULT_VOCABULARY = Path(__file__).resolve().parents[1] / "vocabularies/lvis-1203.txt"


def read_vocabulary(path: Path) -> list[str]:
    names = [
        line.strip()
        for line in path.read_text().splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not 1 <= len(names) <= 2048 or any(len(name) > 128 for name in names):
        raise ValueError("Vocabulary requires 1–2048 names, each at most 128 characters")
    if len({name.casefold() for name in names}) != len(names):
        raise ValueError("Vocabulary names must be unique")
    return names


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--model",
        choices=[
            "yolo11n.pt",
            "yolo11s.pt",
            "yolo26n.pt",
            "yolo26s.pt",
            "yoloe-26n-seg.pt",
            "yoloe-26s-seg.pt",
            "yoloe-26n-seg-pf.pt",
            "yoloe-26s-seg-pf.pt",
        ],
        default="yoloe-26n-seg.pt",
    )
    parser.add_argument("--directory", type=Path, default=Path("models"))
    parser.add_argument("--vocabulary", type=Path, help="Object names, one per line; defaults to LVIS")
    parser.add_argument("--openvino", action="store_true", help="Also export a dynamic CPU OpenVINO model")
    args = parser.parse_args()
    prompted = args.model in {"yoloe-26n-seg.pt", "yoloe-26s-seg.pt"}
    if args.vocabulary is not None and not prompted:
        parser.error("--vocabulary requires a text-prompt YOLOE checkpoint")
    names = read_vocabulary((args.vocabulary or DEFAULT_VOCABULARY).resolve()) if prompted else None
    if prompted and importlib.util.find_spec("clip") is None:
        parser.error("Install requirements-vocabulary.txt before preparing text-prompt models")
    # Ultralytics can otherwise try installing export extras at runtime.
    os.environ["YOLO_AUTOINSTALL"] = "false"
    import torch
    from ultralytics import YOLO

    torch.set_num_threads(2)
    args.directory.mkdir(parents=True, exist_ok=True)
    os.chdir(args.directory)
    model = YOLO(args.model)
    prepared = Path(args.model).resolve()
    if names is not None:
        model.set_classes(names, model.get_text_pe(names))
        suffix = "lvis" if args.vocabulary is None else "custom"
        prepared = Path(args.model.replace("-seg.pt", f"-{suffix}.pt")).resolve()
        model.save(prepared)
    print(f"Prepared {prepared}")
    print(f"Vocabulary: {len(model.names)} classes. Set VISION_MODEL_PATH={prepared}.")
    if args.openvino:
        exported = model.export(format="openvino", imgsz=640, dynamic=True, device="cpu")
        print(f"Exported {exported}; set VISION_PROVIDER=openvino and VISION_MODEL_PATH accordingly.")


if __name__ == "__main__":
    main()

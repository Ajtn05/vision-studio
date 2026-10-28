"""A small detector contract and the normal, real Ultralytics implementation."""

import os
from typing import Protocol

import numpy as np
from numpy.typing import NDArray

from .config import ServerConfig
from .schemas import Detection


class Detector(Protocol):
    model_name: str
    provider: str

    def detect(self, image: NDArray[np.uint8], confidence: float, image_size: int) -> list[Detection]: ...


class YoloDetector:
    def __init__(self, config: ServerConfig) -> None:
        # Loading only local weights prevents surprise downloads during boot.
        if not config.model_path.exists():
            raise FileNotFoundError(
                f"Model missing: {config.model_path}. Run scripts/prepare_model.py on Linux first."
            )
        if config.provider == "openvino" and not config.model_path.is_dir():
            raise ValueError("OpenVINO requires a previously exported model directory")
        if config.provider == "cpu" and config.model_path.suffix != ".pt":
            raise ValueError("CPU provider requires a local .pt detection model")

        os.environ["YOLO_AUTOINSTALL"] = "false"
        import torch
        from ultralytics import YOLO

        torch.set_num_threads(config.cpu_threads)
        self.model_name = config.model_path.name
        self.provider = config.provider
        self._model = YOLO(str(config.model_path), task="detect")
        # Initialize lazy provider code before reporting model_ready to clients.
        self.detect(np.zeros((360, 640, 3), dtype=np.uint8), confidence=0.4, image_size=640)

    def detect(self, image: NDArray[np.uint8], confidence: float, image_size: int) -> list[Detection]:
        result = self._model.predict(
            source=image,
            conf=confidence,
            imgsz=image_size,
            device="cpu",
            max_det=100,
            verbose=False,
        )[0]
        objects = []
        if result.boxes is None:
            return objects
        for box in result.boxes:
            left, top, right, bottom = box.xyxyn[0].tolist()
            left, top = max(0.0, min(1.0, left)), max(0.0, min(1.0, top))
            right, bottom = max(left, min(1.0, right)), max(top, min(1.0, bottom))
            class_id = int(box.cls[0].item())
            objects.append(
                Detection(
                    class_id=class_id,
                    label=str(result.names[class_id]),
                    confidence=float(box.conf[0].item()),
                    x=left,
                    y=top,
                    width=right - left,
                    height=bottom - top,
                )
            )
        return objects

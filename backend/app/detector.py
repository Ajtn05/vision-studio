"""A small detector contract and the normal, real Ultralytics implementation."""

import os
from functools import partial
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
        from ultralytics.utils import YAML

        torch.set_num_threads(config.cpu_threads)
        self.model_name = config.model_path.name
        self.provider = config.provider
        task = None
        if config.provider == "openvino":
            metadata_path = config.model_path / "metadata.yaml"
            if not metadata_path.is_file():
                raise ValueError("Exported model requires Ultralytics metadata.yaml")
            task = YAML.load(metadata_path).get("task")
            if task not in {"detect", "segment"}:
                raise ValueError("Exported model metadata must specify detect or segment")
        self._model = YOLO(str(config.model_path), task=task)
        if self._model.task not in {"detect", "segment"}:
            raise ValueError("Use an object detection or instance segmentation model")
        self._predict = partial(self._model.predict, iou=config.nms_iou)
        if self._model.task == "segment":
            from ultralytics.engine.model import Model

            from .box_predictor import BoxesOnlySegmentationPredictor

            # YOLOE ships segmentation checkpoints. Keep the segmentation task
            # metadata for the correct class count, but skip decoding masks:
            # this application consumes only the model's predicted boxes.
            self._predict = partial(
                Model.predict,
                self._model,
                predictor=BoxesOnlySegmentationPredictor,
                agnostic_nms=True,
                iou=config.nms_iou,
            )
        # Initialize lazy provider code before reporting model_ready to clients.
        self.detect(np.zeros((360, 640, 3), dtype=np.uint8), confidence=0.4, image_size=640)
        # Ultralytics select_device resets Torch's thread count while setting
        # up its lazy backend. Restore the requested limit after that setup.
        torch.set_num_threads(config.cpu_threads)
        self.cpu_threads = torch.get_num_threads()
        self.class_count = len(self._model.names)

    def detect(self, image: NDArray[np.uint8], confidence: float, image_size: int) -> list[Detection]:
        result = self._predict(
            source=image,
            conf=confidence,
            imgsz=image_size,
            rect=True,
            device="cpu",
            max_det=100,
            verbose=False,
        )[0]
        objects = []
        if result.boxes is None:
            return objects
        # Transfer/normalize the batch once. Iterating Boxes constructs tensor
        # wrappers and recalculates normalized coordinates for every object.
        boxes = result.boxes.cpu().numpy()
        corners = np.clip(boxes.xyxyn, 0.0, 1.0)
        categories, scores = boxes.cls, boxes.conf
        valid = (
            np.isfinite(corners).all(axis=1)
            & np.isfinite(categories)
            & np.isfinite(scores)
            & (corners[:, 2] > corners[:, 0])
            & (corners[:, 3] > corners[:, 1])
        )
        for (left, top, right, bottom), category, score in zip(
            corners[valid], categories[valid], scores[valid]
        ):
            class_id = int(category)
            objects.append(
                Detection(
                    class_id=class_id,
                    label=str(result.names[class_id]),
                    confidence=float(score),
                    x=left,
                    y=top,
                    width=right - left,
                    height=bottom - top,
                )
            )
        return objects

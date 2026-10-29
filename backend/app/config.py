"""Environment configuration; runtime frame settings live in schemas.py."""

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class ServerConfig:
    model_path: Path = Path("models/yoloe-26n-lvis.pt")
    hand_model_path: Path = Path("models/hand_landmarker.task")
    provider: str = "cpu"
    cpu_threads: int = 2
    nms_iou: float = 0.5
    allowed_origins: tuple[str, ...] = ("tauri://localhost", "http://localhost:1420", "http://127.0.0.1:1420")
    allow_missing_origin: bool = False
    max_message_bytes: int = 1_048_576
    max_width: int = 1280
    max_height: int = 720
    inference_timeout_seconds: float = 15
    idle_timeout_seconds: float = 30
    max_fps: int = 10

    @classmethod
    def from_environment(cls) -> "ServerConfig":
        config = cls(
            model_path=Path(os.getenv("VISION_MODEL_PATH", str(cls.model_path))),
            hand_model_path=Path(os.getenv("VISION_HAND_MODEL_PATH", str(cls.hand_model_path))),
            provider=os.getenv("VISION_PROVIDER", "cpu"),
            cpu_threads=int(os.getenv("VISION_CPU_THREADS", "2")),
            nms_iou=float(os.getenv("VISION_NMS_IOU", "0.5")),
            allowed_origins=tuple(
                origin.strip()
                for origin in os.getenv("VISION_ALLOWED_ORIGINS", ",".join(cls.allowed_origins)).split(",")
                if origin.strip()
            ),
            allow_missing_origin=os.getenv("VISION_ALLOW_MISSING_ORIGIN", "false").lower() == "true",
            max_message_bytes=int(os.getenv("VISION_MAX_MESSAGE_BYTES", "1048576")),
            inference_timeout_seconds=float(os.getenv("VISION_INFERENCE_TIMEOUT_SECONDS", "15")),
            idle_timeout_seconds=float(os.getenv("VISION_IDLE_TIMEOUT_SECONDS", "30")),
        )
        if config.provider not in {"cpu", "openvino"}:
            raise ValueError("VISION_PROVIDER must be cpu or openvino")
        if not 1 <= config.cpu_threads <= 8:
            raise ValueError("VISION_CPU_THREADS must be between 1 and 8")
        if not 0.1 <= config.nms_iou <= 0.9:
            raise ValueError("VISION_NMS_IOU must be between 0.1 and 0.9")
        if not config.allowed_origins or any(
            "*" in origin or origin == "null" for origin in config.allowed_origins
        ):
            raise ValueError("Set explicit non-null VISION_ALLOWED_ORIGINS; wildcards are forbidden")
        if not 1024 <= config.max_message_bytes <= 4_194_304:
            raise ValueError("VISION_MAX_MESSAGE_BYTES must be 1024–4194304")
        if not 1 <= config.inference_timeout_seconds <= 60 or not 10 <= config.idle_timeout_seconds <= 300:
            raise ValueError("Inference timeout must be 1–60s and idle timeout 10–300s")
        return config

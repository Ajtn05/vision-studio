import struct
import threading

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.config import ServerConfig
from app.main import create_app
from app.schemas import Detection

ORIGIN = "http://localhost:1420"


class FakeDetector:
    model_name = "test-detector"
    provider = "test"

    def __init__(self) -> None:
        self.calls = 0
        self.entered = threading.Event()
        self.release = threading.Event()
        self.release.set()

    def detect(self, image, confidence: float, image_size: int) -> list[Detection]:
        self.calls += 1
        self.entered.set()
        if not self.release.wait(timeout=3):
            raise RuntimeError("Test did not release the fake detector")
        return [
            Detection(class_id=0, label="test object", confidence=0.9, x=0.1, y=0.2, width=0.3, height=0.4)
        ]


def make_frame(frame_id: int = 1, width: int = 64, height: int = 36, captured_at: float = 123456.5) -> bytes:
    success, encoded = cv2.imencode(".jpg", np.zeros((height, width, 3), dtype=np.uint8))
    assert success
    return struct.pack("!4sId", b"VS01", frame_id, captured_at) + encoded.tobytes()


@pytest.fixture
def fake_detector():
    return FakeDetector()


@pytest.fixture
def client(fake_detector):
    with TestClient(create_app(ServerConfig(), fake_detector)) as client:
        yield client

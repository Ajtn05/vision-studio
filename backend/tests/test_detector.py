import sys
from types import SimpleNamespace

import numpy as np

from app.config import ServerConfig
from app.detector import YoloDetector


def test_bulk_detection_conversion_clamps_bounds_and_skips_invalid_boxes():
    class Boxes:
        xyxyn = np.array(
            [
                [-0.1, 0.2, 1.2, 0.8],
                [0.4, 0.4, 0.3, 0.8],
                [0.1, 0.2, 0.8, 0.9],
                [0.1, 0.1, 0.5, 0.5],
            ]
        )
        cls = np.array([0, 1, 1, 1])
        conf = np.array([0.9, 0.8, np.nan, 0.75])

        def cpu(self):
            return self

        def numpy(self):
            return self

    class Model:
        def predict(self, **options):
            assert options["imgsz"] == 960
            assert options["conf"] == 0.25
            assert options["rect"] is True
            return [SimpleNamespace(boxes=Boxes(), names={0: "person", 1: "bottle"})]

    detector = YoloDetector.__new__(YoloDetector)
    detector._predict = Model().predict
    objects = detector.detect(np.zeros((360, 640, 3), dtype=np.uint8), 0.25, 960)
    assert [item.label for item in objects] == ["person", "bottle"]
    assert objects[0].x == 0 and objects[0].width == 1
    assert objects[1].confidence == 0.75


def test_empty_model_result():
    detector = YoloDetector.__new__(YoloDetector)
    detector._predict = lambda **_: [SimpleNamespace(boxes=None)]
    assert detector.detect(np.zeros((36, 64, 3), dtype=np.uint8), 0.4, 320) == []


def test_cpu_thread_limit_survives_lazy_provider_initialization(tmp_path, monkeypatch):
    threads = 0
    calls = 0

    def set_threads(count):
        nonlocal threads
        threads = count

    def predict(**options):
        nonlocal calls
        calls += 1
        if calls == 1:
            set_threads(8)  # Ultralytics select_device during its first predict.
        return [SimpleNamespace(boxes=None)]

    torch = SimpleNamespace(set_num_threads=set_threads, get_num_threads=lambda: threads)
    model = SimpleNamespace(task="detect", predict=predict, names={0: "person"})
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=lambda *args, **kwargs: model))
    monkeypatch.setitem(sys.modules, "ultralytics.utils", SimpleNamespace(YAML=None))
    weights = tmp_path / "test.pt"
    weights.touch()
    detector = YoloDetector(ServerConfig(model_path=weights, cpu_threads=2))
    detector.detect(np.zeros((36, 64, 3), dtype=np.uint8), 0.4, 320)
    assert threads == detector.cpu_threads == 2

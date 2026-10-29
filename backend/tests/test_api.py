import json
from pathlib import Path

import pytest
from conftest import ORIGIN, make_frame
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.config import ServerConfig
from app.main import create_app
from app.schemas import Detection, DetectionResponse


def configure(socket, **options):
    socket.send_json({"type": "configure", **options})
    ready = socket.receive_json()
    assert ready["type"] == "ready"
    return ready


def test_health_and_info_do_not_infer(client, fake_detector):
    assert client.get("/health").json() == {"status": "ok", "model_ready": True, "worker_busy": False}
    info = client.get("/api/info").json()
    assert info["model_name"] == "test-detector"
    assert info["capabilities"]["max_in_flight"] == 1
    assert fake_detector.calls == 0


def test_health_remains_available_without_model():
    with TestClient(
        create_app(
            ServerConfig(
                model_path=Path("nonexistent-test-model.pt"),
                hand_model_path=Path("nonexistent-test-hands.task"),
            )
        )
    ) as client:
        assert client.get("/health").status_code == 200
        assert client.get("/health").json()["model_ready"] is False


def test_cors_is_restricted(client):
    allowed = client.get("/health", headers={"Origin": ORIGIN})
    assert allowed.headers["access-control-allow-origin"] == ORIGIN
    denied = client.get("/health", headers={"Origin": "https://untrusted.example"})
    assert "access-control-allow-origin" not in denied.headers


@pytest.mark.parametrize("origin", [None, "null", "https://untrusted.example"])
def test_websocket_rejects_unapproved_origins(client, origin):
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/detect", headers={"Origin": origin} if origin else {}):
            pass


def test_websocket_vertical_slice(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        configure(socket, confidence=0.4, resolution="640x360")
        socket.send_bytes(make_frame(42))
        result = DetectionResponse.model_validate(socket.receive_json())
        assert result.frame_id == 42
        assert result.captured_at == 123456.5
        assert result.image_width == 64 and result.image_height == 36
        assert result.objects[0].label == "test object"
        assert result.processing_ms >= result.inference_ms >= 0
        socket.send_json({"type": "ping", "nonce": 7})
        assert socket.receive_json() == {"type": "pong", "nonce": 7}


def test_second_client_rejected(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as first:
        configure(first)
        with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as second:
            assert second.receive_json()["code"] == "unavailable"
            with pytest.raises(WebSocketDisconnect):
                second.receive_json()


def test_busy_frame_dropped_and_ping_and_health_still_work(client, fake_detector):
    fake_detector.release.clear()
    try:
        with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
            configure(socket)
            socket.send_bytes(make_frame(1))
            assert fake_detector.entered.wait(timeout=1)
            socket.send_bytes(make_frame(2))
            assert socket.receive_json() == {"type": "dropped", "frame_id": 2, "reason": "busy"}
            socket.send_json({"type": "ping", "nonce": 9})
            assert socket.receive_json() == {"type": "pong", "nonce": 9}
            assert client.get("/health").json()["worker_busy"] is True
            fake_detector.release.set()
            assert socket.receive_json()["frame_id"] == 1
            assert fake_detector.calls == 1
    finally:
        fake_detector.release.set()


@pytest.mark.parametrize(
    "control",
    [
        [],
        {"type": "configure", "confidence": 2},
        {"type": "configure", "model": "not-loaded.pt"},
        {"type": "configure", "unknown": 5},
        {"type": "ping", "nonce": float("nan")},
    ],
)
def test_invalid_controls_return_error(client, control):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        socket.send_text(json.dumps(control))
        assert socket.receive_json()["code"] == "invalid_control"


def test_frame_before_configuration_is_rejected(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        socket.send_bytes(make_frame())
        assert socket.receive_json()["code"] == "invalid_frame"


def test_duplicate_frame_ids_rejected(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        configure(socket)
        socket.send_bytes(make_frame())
        assert socket.receive_json()["type"] == "detections"
        socket.send_bytes(make_frame())
        assert socket.receive_json()["fatal"] is True


def test_runtime_configuration_revision(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        configure(socket)
        configure(socket, revision=2, confidence=0.8, resolution="320x180")
        socket.send_bytes(make_frame())
        assert socket.receive_json()["revision"] == 2


def test_inference_size_is_independent_of_transmission_size(client, fake_detector):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        ready = configure(socket, resolution="320x180", inference_size=960)
        assert ready["info"]["supported_options"]["inference_sizes"] == [320, 640, 960]
        socket.send_bytes(make_frame(width=320, height=180))
        result = socket.receive_json()
        assert result["image_width"] == 320 and result["image_height"] == 180
        assert fake_detector.image_sizes == [960]


def test_legacy_client_uses_frame_width_for_inference(client, fake_detector):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        configure(socket, resolution="320x180")
        socket.send_bytes(make_frame())
        socket.receive_json()
        assert fake_detector.image_sizes == [320]


def test_unsupported_inference_size_rejected(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        socket.send_json({"type": "configure", "inference_size": 4096})
        assert socket.receive_json()["code"] == "invalid_control"


def test_model_catalog_reports_available_modes_and_setup_reason(client):
    info = client.get("/api/info").json()
    assert info["supported_options"]["model_selection"] is True
    models = {model["id"]: model for model in info["models"]}
    assert models["objects"]["available"] is True
    assert models["measurement"]["available"] is True
    assert models["hands"]["available"] is False
    assert "prepare_hand_model.py" in models["hands"]["reason"]


def test_switching_to_measurement_uses_the_existing_detector(client, fake_detector):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        first = configure(socket, model="test-detector")  # Legacy filename still works.
        assert first["config"]["model"] == "objects"
        ready = configure(socket, revision=2, model="measurement")
        assert ready["info"]["active_model"] == "measurement"
        socket.send_bytes(make_frame())
        result = socket.receive_json()
        assert result["model"] == "measurement"
        assert result["revision"] == 2
        assert fake_detector.calls == 1


def test_uninstalled_hand_model_rejected_with_setup_instructions(client):
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        socket.send_json({"type": "configure", "model": "hands"})
        error = socket.receive_json()
        assert error["code"] == "invalid_control"
        assert "requirements-hands.txt" in error["message"]


def test_hand_only_server_is_ready_and_routes_to_hand_detector(client, fake_detector):
    worker = client.app.state.worker
    worker.hand_detector = fake_detector
    worker.detector = None
    assert client.get("/health").json()["model_ready"] is True
    with client.websocket_connect("/ws/detect", headers={"Origin": ORIGIN}) as socket:
        ready = configure(socket)
        assert ready["config"]["model"] == "hands"
        assert ready["info"]["active_model"] == "hands"
        socket.send_bytes(make_frame())
        assert socket.receive_json()["model"] == "hands"
        assert fake_detector.calls == 1


def test_detection_bounds_and_serialization():
    with pytest.raises(ValueError):
        Detection(class_id=0, label="person", confidence=0.9, x=0.8, y=0, width=0.3, height=1)
    item = Detection(class_id=0, label="person", confidence=0.9, x=0.1, y=0.2, width=0.3, height=0.4)
    assert json.loads(item.model_dump_json(exclude_none=True)) == {
        "class_id": 0,
        "label": "person",
        "confidence": 0.9,
        "x": 0.1,
        "y": 0.2,
        "width": 0.3,
        "height": 0.4,
    }

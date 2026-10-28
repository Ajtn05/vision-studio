import pytest

from app.config import ServerConfig


@pytest.mark.parametrize("origins", ["*", "https://*.example.com", "null", ""])
def test_unsafe_origin_configuration_is_rejected(monkeypatch, origins):
    monkeypatch.setenv("VISION_ALLOWED_ORIGINS", origins)
    with pytest.raises(ValueError, match="explicit"):
        ServerConfig.from_environment()


def test_model_and_origins_are_configurable(monkeypatch):
    monkeypatch.setenv("VISION_ALLOWED_ORIGINS", "tauri://localhost,http://localhost:1420")
    monkeypatch.setenv("VISION_PROVIDER", "openvino")
    config = ServerConfig.from_environment()
    assert config.provider == "openvino"
    assert config.allowed_origins == ("tauri://localhost", "http://localhost:1420")

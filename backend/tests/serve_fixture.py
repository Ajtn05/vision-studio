"""Explicit integration-test server. Never used by the normal entry point."""

import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from conftest import FakeDetector  # noqa: E402

from app.config import ServerConfig  # noqa: E402
from app.main import create_app  # noqa: E402

if __name__ == "__main__":
    print("TEST FIXTURE: synthetic detections only, no real model")
    uvicorn.run(
        create_app(ServerConfig(), FakeDetector()),
        host="127.0.0.1",
        port=8000,
        ws="websockets-sansio",
        ws_max_size=1048576,
        ws_per_message_deflate=False,
    )

"""Explicit integration-test server. Never used by the normal entry point."""

import argparse
import sys
from pathlib import Path

import uvicorn

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from conftest import FakeDetector  # noqa: E402

from app.config import ServerConfig  # noqa: E402
from app.main import create_app  # noqa: E402
from app.schemas import Detection, HandDetails, Landmark  # noqa: E402


class FakeHandDetector(FakeDetector):
    model_name = "synthetic-hand-fixture"
    class_count = 2

    def detect(self, image, confidence, image_size):
        from test_hands import open_hand

        points = open_hand()
        xs, ys = 0.5 + points[:, 0] * 4, 0.8 - points[:, 1] * 4
        return [
            Detection(
                class_id=0,
                label="Left hand (fixture)",
                confidence=0.99,
                x=float(xs.min()),
                y=float(ys.min()),
                width=float(xs.max() - xs.min()),
                height=float(ys.max() - ys.min()),
                hand=HandDetails(
                    handedness="Left",
                    extended_fingers=["thumb", "index", "middle", "ring", "pinky"],
                    landmarks=[Landmark(x=float(x), y=float(y), z=0) for x, y in zip(xs, ys)],
                ),
            )
        ]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--hands", action="store_true", help="Include synthetic hand landmarks")
    args = parser.parse_args()
    print("TEST FIXTURE: synthetic detections only, no real model")
    app = create_app(ServerConfig(hand_model_path=Path("missing-test-hands.task")), FakeDetector())
    if args.hands:
        app.state.worker.hand_detector = FakeHandDetector()
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=args.port,
        ws="websockets-sansio",
        ws_max_size=1048576,
        ws_per_message_deflate=False,
    )

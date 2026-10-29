from types import SimpleNamespace

import numpy as np
import pytest

from app.hand_detector import HandDetector, extended_fingers


def open_hand():
    points = np.zeros((21, 3))
    points[1:5] = [(-0.02, 0.015, 0), (-0.045, 0.025, 0), (-0.065, 0.033, 0), (-0.085, 0.041, 0)]
    for base, x, lengths in (
        (5, -0.03, [0.05, 0.08, 0.10, 0.12]),
        (9, 0, [0.05, 0.085, 0.11, 0.14]),
        (13, 0.025, [0.05, 0.08, 0.105, 0.125]),
        (17, 0.05, [0.045, 0.07, 0.085, 0.10]),
    ):
        points[base : base + 4] = [(x, y, 0) for y in lengths]
    return points


def test_finger_estimate_survives_rotation_and_mirroring():
    points = open_hand()
    expected = ["thumb", "index", "middle", "ring", "pinky"]
    assert extended_fingers(points) == expected
    # Rotate the hand into another 3D plane and reflect its handedness.
    transform = np.array([[0, -1, 0], [0, 0, 1], [-1, 0, 0]])
    assert extended_fingers(points @ transform) == expected
    points[:, 0] *= -1
    assert extended_fingers(points) == expected


def test_curled_and_degenerate_fingers_are_not_counted():
    points = open_hand()
    for base in (1, 5, 9, 13, 17):
        points[base + 3] = points[0]
    assert extended_fingers(points) == []
    points[5:9] = open_hand()[5:9]
    assert extended_fingers(points) == ["index"]
    assert extended_fingers(np.zeros((21, 3))) == []


def test_real_adapter_converts_rgb_and_preserves_handedness():
    landmarks = [SimpleNamespace(x=float(x), y=float(y), z=float(z)) for x, y, z in open_hand() + 0.5]
    world = [SimpleNamespace(x=float(x), y=float(y), z=float(z)) for x, y, z in open_hand()]
    image = np.zeros((36, 64, 3), dtype=np.uint8)
    image[0, 0] = [10, 20, 30]

    def detect(rgb):
        assert rgb[0, 0].tolist() == [30, 20, 10]
        return SimpleNamespace(
            hand_landmarks=[landmarks],
            hand_world_landmarks=[world],
            handedness=[[SimpleNamespace(category_name="Left", score=0.99)]],
        )

    detector = HandDetector.__new__(HandDetector)
    detector._confidence = 0.4
    detector._landmarker = SimpleNamespace(detect=detect)
    detector._mp = SimpleNamespace(Image=lambda **kwargs: kwargs["data"], ImageFormat=SimpleNamespace(SRGB=1))
    result = detector.detect(image, 0.4, 320)
    assert len(result) == 1
    assert result[0].hand.handedness == "Left"
    assert len(result[0].hand.landmarks) == 21
    assert len(result[0].hand.extended_fingers) == 5
    assert result[0].x == pytest.approx(0.415)


def test_changing_hand_threshold_closes_and_recreates_graph():
    closed = []
    options = []
    detector = HandDetector.__new__(HandDetector)
    detector._confidence = 0.4
    detector._landmarker = SimpleNamespace(close=lambda: closed.append(True))
    detector._base_options = object()

    def create(configuration):
        options.append(configuration)
        return SimpleNamespace(
            detect=lambda _: SimpleNamespace(hand_landmarks=[], hand_world_landmarks=[], handedness=[]),
            close=lambda: closed.append(True),
        )

    detector._vision = SimpleNamespace(
        HandLandmarker=SimpleNamespace(create_from_options=create),
        HandLandmarkerOptions=lambda **kwargs: kwargs,
        RunningMode=SimpleNamespace(IMAGE=1),
    )
    detector._mp = SimpleNamespace(Image=lambda **kwargs: kwargs["data"], ImageFormat=SimpleNamespace(SRGB=1))
    image = np.zeros((36, 64, 3), dtype=np.uint8)
    assert detector.detect(image, 0.75, 320) == []
    assert options[0]["min_hand_detection_confidence"] == 0.75
    assert options[0]["min_hand_presence_confidence"] == 0.75
    detector.detect(image, 0.75, 960)
    assert len(options) == len(closed) == 1
    detector.close()
    assert len(closed) == 2

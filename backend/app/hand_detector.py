"""Local MediaPipe hand landmarks and rotation-independent finger estimates."""

import math
from pathlib import Path

import cv2
import numpy as np
from numpy.typing import NDArray

from .schemas import Detection, HandDetails, Landmark

FINGERS = (
    ("thumb", 1, 2, 3, 4),
    ("index", 5, 6, 7, 8),
    ("middle", 9, 10, 11, 12),
    ("ring", 13, 14, 15, 16),
    ("pinky", 17, 18, 19, 20),
)


def joint_angle(a: NDArray, b: NDArray, c: NDArray) -> float:
    first, second = a - b, c - b
    magnitude = float(np.linalg.norm(first) * np.linalg.norm(second))
    if magnitude < 1e-12:
        return 0.0
    return math.degrees(math.acos(float(np.clip(np.dot(first, second) / magnitude, -1, 1))))


def extended_fingers(points: NDArray) -> list[str]:
    """Estimate extension from 3D joint angles, rather than screen up/down."""
    raised = []
    for name, base, proximal, distal, tip in FINGERS:
        if (
            joint_angle(points[base], points[proximal], points[distal]) > 155
            and joint_angle(points[proximal], points[distal], points[tip]) > 150
            and np.linalg.norm(points[tip] - points[0]) > np.linalg.norm(points[proximal] - points[0]) * 1.1
        ):
            # A straight thumb folded across the palm is not a raised thumb.
            if name == "thumb" and np.linalg.norm(points[tip] - points[5]) < (
                np.linalg.norm(points[5] - points[17]) * 0.45
            ):
                continue
            raised.append(name)
    return raised


class HandDetector:
    provider = "mediapipe-cpu"
    class_count = 2

    def __init__(self, model_path: Path) -> None:
        if not model_path.is_file():
            raise FileNotFoundError("Run python scripts/prepare_hand_model.py to install hand weights.")
        try:
            import mediapipe as mp
            from mediapipe.tasks import python
            from mediapipe.tasks.python import vision
        except ImportError as error:
            raise RuntimeError("Install requirements-hands.txt on the backend to enable fingers.") from error
        self.model_name = model_path.name
        self._mp = mp
        self._vision = vision
        self._base_options = python.BaseOptions(
            model_asset_path=str(model_path), delegate=python.BaseOptions.Delegate.CPU
        )
        self._landmarker = None
        self._confidence: float | None = None

    def detect(self, image: NDArray[np.uint8], confidence: float, image_size: int) -> list[Detection]:
        # IMAGE mode deliberately avoids keeping tracking state across clients,
        # camera switches, or long gaps while another model is selected.
        if confidence != self._confidence:
            self.close()
            self._landmarker = self._vision.HandLandmarker.create_from_options(
                self._vision.HandLandmarkerOptions(
                    base_options=self._base_options,
                    running_mode=self._vision.RunningMode.IMAGE,
                    num_hands=2,
                    min_hand_detection_confidence=confidence,
                    min_hand_presence_confidence=confidence,
                )
            )
            self._confidence = confidence
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        result = self._landmarker.detect(self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb))
        objects = []
        for landmarks, world, categories in zip(
            result.hand_landmarks, result.hand_world_landmarks, result.handedness
        ):
            if len(landmarks) != 21 or len(world) != 21 or not categories:
                continue
            coordinates = np.array([(point.x, point.y, point.z) for point in world])
            image_points = np.array([(point.x, point.y, point.z) for point in landmarks])
            if not np.isfinite(coordinates).all() or not np.isfinite(image_points).all():
                continue
            side = categories[0].category_name
            score = float(categories[0].score)
            if side not in {"Left", "Right"} or not math.isfinite(score) or not 0 <= score <= 1:
                continue
            # This score describes handedness, not hand detection confidence.
            # The slider controls MediaPipe's detection/presence thresholds.
            xs, ys = np.clip(image_points[:, :2], 0, 1).T
            left, top, right, bottom = float(xs.min()), float(ys.min()), float(xs.max()), float(ys.max())
            if right <= left or bottom <= top:
                continue
            objects.append(
                Detection(
                    class_id=0 if side == "Left" else 1,
                    label=f"{side} hand",
                    confidence=score,
                    x=left,
                    y=top,
                    width=right - left,
                    height=bottom - top,
                    hand=HandDetails(
                        handedness=side,
                        landmarks=[
                            Landmark(x=float(x), y=float(y), z=float(point.z))
                            for x, y, point in zip(xs, ys, landmarks)
                        ],
                        extended_fingers=extended_fingers(coordinates),
                    ),
                )
            )
        return objects

    def close(self) -> None:
        if self._landmarker is not None:
            self._landmarker.close()
            self._landmarker = None
        self._confidence = None

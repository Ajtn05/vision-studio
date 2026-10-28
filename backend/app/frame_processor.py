"""Validate the envelope and JPEG dimensions before allocating an image."""

import math
import struct
from dataclasses import dataclass

import cv2
import numpy as np
from numpy.typing import NDArray

from .config import ServerConfig

FRAME_HEADER = struct.Struct("!4sId")
MAGIC = b"VS01"
SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


class FrameError(ValueError):
    """The sender supplied an unsupported or unsafe frame."""


@dataclass(frozen=True)
class Frame:
    frame_id: int
    captured_at: float
    jpeg: bytes


def parse_frame(data: bytes, max_message_bytes: int) -> Frame:
    if len(data) > max_message_bytes:
        raise FrameError("Frame exceeds the message size limit")
    if len(data) < FRAME_HEADER.size + 4:
        raise FrameError("Frame is too short")
    magic, frame_id, captured_at = FRAME_HEADER.unpack_from(data)
    if magic != MAGIC:
        raise FrameError("Unsupported frame protocol; expected VS01")
    if frame_id == 0 or not math.isfinite(captured_at) or captured_at < 0:
        raise FrameError("Invalid frame ID or capture timestamp")
    return Frame(frame_id, captured_at, data[FRAME_HEADER.size :])


def jpeg_dimensions(jpeg: bytes) -> tuple[int, int]:
    if not jpeg.startswith(b"\xff\xd8") or not jpeg.endswith(b"\xff\xd9"):
        raise FrameError("Expected a complete JPEG image")
    offset = 2
    while offset < len(jpeg):
        if jpeg[offset] != 0xFF:
            raise FrameError("Malformed JPEG marker")
        while offset < len(jpeg) and jpeg[offset] == 0xFF:
            offset += 1
        if offset >= len(jpeg):
            break
        marker = jpeg[offset]
        offset += 1
        if marker in {0xD9, 0xDA}:
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD8:
            continue
        if offset + 2 > len(jpeg):
            break
        length = int.from_bytes(jpeg[offset : offset + 2], "big")
        if length < 2 or offset + length > len(jpeg):
            raise FrameError("Malformed JPEG segment")
        if marker in SOF_MARKERS:
            if length < 8:
                raise FrameError("Invalid JPEG dimensions")
            height, width = struct.unpack_from("!HH", jpeg, offset + 3)
            if width == 0 or height == 0:
                raise FrameError("Empty JPEG image")
            return width, height
        offset += length
    raise FrameError("JPEG has no supported image header")


def decode_frame(frame: Frame, config: ServerConfig, max_size: tuple[int, int]) -> NDArray[np.uint8]:
    width, height = jpeg_dimensions(frame.jpeg)
    if width > min(config.max_width, max_size[0]) or height > min(config.max_height, max_size[1]):
        raise FrameError("JPEG dimensions exceed the configured resolution")
    try:
        image = cv2.imdecode(np.frombuffer(frame.jpeg, dtype=np.uint8), cv2.IMREAD_COLOR)
    except cv2.error as error:
        raise FrameError("JPEG decoder rejected the image") from error
    if image is None or image.shape[:2] != (height, width):
        raise FrameError("JPEG could not be decoded consistently")
    return image

import struct

import pytest
from conftest import make_frame

from app.config import ServerConfig
from app.frame_processor import Frame, FrameError, decode_frame, jpeg_dimensions, parse_frame


def test_envelope_keeps_metadata_with_jpeg():
    frame = parse_frame(make_frame(42, captured_at=1000.25), 1048576)
    assert frame.frame_id == 42
    assert frame.captured_at == 1000.25
    assert jpeg_dimensions(frame.jpeg) == (64, 36)
    assert decode_frame(frame, ServerConfig(), (640, 360)).shape == (36, 64, 3)


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"VS01",
        b"bad!" + make_frame()[4:],
        make_frame(0),
        struct.pack("!4sId", b"VS01", 1, float("nan")) + b"jpeg",
        struct.pack("!4sId", b"VS01", 1, float("inf")) + b"jpeg",
        struct.pack("!4sId", b"VS01", 1, -1) + b"jpeg",
    ],
)
def test_invalid_envelopes(data):
    with pytest.raises(FrameError):
        parse_frame(data, 1048576)


def test_size_limit_before_decoding():
    with pytest.raises(FrameError, match="size limit"):
        parse_frame(make_frame(), 20)


@pytest.mark.parametrize("jpeg", [b"not a jpeg", b"\xff\xd8\xff\xd9", b"\xff\xd8\xff\xc0\x00\xff\xff\xd9"])
def test_malformed_jpeg(jpeg):
    with pytest.raises(FrameError):
        decode_frame(Frame(1, 0, jpeg), ServerConfig(), (640, 360))


def test_dimensions_rejected_before_opencv_allocation(monkeypatch):
    frame = parse_frame(make_frame(width=641, height=360), 1048576)

    def must_not_decode(*args):
        pytest.fail("Oversized JPEG reached OpenCV")

    monkeypatch.setattr("app.frame_processor.cv2.imdecode", must_not_decode)
    with pytest.raises(FrameError, match="dimensions"):
        decode_frame(frame, ServerConfig(), (640, 360))


def test_truncated_jpeg():
    frame = parse_frame(make_frame(), 1048576)
    with pytest.raises(FrameError, match="complete JPEG"):
        decode_frame(Frame(1, 0, frame.jpeg[:-2]), ServerConfig(), (640, 360))

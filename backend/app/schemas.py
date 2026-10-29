"""The public JSON protocol. Reject unknown options instead of ignoring typos."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

RESOLUTIONS = {"320x180": (320, 180), "640x360": (640, 360), "960x540": (960, 540)}
INFERENCE_SIZES = (320, 640, 960)


class StrictMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class SessionConfig(StrictMessage):
    type: Literal["configure"] = "configure"
    revision: int = Field(default=1, ge=1, le=2**31 - 1, strict=True)
    confidence: float = Field(default=0.4, ge=0.05, le=0.95)
    resolution: Literal["320x180", "640x360", "960x540"] = "640x360"
    # Omitted by older clients: preserve their frame-size-based behavior.
    inference_size: Literal[320, 640, 960] | None = None
    model: str | None = Field(default=None, max_length=128)


class Ping(StrictMessage):
    type: Literal["ping"]
    nonce: int = Field(ge=0, le=2**53 - 1, strict=True)


class Detection(StrictMessage):
    class_id: int = Field(ge=0)
    label: str = Field(min_length=1, max_length=128)
    confidence: float = Field(ge=0, le=1)
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    width: float = Field(ge=0, le=1)
    height: float = Field(ge=0, le=1)

    @model_validator(mode="after")
    def box_fits_image(self) -> "Detection":
        if self.x + self.width > 1.000001 or self.y + self.height > 1.000001:
            raise ValueError("Bounding box extends outside the source image")
        return self


class DetectionResponse(StrictMessage):
    type: Literal["detections"] = "detections"
    frame_id: int = Field(ge=1, le=2**32 - 1)
    captured_at: float = Field(ge=0)
    revision: int = Field(ge=1)
    processing_ms: float = Field(ge=0)
    inference_ms: float = Field(ge=0)
    image_width: int = Field(gt=0)
    image_height: int = Field(gt=0)
    objects: list[Detection]

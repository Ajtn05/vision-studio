"""Selectable local detectors, one worker, and no pending inference queue."""

import asyncio
import logging
import time
from concurrent.futures import Future, ThreadPoolExecutor

import cv2

from .config import ServerConfig
from .detector import Detector, YoloDetector
from .frame_processor import Frame, decode_frame
from .hand_detector import HandDetector
from .schemas import RESOLUTIONS, DetectionResponse, SessionConfig

logger = logging.getLogger(__name__)


class WorkerBusy(RuntimeError):
    pass


class InferenceWorker:
    def __init__(self, config: ServerConfig, detector: Detector | None = None) -> None:
        self.config = config
        self.detector = detector
        self.error: str | None = None
        self.hand_detector: Detector | None = None
        self.hand_error = "Install requirements-hands.txt and run python scripts/prepare_hand_model.py."
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="vision-inference")
        self._pending: Future[DetectionResponse] | None = None

    async def start(self) -> None:
        cv2.setNumThreads(1)
        if self.detector is None:
            try:
                self.detector = await asyncio.get_running_loop().run_in_executor(
                    self._executor, YoloDetector, self.config
                )
            except Exception as error:
                self.error = str(error)
                logger.exception("Model initialization failed; health and info endpoints remain available")
        if self.config.hand_model_path.is_file():
            try:
                self.hand_detector = await asyncio.get_running_loop().run_in_executor(
                    self._executor, self._load_hands
                )
            except Exception as error:
                self.hand_error = str(error)
                logger.exception("Hand model unavailable; other detectors remain available")

    def _load_hands(self) -> HandDetector:
        detector = HandDetector(self.config.hand_model_path)
        try:
            # Initialize the graph before advertising this model as ready.
            import numpy as np

            detector.detect(np.zeros((180, 320, 3), dtype=np.uint8), 0.4, 320)
        except Exception:
            detector.close()
            raise
        return detector

    @property
    def ready(self) -> bool:
        return self.detector is not None or self.hand_detector is not None

    @property
    def default_model(self) -> str:
        return "objects" if self.detector is not None else "hands"

    def resolve_model(self, model: str | None) -> str:
        if model is None:
            model = self.default_model
        # Keep accepting the original model filename for older clients.
        if self.detector is not None and model == self.detector.model_name:
            model = "objects"
        if model not in {"objects", "hands", "measurement"}:
            raise ValueError("Unknown model. Choose objects, hands, or measurement.")
        if (self.hand_detector if model == "hands" else self.detector) is None:
            raise ValueError(self.hand_error if model == "hands" else "Object model is unavailable.")
        return model

    def active_model_info(self, model: str | None = None) -> dict:
        selected = model or self.default_model
        detector = self.hand_detector if selected == "hands" else self.detector
        return {
            "active_model": selected,
            "model_name": detector.model_name if detector else self.config.model_path.name,
            "provider": detector.provider if detector else self.config.provider,
            "class_count": getattr(detector, "class_count", None),
        }

    def model_catalog(self) -> list[dict]:
        return [
            {
                "id": model,
                "name": name,
                "available": detector is not None,
                "reason": None if detector is not None else reason,
            }
            for model, name, detector, reason in (
                ("objects", "Object detection", self.detector, "Prepare the object model on the backend."),
                ("hands", "Hands & fingers", self.hand_detector, self.hand_error),
                (
                    "measurement",
                    "Object measurement",
                    self.detector,
                    "Prepare the object model on the backend.",
                ),
            )
        ]

    @property
    def busy(self) -> bool:
        return self._pending is not None and not self._pending.done()

    def _process(self, frame: Frame, session: SessionConfig) -> DetectionResponse:
        started = time.perf_counter()
        image = decode_frame(frame, self.config, RESOLUTIONS[session.resolution])
        model = self.resolve_model(session.model)
        detector = self.hand_detector if model == "hands" else self.detector
        inference_started = time.perf_counter()
        image_size = session.inference_size or RESOLUTIONS[session.resolution][0]
        objects = detector.detect(image, session.confidence, image_size)
        inference_ms = (time.perf_counter() - inference_started) * 1000
        return DetectionResponse(
            frame_id=frame.frame_id,
            captured_at=frame.captured_at,
            revision=session.revision,
            processing_ms=(time.perf_counter() - started) * 1000,
            inference_ms=inference_ms,
            image_width=image.shape[1],
            image_height=image.shape[0],
            objects=objects,
            model=model,
        )

    async def process(self, frame: Frame, session: SessionConfig) -> DetectionResponse:
        if self.busy:
            raise WorkerBusy("The previous inference is still finishing")
        self._pending = self._executor.submit(self._process, frame, session)
        # A thread cannot be killed safely. Keep its future after a timeout so a
        # reconnect cannot enqueue more work behind an inference that is stuck.
        wrapped = asyncio.wrap_future(self._pending)
        wrapped.add_done_callback(self._observe_completion)
        return await asyncio.wait_for(asyncio.shield(wrapped), self.config.inference_timeout_seconds)

    @staticmethod
    def _observe_completion(future: asyncio.Future[DetectionResponse]) -> None:
        if not future.cancelled():
            future.exception()

    async def stop(self) -> None:
        try:
            if self.hand_detector is not None:
                close = getattr(self.hand_detector, "close", None)
                if close:
                    await asyncio.get_running_loop().run_in_executor(self._executor, close)
        finally:
            await asyncio.to_thread(self._executor.shutdown, wait=True, cancel_futures=True)

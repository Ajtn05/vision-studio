"""One model, one worker, and no pending inference queue."""

import asyncio
import logging
import time
from concurrent.futures import Future, ThreadPoolExecutor

import cv2

from .config import ServerConfig
from .detector import Detector, YoloDetector
from .frame_processor import Frame, decode_frame
from .schemas import RESOLUTIONS, DetectionResponse, SessionConfig

logger = logging.getLogger(__name__)


class WorkerBusy(RuntimeError):
    pass


class InferenceWorker:
    def __init__(self, config: ServerConfig, detector: Detector | None = None) -> None:
        self.config = config
        self.detector = detector
        self.error: str | None = None
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

    @property
    def busy(self) -> bool:
        return self._pending is not None and not self._pending.done()

    def _process(self, frame: Frame, session: SessionConfig) -> DetectionResponse:
        started = time.perf_counter()
        image = decode_frame(frame, self.config, RESOLUTIONS[session.resolution])
        if self.detector is None:
            raise RuntimeError("Model is not ready")
        inference_started = time.perf_counter()
        image_size = session.inference_size or RESOLUTIONS[session.resolution][0]
        objects = self.detector.detect(image, session.confidence, image_size)
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
        await asyncio.to_thread(self._executor.shutdown, wait=True, cancel_futures=True)

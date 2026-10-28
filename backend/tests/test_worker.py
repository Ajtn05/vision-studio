import asyncio
from dataclasses import replace

import pytest
from conftest import make_frame

from app.config import ServerConfig
from app.frame_processor import parse_frame
from app.inference_worker import InferenceWorker, WorkerBusy
from app.schemas import SessionConfig


def test_timeout_does_not_allow_a_second_queued_inference(fake_detector):
    async def scenario():
        worker = InferenceWorker(replace(ServerConfig(), inference_timeout_seconds=0.02), fake_detector)
        fake_detector.release.clear()
        try:
            with pytest.raises(TimeoutError):
                await worker.process(parse_frame(make_frame(), 1048576), SessionConfig())
            assert worker.busy
            with pytest.raises(WorkerBusy):
                await worker.process(parse_frame(make_frame(2), 1048576), SessionConfig())
            assert fake_detector.calls == 1
        finally:
            fake_detector.release.set()
            await worker.stop()
        assert not worker.busy

    asyncio.run(scenario())

"""ASGI entry point: run one Uvicorn worker for the shared local models."""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from .config import ServerConfig
from .detector import Detector
from .inference_worker import InferenceWorker
from .schemas import INFERENCE_SIZES, RESOLUTIONS
from .websocket_handler import handle_detection_socket


def create_app(config: ServerConfig | None = None, detector: Detector | None = None) -> FastAPI:
    settings = config or ServerConfig.from_environment()
    worker = InferenceWorker(settings, detector)
    client_lease = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await worker.start()
        try:
            yield
        finally:
            await worker.stop()

    application = FastAPI(title="Vision Studio", version="0.1.0", lifespan=lifespan)
    application.state.worker = worker
    application.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET"],
        allow_headers=["Content-Type"],
        allow_credentials=False,
    )

    def server_info() -> dict:
        return {
            "name": "Vision Studio",
            "protocol_version": 1,
            "model_ready": worker.ready,
            **worker.active_model_info(),
            "models": worker.model_catalog(),
            "supported_options": {
                "confidence": {"min": 0.05, "max": 0.95, "default": 0.4},
                "resolutions": list(RESOLUTIONS),
                "inference_sizes": list(INFERENCE_SIZES),
                "max_fps": settings.max_fps,
                "model_selection": True,
            },
            "capabilities": {
                "max_clients": 1,
                "max_in_flight": 1,
                "max_message_bytes": settings.max_message_bytes,
                "coordinates": "normalized_unmirrored",
                "encoding": "jpeg",
                "envelope": "VS01",
            },
        }

    @application.get("/health")
    async def health() -> dict:
        return {"status": "ok", "model_ready": worker.ready, "worker_busy": worker.busy}

    @application.get("/api/info")
    async def info() -> dict:
        return server_info()

    @application.websocket("/ws/detect")
    async def detect(socket: WebSocket) -> None:
        await handle_detection_socket(socket, worker, client_lease, server_info())

    return application


app = create_app()

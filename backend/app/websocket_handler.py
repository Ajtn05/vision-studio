"""Receive controls while one frame runs; drop excess frames immediately."""

import asyncio
import json
import logging
import time

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .frame_processor import FrameError, parse_frame
from .inference_worker import InferenceWorker, WorkerBusy
from .schemas import Ping, SessionConfig

logger = logging.getLogger(__name__)


async def handle_detection_socket(
    socket: WebSocket, worker: InferenceWorker, lease: asyncio.Lock, info: dict
) -> None:
    origin = socket.headers.get("origin")
    if origin not in worker.config.allowed_origins and not (
        origin is None and worker.config.allow_missing_origin
    ):
        logger.warning("Rejected WebSocket origin: %r", origin)
        await socket.close(code=1008)
        return
    await socket.accept()
    if lease.locked() or worker.busy or not worker.ready:
        await socket.send_json(
            {
                "type": "error",
                "code": "unavailable",
                "message": "Server is busy or the model is unavailable.",
                "fatal": True,
            }
        )
        await socket.close(code=1013)
        return

    async with lease:
        session: SessionConfig | None = None
        frame_task: asyncio.Task[None] | None = None
        send_lock = asyncio.Lock()
        last_frame_id = 0
        last_accepted = float("-inf")

        async def send(message: dict) -> None:
            async with send_lock:
                await asyncio.wait_for(socket.send_json(message), timeout=5)

        async def process_frame(data: bytes, current: SessionConfig) -> None:
            frame = parse_frame(data, worker.config.max_message_bytes)
            try:
                result = await worker.process(frame, current)
                await send(result.model_dump(exclude_none=True))
            except FrameError as error:
                await send(
                    {
                        "type": "error",
                        "code": "invalid_frame",
                        "message": str(error),
                        "frame_id": frame.frame_id,
                        "fatal": False,
                    }
                )
            except WorkerBusy:
                await send({"type": "dropped", "frame_id": frame.frame_id, "reason": "busy"})
            except TimeoutError:
                logger.error("Inference timed out on frame %d", frame.frame_id)
                await send(
                    {
                        "type": "error",
                        "code": "inference_timeout",
                        "message": "Inference timed out. Lower the resolution or inspect server logs.",
                        "fatal": True,
                    }
                )
                await socket.close(code=1011)
            except Exception:
                logger.exception("Inference failed on frame %d", frame.frame_id)
                await send(
                    {
                        "type": "error",
                        "code": "inference_failed",
                        "message": "Inference failed; inspect the server logs.",
                        "fatal": True,
                    }
                )
                await socket.close(code=1011)

        try:
            while True:
                # Observe completed tasks so send/disconnect failures are never hidden.
                if frame_task is not None and frame_task.done():
                    await frame_task
                    frame_task = None
                message = await asyncio.wait_for(
                    socket.receive(), timeout=10 if session is None else worker.config.idle_timeout_seconds
                )
                if message["type"] == "websocket.disconnect":
                    break
                text = message.get("text")
                data = message.get("bytes")
                if text is not None:
                    if len(text.encode()) > 4096:
                        raise FrameError("Control message exceeds 4096 bytes")
                    try:
                        control = json.loads(text)
                        if not isinstance(control, dict):
                            raise ValueError("Control must be a JSON object")
                        if control.get("type") == "ping":
                            ping = Ping.model_validate(control)
                            await send({"type": "pong", "nonce": ping.nonce})
                        elif control.get("type") == "configure":
                            candidate = SessionConfig.model_validate(control)
                            if session is not None and candidate.revision <= session.revision:
                                raise ValueError("Configuration revision must increase")
                            candidate.model = worker.resolve_model(candidate.model)
                            session = candidate
                            await send(
                                {
                                    "type": "ready",
                                    "config": session.model_dump(),
                                    "info": {**info, **worker.active_model_info(session.model)},
                                }
                            )
                        else:
                            raise ValueError("Expected configure or ping")
                    except (ValueError, ValidationError) as error:
                        await send(
                            {
                                "type": "error",
                                "code": "invalid_control",
                                "message": str(error)[:500],
                                "fatal": True,
                            }
                        )
                        await socket.close(code=1008)
                        break
                elif data is not None:
                    if session is None:
                        raise FrameError("Send a configure message before sending frames")
                    frame = parse_frame(data, worker.config.max_message_bytes)
                    if frame.frame_id <= last_frame_id:
                        raise FrameError("Frame IDs must increase within a connection")
                    last_frame_id = frame.frame_id
                    now = time.monotonic()
                    if (frame_task is not None and not frame_task.done()) or worker.busy:
                        await send({"type": "dropped", "frame_id": frame.frame_id, "reason": "busy"})
                    elif now - last_accepted < 1 / worker.config.max_fps:
                        await send({"type": "dropped", "frame_id": frame.frame_id, "reason": "rate_limit"})
                    else:
                        if frame_task is not None:
                            await frame_task
                        last_accepted = now
                        frame_task = asyncio.create_task(process_frame(data, session))
        except FrameError as error:
            await send({"type": "error", "code": "invalid_frame", "message": str(error), "fatal": True})
            await socket.close(code=1008)
        except TimeoutError:
            logger.info("WebSocket idle or send timeout")
            await socket.close(code=1001)
        except WebSocketDisconnect:
            logger.info("Detection client disconnected")
        except RuntimeError as error:
            logger.warning("WebSocket session ended: %s", error, exc_info=True)
        finally:
            if frame_task is not None:
                frame_task.cancel()
                try:
                    await frame_task
                except asyncio.CancelledError:
                    pass
                except Exception:
                    logger.exception("Frame task ended during disconnect")

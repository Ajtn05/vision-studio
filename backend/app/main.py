"""API entry point for the backend running on the Linux server."""

import platform
import socket

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Vision Studio API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5180",
        "http://127.0.0.1:5180",
        "http://localhost:1420",
        "http://127.0.0.1:1420",
    ],
    allow_methods=["GET"],
    allow_headers=["Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str]:
    """Report the backend's identity so clients can verify the remote connection."""
    return {
        "status": "ok",
        "service": "vision-studio-backend",
        "hostname": socket.gethostname(),
        "system": platform.system(),
    }

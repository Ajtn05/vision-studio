"""Use `python -m app` so transport and application size limits agree."""

import logging

import uvicorn
from dotenv import load_dotenv

from .config import ServerConfig


def main() -> None:
    load_dotenv(override=False)
    config = ServerConfig.from_environment()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        workers=1,
        ws="websockets-sansio",
        ws_max_size=config.max_message_bytes,
        ws_per_message_deflate=False,
        timeout_graceful_shutdown=20,
    )


if __name__ == "__main__":
    main()

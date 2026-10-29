"""Download Google's hand model once; service startup never downloads weights."""

import argparse
import os
import tempfile
import urllib.request
from pathlib import Path

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/"
    "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=Path("models/hand_landmarker.task"))
    args = parser.parse_args()
    if args.output.is_file():
        print(f"Already prepared: {args.output.resolve()}")
        return
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with urllib.request.urlopen(MODEL_URL, timeout=60) as response:
            with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as download:
                temporary = download.name
                while chunk := response.read(1024 * 1024):
                    download.write(chunk)
        if Path(temporary).stat().st_size < 1_000_000:
            raise ValueError("Incomplete hand model download")
        os.replace(temporary, args.output)
    finally:
        if temporary and Path(temporary).exists():
            Path(temporary).unlink()
    print(f"Prepared {args.output.resolve()}. Restart the backend to enable Hands & fingers.")


if __name__ == "__main__":
    main()

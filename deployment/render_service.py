"""Render an example for the current ordinary Linux user. Does not install it."""

import os
import pwd
from pathlib import Path


def systemd_quote(path: Path) -> str:
    # Resolving the venv's python symlink would accidentally select system Python.
    text = str(path.absolute())
    if any(character in text for character in "\n\r\x00"):
        raise ValueError("Service paths cannot contain control characters")
    # systemd expands % specifiers even inside quotes.
    return '"' + text.replace("%", "%%").replace("\\", "\\\\").replace('"', '\\"') + '"'


def main() -> None:
    if os.getuid() == 0:
        raise SystemExit("Run this as the ordinary user who owns the project, without sudo.")
    backend = Path(__file__).resolve().parents[1] / "backend"
    executable = backend / ".venv/bin/python"
    if not executable.exists():
        raise SystemExit("Create backend/.venv and install dependencies first.")
    template = Path(__file__).with_name("vision-studio.service.example").read_text()
    print(
        template.replace("@USER@", pwd.getpwuid(os.getuid()).pw_name)
        .replace("@BACKEND_DIRECTORY@", systemd_quote(backend))
        .replace("@PYTHON_EXECUTABLE@", systemd_quote(executable)),
        end="",
    )


if __name__ == "__main__":
    main()

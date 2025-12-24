from __future__ import annotations

from pathlib import Path
from typing import Iterable, List


def read_file(path: str) -> str:
    return Path(path).read_text()


def list_files(root: str, pattern: str) -> List[str]:
    return [str(path) for path in Path(root).rglob(pattern)]


def write_file(path: str, content: str) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)


def ensure_dir(path: str) -> str:
    target = Path(path)
    target.mkdir(parents=True, exist_ok=True)
    return str(target)


def file_exists(path: str) -> bool:
    return Path(path).exists()

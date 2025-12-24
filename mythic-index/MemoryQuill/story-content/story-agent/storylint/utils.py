from __future__ import annotations

import re
from typing import Iterable


def strip_markdown(text: str) -> str:
    text = re.sub(r"`{1,3}.*?`{1,3}", "", text, flags=re.DOTALL)
    text = re.sub(r"\[(.*?)\]\((.*?)\)", r"\1", text)
    text = re.sub(r"[#>*_~-]+", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def truncate_text(text: str, max_chars: int) -> str:
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[: max_chars - 3] + "..."


def join_lines(lines: Iterable[str]) -> str:
    return "\n".join(lines)

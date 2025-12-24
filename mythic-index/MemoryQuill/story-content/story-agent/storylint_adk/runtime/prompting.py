from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

from jinja2 import Environment, FileSystemLoader

BASE_DIR = Path(__file__).resolve().parents[1]
PROMPT_DIR = BASE_DIR / "prompts"


def render_prompt(template_name: str, context: Dict[str, Any]) -> str:
    env = Environment(loader=FileSystemLoader(str(PROMPT_DIR)), autoescape=False)
    env.filters["tojson"] = lambda value: json.dumps(value, ensure_ascii=True, indent=2)
    template = env.get_template(template_name)
    return template.render(**context)

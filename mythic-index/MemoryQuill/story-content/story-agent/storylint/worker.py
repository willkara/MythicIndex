from __future__ import annotations

import os

try:
    from celery import Celery
except ImportError as exc:  # pragma: no cover - optional dependency
    raise RuntimeError("Celery is not installed. Install with: pip install -e .[queue]") from exc

BROKER_URL = os.getenv("STORYLINT_BROKER_URL", "redis://localhost:6379/0")
BACKEND_URL = os.getenv("STORYLINT_BACKEND_URL", BROKER_URL)

celery_app = Celery("storylint", broker=BROKER_URL, backend=BACKEND_URL)


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_kwargs={"max_retries": 3})
def ping(self) -> str:
    return "pong"

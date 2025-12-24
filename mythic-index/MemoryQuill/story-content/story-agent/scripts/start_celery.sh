#!/usr/bin/env bash
set -euo pipefail

celery -A storylint.worker.celery_app worker --loglevel=INFO

# Legacy Ingestion Pipeline (SQLite source)

This documents the legacy ingestion tooling under `ingestion/` and how it relates to the current Cloudflare migration.

## What’s in `ingestion/`
- `memoryquill.db` (also copied to `mythic-index/memoryquill.db`): SQLite snapshot used as the data source for the Cloudflare D1 import.
- CLI + scripts: `bin/ingest.sh|.bat|.ps1`, `ingest.py`, `validate.py`, `verify.py`.
- Docs: `docs/quickstart.md`, `docs/reference.md`, `docs/architecture.md`.
- Examples: `examples/basic_ingestion.sh`, `examples/selective_ingestion.sh`.

## Original workflow (legacy)
- Markdown content in `MemoryQuill/story-content/**` → ingestion scripts parse/validate → write into SQLite (`ingestion/memoryquill.db`).
- Optional Cloudflare sync in the legacy pipeline (now superseded by the Worker+D1+Images flow).

## How we use it now (Cloudflare migration)
- Treat `ingestion/memoryquill.db` as the **source of truth snapshot**.
- Export to D1 using `mythic-index/backend-worker/tools/export_sqlite_to_d1.py` (idempotent inserts).
- Rebuild imagery associations from `mythic-index/MemoryQuill/story-content/**/imagery.yaml` using `rebuild_image_links_from_imagery.py`.
- Upload images to Cloudflare Images with `upload_cloudflare_images.mjs` (only assets referenced by imagery.yaml).

## When to use the legacy ingestion scripts
- If you need to regenerate `memoryquill.db` from fresh markdown content and validation:
  - Run `ingestion/bin/ingest.sh reingest-data --no-imagery --force` (or the platform-specific variant).
  - Re-run the Cloudflare export/import pipeline afterward.
- Otherwise, keep the current SQLite snapshot and continue using the Cloudflare-focused tooling in `mythic-index/backend-worker/tools/`.

## Cloudflare-focused pipeline (active)
1) Export SQLite → D1 SQL: `mythic-index/backend-worker/tools/export_sqlite_to_d1.py`
2) Rebuild `image_link` from `imagery.yaml`: `mythic-index/backend-worker/tools/rebuild_image_links_from_imagery.py`
3) Upload images to Cloudflare Images: `mythic-index/backend-worker/tools/upload_cloudflare_images.mjs`
4) Deploy via `scripts/deploy-prod.sh` (uses `mythic-index/` paths)

# Legacy `image-stuff` module (analysis)

This folder was a full-featured, Python-based image pipeline for multi-provider generation, analysis, and quality assurance. It is **not part of the current Cloudflare stack**, but its ideas can be reused.

## What it does
- Multi-provider image generation (OpenAI Images; Imagen 4; formerly Gemini).
- Prompt enhancement, art-style enforcement, and provider failover.
- Quality gates, rate limiting, performance monitoring, and error recovery.
- Image analysis (OpenAI vision) with cataloging/metadata updates.
- Config-driven behavior (YAML for style, retries, rate limits, templates, variants).

## Key modules
- **Generators** (`generators/openai_generator.py`, `generators/imagen_generator.py`, base classes): SDK wrappers for image creation; handles reference images, prompt assembly, saving.
- **Analyzers** (`analyzers/openai_analyzer.py`): Uses vision models to describe/catalog images.
- **Prompt processors** (`prompt_processors/llm_enhancer.py`, `consistency_validator.py`, `quality_assessor.py`, `template_manager.py`): LLM-based prompt upgrades and validation hooks.
- **Quality & reliability**:
  - `quality_system` docs; `quality_*` tests; `provider_failover.py`; `rate_limiter.py`; `performance_monitor.py`; `error_recovery.py`; `error_reporting.py`; `file_integrity.py`.
  - `config_manager.py` / `config_validator.py` load/validate YAML configs (art style, prompt templates, quality thresholds, retry/rate-limit/failover configs, Cloudflare variants).
- **Parsers** (`parsers/chapters.py`, `characters.py`, `locations.py`, `update_imagery.py`, `update_analysis.py`): Content-aware prompt and metadata extraction from story files.
- **Configs** (`config/*.yaml`): Art style, prompt templates, quality thresholds, retry and rate-limit settings, failover matrix, Cloudflare variants, prompt enhancement rules.
- **Tests** (`tests/*`): Retry, failover, quality gates, performance, file integrity.

## External services & assumptions
- OpenAI Images (gpt-image-1.5) for generation; OpenAI vision for analysis.
- Google Imagen 4 via `google-cloud-aiplatform` (fast/standard/ultra variants).
- (Removed) Gemini image/LLM clients are summarized in `gemini_stubs.md`.
- Cloudflare variants config exists but storage/delivery is not wired to the current Worker; this was designed for local file outputs and metadata.

## Typical generation flow (conceptual)
```python
# Load configs
cfg = load_all_configs()  # art style, templates, retries, rate limits, failover matrix

# Build request
req = ImageRequest(prompt=base_prompt, refs=reference_images, style=cfg.art_style)

# Rate-limit gate
rate_limiter.check(req)

# Provider selection / failover
provider = provider_failover.pick(req, cfg)
client = create_client(provider, cfg.api_keys)

# Prompt enhancement
final_prompt = prompt_processors.enhance(req.prompt, templates=cfg.prompt_templates, style=cfg.art_style)

# Generate
result = client.generate(final_prompt, refs=req.refs)

# Quality gates
quality_assessor.validate(result, thresholds=cfg.quality_thresholds)

# Persist & report
save_image_and_metadata(result)
performance_monitor.record(result, provider)
```

## Typical analysis flow (conceptual)
```python
for image in images_to_analyze:
    desc = openai_analyzer.describe(image.path, context=image.context)
    update_catalog(image, description=desc, provider="openai-vision")
```

## How to reuse for Cloudflare
- Keep the orchestration patterns: provider abstraction, prompt enhancement, rate-limit/retry/failover, and quality gates.
- Simplify providers to what you actually use (e.g., OpenAI + one backup).
- Replace local file writes with Cloudflare Images upload + D1 metadata updates (mirror what `backend-worker/tools/upload_cloudflare_images.mjs` does).
- Move persistent metrics/usage to D1/KV instead of in-memory.
- Use the existing Cloudflare variants config (or the Worker’s delivery base) for URL construction.

## Status
Legacy/experimental. Use this doc as a reference when rebuilding a Cloudflare-native image service; the current production path is `mythic-index/backend-worker` + Cloudflare Images.

# Legacy `content_parser` (analysis)

Hybrid parser for MemoryQuill story files that mixed direct YAML/frontmatter parsing with Gemini 2.5 Flash extraction for unstructured markdown. It is **removed from the active stack** but the flow can be reused when rebuilding ingestion on Cloudflare.

## What it does
- Direct parsing for structured chapters/locations (frontmatter + imagery.yaml support).
- LLM parsing (Gemini 2.5 Flash) for characters, worldbuilding/core docs; concurrency-gated.
- Cross-reference + lore consistency validation across parsed output.
- Audit logging of extraction runs; progress UI for ingestion scripts.

## Key modules
- **HybridParser** (`src/core/hybrid_parser.py`): Orchestrates chapter->direct, character/worldbuilding->LLM, locations->hybrid; merges results; runs cross-reference and consistency checks; writes audit logs.
- **DirectParser** (`src/core/direct_parser.py`): Parses `content.md` frontmatter, normalizes chapter metadata (chapter_number, key_characters, motifs, timeline anchors), reads `imagery.yaml` if present; parses plain markdown for locations.
- **Gemini client + prompts** (`src/llm/gemini_client.py`, `src/llm/prompts.py`): Typed prompt builders for characters/locations/worldbuilding/core docs with extraction metadata (confidence, warnings, completeness).
- **Config loader** (`src/utils/config_loader.py`): Pulls parser + provider config (reuses image-gen provider_config.yaml for Gemini keys), chooses when to use LLM vs direct.
- **Validation**: `CrossReferenceValidator` (ID/slug linkage checks) and `ConsistencyCheckingService` (timeline, character attributes, relationships, geography, magic-system rules).
- **Scripts** (`scripts/ingest_all.py`, `ingest_chapters.py`, `ingest_characters.py`, etc.) and tests (`run_test.py`, `test_random_sampling.py`) to batch ingest and sample-check.

## Typical hybrid flow (pseudocode)
```python
loader = ConfigLoader()
parser = HybridParser(story_path="/story-content", gemini_api_key=GEMINI_KEY, config_loader=loader)
progress = ProgressTracker()

results = ParsedContent()
results.chapters = parser.parse_chapters(progress)             # direct frontmatter + imagery.yaml
results.characters = await parser.parse_characters(progress)   # LLM over aggregated markdown
results.locations = await parser.parse_locations(progress)     # direct, LLM fallback TODO
results.worldbuilding = await parser.parse_worldbuilding(progress)  # LLM over core docs

results.validation_results = {
  "cross_reference": await parser._run_cross_reference_validation(results),
  "consistency": await parser._run_consistency_checking(results)
}
audit_logger.finalize_session()
```

## Consistency/lore checks (examples)
- Timeline: chapter chronology vs timeline anchors; event ordering.
- Characters: first appearance vs chapter list; attribute drift (hair/eyes/status/class); relationship reciprocity.
- World: magic-system/technology/culture/geography coherence across docs and locations.
- Narrative: POV consistency, tone/style drift, plot thread continuity.

## Reuse guidance for Cloudflare stack
- Keep the parsing split: direct for frontmatter/imagery.yaml; LLM for unstructured notes. Swap Gemini client for your preferred model (OpenAI, Gemini 2.0) and pass results to a Cloudflare Worker/D1 instead of SQLAlchemy.
- Replace audit/progress logging with Worker-friendly telemetry or KV logs; persist validation findings in D1 for review.
- Wire imagery references into the existing Cloudflare Images pipeline by reusing imagery.yaml as the source of truth and emitting `image_link` rows ready for D1.
- Run cross-reference/consistency checks as a post-processing step after import to catch broken slugs or missing assets before deploy.

# Image Generation Pipeline (legacy service concepts)

This summarizes the capabilities/design in `backend/app/services/image_gen/`. The current Cloudflare stack doesn’t run this service, but these ideas can be reused if/when we reintroduce a centralized image pipeline.

## Purpose
- Orchestrate multi-provider AI image generation (OpenAI GPT-Image, Gemini 2.5 Flash, Imagen 4 variants).
- Handle provider selection, budgets, retries, streaming, and normalization of results.
- Persist generation requests/results, usage, and entity associations.

## Key components
- **Pipeline (`image_gen/pipeline.py`)**
  - Provider selection: explicit request → preferred → auto-select heuristics → fallback.
  - Budget enforcement: per-request `max_cost_per_image` and daily budget with usage tracking.
  - Concurrency control: semaphore-based; batch generation support.
  - Retries/backoff; streaming or simulated streaming.
  - Prompt enhancement from narrative context; default quality/size handling.
  - Cost estimation and provider health checks.

- **Clients (`image_gen/providers/`)**
  - `OpenAIImageClient` (GPT Image 1 via Responses API) – supports generation and edit.
  - `GeminiImageClient` (2.5 Flash) – default/fallback provider in auto mode.
  - `Imagen4Client` (fast/standard/ultra) – lazy import; requires `google-cloud-aiplatform`.
  - `ImageClientFactory` – caches clients, performs health checks, auto-selects by needs (transparency, edit, cost/quality, etc.).

- **Data models (`image_gen/models/`)**
  - `ImageRequest`, `ImageResult`, `StreamingEvent`, `CostEstimate`, `GenerationConfig`, `Provider` enums.

- **Persistence (`image_gen/database.py`)**
  - Save generated images/results, link to entities, track request lifecycle, approval status.
  - Usage tracking (cost/tokens/timing) and basic configuration storage (sync/async sessions).

## Notable behaviors
- Streaming: emits progress/completed/error events; simulated streaming if provider lacks native streaming.
- Fallbacks: automatic provider fallback on errors; budget checks before execution; daily usage resets at UTC midnight (memory-only; would need persistence).
- Prompt enrichment: optional narrative-context prefixing for portraits/locations/scenes.

## Reuse guidance (Cloudflare-oriented)
- The concepts map well to a Worker-based image orchestrator (with D1/R2/Images):
  - Keep the pipeline abstractions (requests/results, budget/concurrency, provider selection).
  - Swap persistence to D1 and use Cloudflare Images for storage/delivery.
  - Limit providers to those you want to support (e.g., OpenAI + Gemini) and trim Imagen if not needed.
  - Add durable usage tracking (D1 table or KV) instead of in-memory counters.

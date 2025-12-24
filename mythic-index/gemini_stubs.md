# Legacy Gemini stubs (removed)

These were earlier Gemini integrations (image + LLM parsing). They’re not used by the current Cloudflare stack but are summarized here for reference.

## Image generation client (backend/app/services/image_gen/providers/gemini_client.py)
- Gemini 2.5 Flash Image Preview client using `google.generativeai`.
- Supports generation + edit; streaming via simulated async; safety settings; cost_per_image default `~$0.003`.
- Prompt enhancement and base64/file handling; fallback to safety error codes.
- Relied on pipeline abstractions (`ImageRequest`, `ImageResult`, etc.).

## Image-stuff utilities (image-stuff/generators/gemini_generator.py, image-stuff/analyzers/gemini_analyzer.py)
- Generator: example use of `google.genai` to generate images, handling reference images, base64 decoding, and PIL saving.
- Analyzer: similar SDK wiring for image analysis (using `google.genai`).

## Parsing client (content_parser/src/llm/gemini_client.py + test_gemini_connection.py)
- Gemini LLM client for structured content extraction with retry/backoff, safety settings disabled for creativity, and audit logging hooks.
- JSON parsing helpers; integration with `PromptBuilder` and `LLMConfig`.

## Config stub (backend/app/config/providers/gemini.yaml)
- Provider configuration template for the image pipeline.

### If reintroducing Gemini
- Prefer a minimal client inside `mythic-index/backend-worker/` (or Worker-side fetch).
- Keep safety, retries, and base64/image handling patterns; persist costs/usage in D1 or KV instead of memory-only.

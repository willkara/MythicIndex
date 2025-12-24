Got it — let’s lock in a **clean, repeatable batch-processing design** that takes your *imagery YAMLs* and turns “planned images” into “generated images,” without turning this into a fragile science project.

Below is a requirements + design doc you can treat as the blueprint for your `chargen batch` work.

---

## What “batch processing” should do

### Inputs (your current reality)

You already have **image specifications** living in YAML:

* **Chapter imagery** has:

    * chapter-level thesis + palette + default provider settings
    * a list of `images[*]` where each one already has `prompt_used`, `negative_prompt`, `size`, `depicts_characters`, `character_states`, and placeholder output fields (`generated_at`, `file_path`, `provider`, `model`, etc.)

* **Location imagery** has:

    * location-level “visual anchor” and defaults (provider/model/quality)
    * an `overview` + `parts[*]`, each with `prompt_used`, `negative_prompt`, and `generated_images: []` to fill

* **Character imagery** can provide:

    * canonical appearance text
    * an `image_inventory[*]` of approved images you can use as references (by `id` + local `path`)

### Output

For every “pending” item, the batch runner should:

1. Build the final prompt payload (usually “prompt_used + negative_prompt + style glue”).
2. Optionally attach **reference character images** (from character inventory) when the provider supports it.
3. Generate image(s).
4. Save file(s) to the correct folder.
5. Update YAML *in-place* with:

    * file name/path
    * timestamps
    * provider/model
    * provider metadata (seed/id/revised prompt, etc.)
    * and/or append to `generated_images`

---

## The core requirements

### Functional requirements

1. **Idempotent scanning**

    * Only generate images that are “missing”:

        * chapter: `file_path == null` or file doesn’t exist
        * location: `generated_images` empty

2. **Batch planning**

    * Produce a deterministic list of tasks:

        * stable `task_id` = `custom_id` (chapter)
        * stable `task_id` = `location.slug + overview.slug` / `parts[*].slug`

3. **Prompt composition**

    * For MVP: use YAML’s `prompt_used` and `negative_prompt` directly (you already have great prompts)
    * Add a thin “style footer/header” only if you want global consistency (see below).

4. **Character consistency**

    * If an image depicts characters (chapter images do), optionally:

        * add `character_states[...]` into the prompt (it’s already structured)
        * attach reference images listed in chapter `characters[*].reference_images`  and resolve them through `character_imagery.yaml` inventory

5. **Provider abstraction**

    * Support OpenAI + Google behind the same interface, with per-file defaults:

        * chapter defaults: openai/dall-e-3/hd
        * location defaults: google/gemini-3-pro-image-preview/high

6. **Safe persistence**

    * Always write images first, then update YAML.
    * YAML updates should be atomic:

        * write `*.tmp`, fsync, rename.

7. **Resume**

    * A failed run shouldn’t corrupt YAML or require manual cleanup.
    * You should be able to re-run and only regenerate what’s still missing.

### Non-functional requirements

* **Maintainable**: simple queue + retry; minimal magic.
* **Predictable**: stable filenames; stable ordering; clear logs.
* **Auditable**: store prompt hash + provider metadata to explain “why this image exists.”

---

## The pipeline design

### High-level architecture

```
┌──────────────┐
│   CLI (batch)│
└──────┬───────┘
       │
       v
┌──────────────┐     ┌──────────────┐
│ YAML Scanner │ --> │ Task Planner  │  (builds a list of “generate this”)
└──────┬───────┘     └──────┬───────┘
       │                    │
       │                    v
       │            ┌──────────────┐
       │            │ Work Queue    │  (concurrency + rate limits)
       │            └──────┬───────┘
       │                   │
       │                   v
       │            ┌──────────────┐
       │            │ Provider API  │  (OpenAI / Google)
       │            └──────┬───────┘
       │                   │
       v                   v
┌──────────────┐    ┌──────────────┐
│ File Writer  │    │ Run Journal   │ (SQLite / JSONL: status, errors, hashes)
└──────┬───────┘    └──────┬───────┘
       │                   │
       └──────────┬────────┘
                  v
          ┌──────────────┐
          │ YAML Updater  │ (atomic update)
          └──────────────┘
```

### Task lifecycle (sequence)

```
[plan] -> [render prompt payload] -> [generate] -> [write file(s)] -> [update YAML] -> [mark success]
                         |
                         v
                   [retry/backoff]
                         |
                         v
                     [mark failed]
```

---

## How prompts should be handled (practical, not fancy)

### MVP (recommended)

Use existing YAML fields as the single source of truth:

* `prompt_used` is already rich and stylistically consistent
* `negative_prompt` is already safeguarding style drift

**Add only one optional global wrapper**:

* a short style prefix (or suffix) you can tweak in one place:

    * “classical oil painting, visible brushwork, matte finish”
    * (you already embed this in many prompts, so keep it minimal)

### Later (if you want)

Add a “prompt synthesizer” mode that can *rebuild* `prompt_used` from structured fields (chapter `visual_description`, `composition_notes`, lighting, palette, character states, etc.)

But don’t block batch generation on this. You’re already 80% there.

---

## Reference images and cross-file resolution

This is the one part that can get messy if you don’t define rules.

### Proposed rule set

When an image lists characters (example: chapter `depicts_characters`) :

1. Find the chapter’s character entry for that ref, and read its `reference_images` list
2. For each reference image id, locate it in the character’s `image_inventory` by `id` and take its `path`
3. Pass those images to the provider **only if** that provider supports “reference image guidance”.
4. If not supported:

    * inject a short “canonical appearance summary” text (from character YAML `appearance`) to reduce drift

### Keep it boring

* Limit to **1–2 reference images per character** (best signal, less noise).
* Define a preference order: `status: approved` first

---

## File naming and where outputs go

You want deterministic paths so “resume” is trivial.

### Chapters

Use `custom_id` as filename:

* `generated/chapters/<chapter-slug>/<custom_id>.png`
* store this into `file_name` / `file_path`

### Locations

Use slugs:

* `generated/locations/<location-slug>/<overview.slug>.png`
* `generated/locations/<location-slug>/<part.slug>.png`
* append object to `generated_images` with file info

---

## Concurrency, rate limits, and retries

### Safe defaults

* Start conservative:

    * OpenAI: 2 workers
    * Google: 1–2 workers
* Add a small “token bucket” per provider (simple timestamps, not a complicated scheduler).

### Retry policy (simple + effective)

* Retry on:

    * network errors
    * 429 / rate limit
    * 5xx
* Exponential backoff with jitter:

    * 1s, 2s, 4s, 8s, 16s (cap), max 5 tries

### Partial failure behavior

* If one task fails, continue the batch and report a summary at the end.
* Do not write “generated” fields unless the image file is safely written.

---

## YAML update strategy (to avoid corruption)

### Chapter update

For each image entry (by `custom_id`):

* set:

    * `generated_at` (ISO string)
    * `file_name`, `file_path`
    * `provider`, `model`
    * `provider_metadata` (request id, seed if any, etc.)

### Location update

For overview/parts:

* push an object into `generated_images`:

    * `{ generated_at, file_name, file_path, provider, model, provider_metadata }`

(Your location YAML already expects `generated_images: []` placeholders.)

---

## Minimal “batch” CLI modes worth implementing

### 1) `chargen batch chapters`

* Input: chapter-imagery YAML(s)
* Task criteria: `file_path == null` OR missing file
* Output: images + YAML updates

### 2) `chargen batch locations`

* Input: location-imagery YAML(s)
* Task criteria: `generated_images` empty
* Output: images + YAML updates

### 3) `chargen batch all`

* Runs both, stable order.

### Options

* `--dry-run` (print what would happen)
* `--only <slug>` / `--match <glob>`
* `--provider openai|google`
* `--max-tasks N`
* `--resume` (default behavior, really)

---

## What I’d build first (MVP plan)

1. **Scanner + Planner**

    * parse YAML
    * find pending items
    * print plan

2. **Provider abstraction**

    * `generateImage({prompt, negative, size, references?}) -> {bytes, metadata}`

3. **Runner**

    * queue + concurrency + retries
    * write file
    * update YAML atomically

4. **Run journal**

    * SQLite table: `tasks(task_id, status, started_at, finished_at, file_path, error, prompt_hash)`
    * purely for “resume/debug/cost sanity” (not required for correctness)

---

## One key “consistency” trick you already have (use it)

Your chapter file carries chapter-wide visual intent: `visual_thesis` and palette anchors . Your location file carries signature elements + characteristic light .

Batch generation should **automatically prepend** a tiny “always include” block from these fields so every image in that chapter/location feels like it belongs—without rewriting prompts.

Example idea (conceptually):

* Chapter: add 1–2 lines derived from `visual_thesis` + palette
* Location: add 1–2 signature elements + characteristic light

Keep it short. Don’t flood the prompt.

---

If you want, I can take your **three uploaded YAMLs** and draft the exact **Task Planner rules** (what counts as pending, how to name output files, and exactly how to patch each YAML object) as a crisp checklist you can implement straight into your TS codebase.

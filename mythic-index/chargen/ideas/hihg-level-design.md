Got it — let’s re-center on a **clean, repeatable batch pipeline** for generating (and optionally analyzing) lots of images from your `imagery.yaml` + markdown context, without turning the CLI into a science project.

Below is a requirements+design package you can implement incrementally, with **two execution paths**:

1. **Live runner** (parallel + rate-limited) for “do it now”
2. **Gemini Batch API** runner for “queue it up, cheaper, async” (Google targets completion within ~24h; discounted vs standard). ([Google AI for Developers][1])

---

## Core goals for batch processing

### Functional requirements

* **Discover work** from repo content:

    * scan characters/locations/chapters for `imagery.yaml`
    * for each `scene`/`shot`, decide if generation is needed (missing image, outdated prompt hash, `--force`, etc.)
* **Compile deterministic “Prompt IR”** (your existing idea): normalize + hash → idempotency.
* **Execute**:

    * generate images (optionally: analysis first, or analysis after, depending on your workflow)
* **Persist results**:

    * save images to the target folder
    * update `imagery.yaml` (`generated_images`, provider metadata, prompt hash, timestamps)
    * write a run log you can use to resume / audit

### Non-functional requirements

* **Idempotent & resumable**
* **Rate-limit safe** (429s become “slow down”, not “crash”)
* **Observable** (progress, per-job status, end summary)
* **Low cognitive overhead** (simple commands, predictable files)

---

## The big design choice: Live vs Batch API

### Option A — Live runner (recommended default for you & friends)

* You run N workers locally with a rate limiter.
* Immediate results, simplest operationally.

### Option B — Gemini Batch API (recommended for *large* runs)

* You **submit a JSONL job**, wait, then **collect results**.
* Docs highlight:

    * **50% cost** vs standard (per Batch API doc)
    * **~24 hours** target completion
    * inputs: inline (<= ~20MB) or file-based (up to ~2GB) ([Google AI for Developers][1])
* Batch has its own quota/rate limit model and “enqueued” capacity tiers.

**Practical guidance:** implement both behind one interface so you can flip with a flag:

* `--mode live` (default)
* `--mode batch` (submit + later collect)

---

## CLI UX that stays boring and maintainable

### Commands

* `chargen batch plan`
  Produces a plan file (no API calls).
* `chargen batch run --mode live`
  Executes immediately and writes outputs.
* `chargen batch submit --mode batch`
  Uploads JSONL + creates batch job.
* `chargen batch collect`
  Downloads results and applies them to files/YAML.

### Why “plan” is worth it

A plan file gives you:

* diff-able stability
* reproducibility
* easy “resume”
* safe dry-runs (“show me what you’re about to do”)

---

## Data model: Work items + Run state

### Work item (single unit of generation)

Keep it small and stable:

```text
WorkItem
- jobId            (stable; derived from target + scene + variant)
- targetKind       (character|location|chapter)
- targetSlug       (e.g. "blackvein-lode")
- imageryYamlPath
- outputDir
- promptIR         (normalized structure)
- promptHash       (sha256 of normalized IR)
- providerPlan     (model, size, aspect, safety, seed policy)
- references       (paths to images + markdown context)
```

### Run state (for resume + audit)

Use **SQLite** (you already ship `better-sqlite3`) as a tiny job DB:

**Tables**

* `runs(run_id, created_at, mode, repo_root, config_json)`
* `jobs(job_id, run_id, status, prompt_hash, attempts, last_error, updated_at)`
* `artifacts(job_id, type, path, sha256, provider_json)`

Statuses: `PLANNED → QUEUED → RUNNING → SUCCEEDED | FAILED | SKIPPED`

---

## Processing pipeline (end-to-end)

```
┌─────────────┐   ┌──────────────┐   ┌─────────────┐   ┌───────────────┐
│ Discover     │→  │ Compile IR    │→  │ Execute      │→  │ Persist        │
│ (imagery.yaml│   │ + Hash        │   │ (live/batch) │   │ (files + YAML) │
└─────────────┘   └──────────────┘   └─────────────┘   └───────────────┘
        │                 │                 │                   │
        │                 └─────> skip if promptHash already generated
        │
        └────> writes Plan (json) + seeds SQLite run
```

---

## Prompt IR: keep it strict and small

**Rule of thumb:** IR should contain only what the model needs to generate the shot, not every paragraph of lore.

Suggested IR sections:

* `subject`: who/what is in frame
* `setting`: where
* `mood`: your mood system + lighting + palette
* `composition`: shot type, camera, focal length feel, framing notes
* `continuity`: canonical traits + “don’ts”
* `references`: list of reference image ids (and which are “must match”)

Then:

* `promptHash = sha256(stable_json_stringify(ir))`

This is what enables:

* **incremental mode** (skip unchanged)
* **safe re-runs**
* **cache hits**

---

## Rate limits + concurrency (live mode)

Keep it dead simple:

* A **global token bucket** per provider/model family
* A **worker pool** that pulls from the `jobs` table
* Retry policy:

    * 429 / “resource exhausted” → backoff + jitter
    * 5xx → backoff + retry
    * 4xx (other) → fail fast, mark job failed

Google documents tiered rate limits and batch-specific constraints; treat them as inputs to config.

---

## Batch API runner (Gemini)

### How it fits your pipeline

* `plan.json` → convert to `requests.jsonl`
* upload file (Files API) if large
* create a batch job
* poll until done
* download results
* apply outputs like normal

Batch doc constraints to design around:

* inline request list size vs file-based batch file limits ([Google AI for Developers][1])

**If you use file upload:** plan for expiration/retention behavior (Google’s forum confirms short expiration windows are a known constraint, so don’t treat uploaded batch input as durable storage). ([Google AI Developers Forum][2])

---

## YAML update strategy: “apply” step is separate

Don’t update YAML mid-flight from multiple workers. Instead:

1. Each job writes its **result bundle** to a run directory:

    * `runs/<runId>/<jobId>/result.json`
    * `runs/<runId>/<jobId>/image_*.png`
2. `apply` does:

    * validates result bundle
    * writes final image(s) into the canonical folder
    * updates `imagery.yaml` in a single-threaded pass

This avoids:

* YAML merge conflicts
* partial writes on crash
* “half updated” states

---

## Files/folders: predictable run outputs

```
.chargen/
  runs/
    2025-12-19_14-22-31Z_run-001/
      plan.json
      jobs.sqlite
      results/
        <jobId>/
          result.json
          image.png
      logs.txt
```

Keep `plan.json` and `jobs.sqlite` together so you can resume with:

* `chargen batch collect --run <id>`
* `chargen batch apply --run <id>`

---

## MVP implementation plan (small steps)

1. **Plan generator**

    * scan + compile IR + hash
    * write `plan.json`
2. **SQLite run DB**

    * seed jobs from plan
    * basic status transitions
3. **Live runner**

    * N workers + rate limiter
    * write result bundles
4. **Apply step**

    * save images
    * update YAML
5. **Batch API path**

    * plan → JSONL
    * submit + collect + apply

---

## One more diagram: job lifecycle state machine

```
            ┌───────────┐
            │  PLANNED   │
            └─────┬─────┘
                  │ enqueue
                  v
            ┌───────────┐
            │  QUEUED    │
            └─────┬─────┘
                  │ claim
                  v
            ┌───────────┐
            │  RUNNING   │
            └──┬─────┬──┘
         ok   │     │  error (retryable)
              v     v
     ┌───────────┐  ┌───────────┐
     │ SUCCEEDED  │  │  QUEUED    │  (attempts++)
     └───────────┘  └───────────┘
              │
              │ apply
              v
     ┌──────────────┐
     │ APPLIED (opt) │
     └──────────────┘
```

---

If you want, paste (or describe) your current **`imagery.yaml` schema shape for chapters/locations** (just one representative example), and I’ll map this design directly onto your exact fields: how to decide “needs work”, where to store `promptHash`, and what a clean `generated_images[]` entry should look like.

[1]: https://ai.google.dev/gemini-api/docs/batch-api "Batch API  |  Gemini API  |  Google AI for Developers"
[2]: https://discuss.ai.google.dev/t/inquiry-regarding-files-api-storage-and-expiration-limits/109235?utm_source=chatgpt.com "Inquiry Regarding Files API Storage and Expiration Limits"

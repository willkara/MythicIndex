Below is what’s **actually published (as of Dec 18, 2025)** for the **Gemini API (Google GenAI SDK / `generativelanguage.googleapis.com`)**, with a focus on **Gemini 3 Flash / Pro / Pro Image** and **Tier 2**, plus a practical **batch workflow blueprint** you can drop into `chargen`.

---

## 1) Non-batch (interactive) rate limits: what exists + where to get your exact numbers

Google’s Gemini API rate limits are measured (typically) as: **RPM**, **TPM (input)**, and **RPD**, and they’re applied **per project (not per API key)**. **RPD resets at midnight Pacific time.** ([Google AI for Developers][1])

Google explicitly does **not** publish a single fixed table of RPM/TPM/RPD values in the docs—your exact limits vary by **model** and **tier**, and can change over time. The docs point you to: **“View your active rate limits in AI Studio.”** ([Google AI for Developers][1])

Also:

* Some dimensions apply only to certain models (e.g., **IPM** is called out as applying to **Imagen 3**). ([Google AI for Developers][1])
* **Preview/experimental models have more restricted limits.** ([Google AI for Developers][1])

**Action for you (Tier 2):** open AI Studio → your project → “active rate limits” and you’ll see the exact RPM/TPM/RPD per model. ([Google AI for Developers][1])

---

## 2) Tier 2: qualification (so you can sanity-check you’re really Tier 2)

Tier qualifications are tied to **billing account spend** (across Google Cloud services linked to the project). For **Tier 2**: **total spend > $250** and **≥ 30 days since successful payment**. ([Google AI for Developers][1])

---

## 3) Batch API: the part that matters for “100+ images”

### What Batch API is (and why you want it)

Batch API is intended for **large volumes asynchronously** at **50% of the standard cost**, with a target turnaround of **24 hours** (often faster). ([Google AI for Developers][2])

### Hard limits (batch)

From the rate limits doc:

* **Concurrent batch requests:** 100
* **Input file size limit:** 2GB
* **File storage limit:** 20GB ([Google AI for Developers][1])

From the Batch API doc:

* Two submission modes:

    * **Inline requests** (must keep total request size **< 20MB**) ([Google AI for Developers][2])
    * **JSONL input file** (recommended for large jobs; each line contains a key + a full `GenerateContentRequest`) ([Google AI for Developers][2])

### Batch “capacity” limit that actually gates you: *Batch enqueued tokens*

Batch jobs are limited by **“enqueued tokens per model”** (across all your active batch jobs for that model). ([Google AI for Developers][1])

#### Tier 2 batch enqueued tokens (Gemini 3)

| Model family           | Model (docs naming)            |                    Tier 2 batch enqueued tokens |
| ---------------------- | ------------------------------ | ----------------------------------------------: |
| Text-out               | **Gemini 3 Pro Preview**       | **500,000,000** ([Google AI for Developers][1]) |
| Text-out               | **Gemini 3 Flash Preview**     | **400,000,000** ([Google AI for Developers][1]) |
| Multi-modal generation | **Gemini 3 Pro Image Preview** | **270,000,000** ([Google AI for Developers][1]) |

That’s *a lot* of headroom for “100+ images” unless each request is enormous.

---

## 4) Estimating “how many images can I batch?” (quick math)

Your batch token usage is dominated by:

* prompt text tokens
* **image tokens** (depends on `media_resolution`)

For **Gemini 3 models**, approximate **image token counts** by resolution:

* Default/unspecified: **1120 tokens per image**
* LOW: **280**
* MEDIUM: **560**
* HIGH: **1120**
* ULTRA_HIGH: **2240** ([Google AI for Developers][3])

So if you do **100 images** at default-ish settings:

* **100 × 1120 ≈ 112,000 tokens** (plus your text)
  That’s tiny compared to Tier 2’s **270,000,000** enqueued tokens for **Gemini 3 Pro Image Preview**. ([Google AI for Developers][1])

**Practical takeaway:** you can batch hundreds/thousands of “single-image + short prompt” analysis requests comfortably in Tier 2, as long as you’re not accidentally attaching huge text blobs per request.

---

## 5) Passing local images: inline vs Files API (this matters for batch)

For image understanding, Google recommends:

* **Inline image data** only if the *total request* is **< 20MB** ([Google AI for Developers][4])
* Otherwise use the **Files API** (also recommended for **re-use** across requests). ([Google AI for Developers][4])

The Files API guide also repeats: **always use Files API when total request size > 20MB**. ([Google AI for Developers][5])

That’s perfect for batch: you upload images once, then reference them by URI in many JSONL lines.

---

## 6) Recommended model choices (for *your* two big workloads)

### A) Image understanding / “basic imagery analysis” (100+ images)

* Default: **Gemini 3 Flash Preview** for speed/cost, especially if you’re extracting structured metadata. (Batch it.)
* Escalate: **Gemini 3 Pro Preview** when you need deeper judgment or more nuanced interpretation.

### B) Image generation (“true creativity”)

Within “Gemini 3 models” specifically, you’re looking at **Gemini 3 Pro Image Preview** (it’s listed as a “multi-modal generation model” in batch limits). ([Google AI for Developers][1])
(Separate note: Google calls out that **Imagen 3** has its own IPM-style limiting; it’s a different lane. ([Google AI for Developers][1]))

---

## 7) A clean batch workflow you can add to `chargen`

### Architecture diagram (batch analysis or batch generation)

```mermaid
flowchart TD
  A[Scan local images] --> B[Upload images via Files API]
  B --> C[Build JSONL: key + GenerateContentRequest\n(file_data refs + prompt + config)]
  C --> D[Create batch job: ai.batches.create(...)]
  D --> E[Poll job status]
  E -->|Succeeded| F[Download output JSONL]
  F --> G[Parse per-key responses]
  G --> H[Write results:\n- imagery.yaml updates\n- per-image .json sidecars\n- logs]
```

### Step-by-step (what you implement)

#### Step 1 — Upload images (Files API)

Use the GenAI SDK. JS examples in docs show `GoogleGenAI` and file upload helpers. ([Google AI for Developers][5])

* Store a map: `{ localPath -> { uri, mimeType } }`
* Only upload once per run; cache results to disk so reruns don’t re-upload.

#### Step 2 — Build JSONL input file

Each line must be:

* a **user-defined key** (your image id / relative path / stable slug)
* a **request** object that is a valid `GenerateContentRequest` ([Google AI for Developers][2])

If you’re doing image analysis, each request uses `contents.parts` with:

* `file_data` pointing at your uploaded file URI
* a text prompt like “Return JSON matching this schema …”

Batch docs explicitly note: **for multimodal input you can reference other uploaded files within your JSONL**. ([Google AI for Developers][2])
Files docs show how URIs are referenced using `file_data`. ([Google AI for Developers][5])

#### Step 3 — Create the batch job

Batch API supports both inline and file-based; for large jobs you’ll use the **input file** method. ([Google AI for Developers][2])
The JS snippet shows `ai.batches.create({ model, src, config })`. ([Google AI for Developers][2])

#### Step 4 — Poll + download output JSONL

* Poll job state until it’s complete
* Download output file
* Parse each line; match on `key`; write results back into your `imagery.yaml` or sidecar files.

---

## 8) Non-batch “fast lane” (when you don’t want to wait for batch)

If you do need realtime runs:

* Build a **concurrency-limited queue** (e.g., 3–10 workers)
* Add **global throttling** (token + request based)
* Handle rate-limit errors with **exponential backoff + jitter**
* Keep requests short; avoid sending prior conversation history unless you mean to (TPM climbs fast)

This matters because **limits vary by model and preview models can be tighter**, and you’ll only know your exact RPM/TPM/RPD from AI Studio. ([Google AI for Developers][2])

* Control image token spend with `media_resolution`. For bulk “metadata extraction,” **LOW** is usually plenty (280 tokens/image vs 1120). ([Google AI for Developers][3])
* Keep per-request prompts small; huge schema + huge instructions × 1000 lines can become your real token sink.

---

### If you want, I can sketch the exact TS module layout for `chargen` batch mode

No fluff—just a maintainable set of files like:

* `src/services/google/files-cache.ts`
* `src/services/google/batch-jsonl.ts`
* `src/services/google/batch-runner.ts`
* `src/commands/batch-analyze.ts` / `batch-generate.ts`

…and it’ll plug into your existing “entity caching + imagery.yaml update” flow cleanly.

[1]: https://ai.google.dev/gemini-api/docs/rate-limits "Rate limits  |  Gemini API  |  Google AI for Developers"
[2]: https://ai.google.dev/gemini-api/docs/batch-api "Batch API  |  Gemini API  |  Google AI for Developers"
[3]: https://ai.google.dev/gemini-api/docs/media-resolution "Media resolution  |  Gemini API  |  Google AI for Developers"
[4]: https://ai.google.dev/gemini-api/docs/image-understanding "Image understanding  |  Gemini API  |  Google AI for Developers"
[5]: https://ai.google.dev/gemini-api/docs/files "Files API  |  Gemini API  |  Google AI for Developers"


``` markdown
# Chargen Batch Processing — Functional Design Specification

Version: 1.0
Date: 2025-12-19
Status: Draft

---

## 1. Executive Summary

This document defines the functional requirements for adding batch image processing 
capabilities to the `chargen` CLI. The batch system enables high-volume, asynchronous 
image analysis and generation using Google's Gemini Batch API, providing 50% cost 
savings and bypassing standard rate limits.

---

## 2. Goals & Non-Goals

### 2.1 Goals

1. **Batch Image Generation** — Generate 100+ character/location/chapter images in 
   a single asynchronous job
2. **Batch Image Analysis** — Analyze existing images to extract structured metadata 
   (archetype, traits, palette, mood, style)
3. **Idempotent & Resumable** — Crashed or interrupted runs can be safely resumed 
   without duplicating work
4. **Cost Efficient** — Leverage Batch API's 50% discount over synchronous calls
5. **Integrated** — Works within existing chargen menu system, reuses prompt compilers 
   and YAML writers

### 2.2 Non-Goals (V1)

- Real-time/synchronous batch alternative (live runner with N workers)
- Multi-provider batch support (OpenAI batch) — Google only for V1
- Automatic retry of failed items within the same run
- Web dashboard for batch monitoring

---

## 3. User Stories

### US-1: Batch Generate Character Images
> As a content creator, I want to generate images for all scenes in my characters' 
> `image_ideas.yaml` files at once, so I don't have to click through menus 60+ times.

**Acceptance Criteria:**
- Select "Batch Generate" from main menu
- Choose scope: all characters, specific character, or filtered set
- System shows plan (N tasks) and asks for confirmation
- Batch submits to Google, polls for completion, downloads results
- Images saved to correct `images/` folders
- `imagery.yaml` updated with generation metadata

### US-2: Batch Analyze Existing Images
> As a content creator, I want to analyze all existing character portraits to extract 
> structured metadata, so I can use that data to improve prompt consistency.

**Acceptance Criteria:**
- Select "Batch Analyze" from main menu
- Choose scope: all characters, specific character, or folder
- System uploads images, submits analysis batch
- Structured JSON analysis saved alongside each image
- (Optional) Analysis appended to `imagery.yaml`

### US-3: Resume Interrupted Batch
> As a user whose laptop went to sleep during a batch run, I want to resume where 
> I left off without re-uploading files or re-submitting completed work.

**Acceptance Criteria:**
- Run state persisted after each phase transition
- `chargen batch resume <runId>` picks up from last checkpoint
- Already-uploaded files are not re-uploaded (cache hit)
- Already-applied results are not re-applied

### US-4: Dry Run / Plan Preview
> As a cautious user, I want to see exactly what will be generated before committing 
> to a batch run.

**Acceptance Criteria:**
- `--dry-run` flag shows task list without executing
- Output shows: entity, scene, prompt summary, output path
- No API calls made in dry-run mode

---

## 4. Functional Requirements

### 4.1 Planning Phase

| ID | Requirement |
|----|-------------|
| FR-P1 | System SHALL scan entity cache to discover generation targets |
| FR-P2 | System SHALL read `imagery.yaml` to determine what's already generated |
| FR-P3 | System SHALL skip tasks where output already exists (idempotent) |
| FR-P4 | System SHALL generate deterministic task keys for result mapping |
| FR-P5 | System SHALL write `plan.json` to run directory before execution |

### 4.2 Staging Phase

| ID | Requirement |
|----|-------------|
| FR-S1 | System SHALL upload reference images to Google Files API |
| FR-S2 | System SHALL cache uploaded file URIs (path → {uri, sha256, mime}) |
| FR-S3 | System SHALL skip upload if file already in cache with matching SHA |
| FR-S4 | System SHALL build JSONL with `fileData` references (not inline Base64) |
| FR-S5 | System SHALL upload JSONL to Files API for batch submission |

### 4.3 Execution Phase

| ID | Requirement |
|----|-------------|
| FR-E1 | System SHALL create batch job via `ai.batches.create()` |
| FR-E2 | System SHALL poll job status with configurable interval (default 30s) |
| FR-E3 | System SHALL persist job ID to state file immediately after submission |
| FR-E4 | System SHALL download output JSONL when job reaches SUCCEEDED |
| FR-E5 | System SHALL handle JOB_STATE_FAILED gracefully with error report |

### 4.4 Results Phase

| ID | Requirement |
|----|-------------|
| FR-R1 | System SHALL parse output JSONL line-by-line (streaming) |
| FR-R2 | System SHALL decode Base64 images and write to target directories |
| FR-R3 | System SHALL update `imagery.yaml` with generation metadata |
| FR-R4 | System SHALL log failed items to report (Dead Letter Queue) |
| FR-R5 | System SHALL generate summary report (success/fail/skip counts) |

### 4.5 Resume & Recovery

| ID | Requirement |
|----|-------------|
| FR-X1 | System SHALL persist state after each phase transition |
| FR-X2 | System SHALL detect incomplete runs and offer resume |
| FR-X3 | System SHALL skip completed phases on resume |
| FR-X4 | System SHALL validate file cache integrity before reuse |

---

## 5. Data Requirements

### 5.1 Task Definition

Each task represents a single generation or analysis request:
```

Task { key: string // Deterministic, unique (e.g., "character/slug/scene@hash") kind: "analyze" | "generate" entityType: "character" | "location" | "chapter" entitySlug: string prompt: string referenceImages: { path, mime }[] outputDir: string outputFileName: string model: string config: { aspectRatio?, temperature?, responseMimeType? } }```

### 5.2 Task Key Format

Keys must be:
- **Stable** across reruns (same inputs → same key)
- **Unique** per intent (different prompts → different keys)
- **Human-readable** for debugging

Format: `{entityType}/{slug}/{scene}@{contentHash}`

Example: `character/cidrella-vexweld/workshop-tinkering@sha256:a1b2c3...`

Content hash includes: prompt text + reference image SHAs + model + config

### 5.3 Run Artifacts

Each batch run creates a directory:
```

.chargen/batch/{runId}/ ├── plan.json # Task[] + config snapshot ├── state.json # Current phase + job IDs + timestamps ├── files-cache.json # localPath → {uri, mime, sha256} ├── requests.jsonl # Submitted batch input ├── results.jsonl # Downloaded batch output ├── report.json # Summary: success/fail/skip counts + errors └── failed/ # Failed item details for debugging``` 

---

## 6. YAML Update Specification

### 6.1 Character `imagery.yaml`

After successful generation, append to `generated_images`:
```

yaml generated_images:
custom_id: "workshop-tinkering-20251219T120000Z" file_name: "workshop-tinkering-20251219T120000Z.png" file_path: "images/workshop-tinkering-20251219T120000Z.png" prompt_used: "..." provider: "google" model: "gemini-3-pro-image-preview" generated_at: "2025-12-19T12:00:00Z" batch_run_id: "2025-12-19T12-00-00Z" task_key: "character/cidrella/workshop@sha256:..."```

### 6.2 Location/Chapter `imagery.yaml`

Append to `imagery_runs`:
```

yaml imagery_runs:
run_id: "2025-12-19T12-00-00Z" generated_at: "2025-12-19T12:00:00Z" provider: "google" model: "gemini-3-pro-image-preview" mode: "batch" images:
task_key: "location/blackvein/overview@sha256:..." file_path: "images/overview-20251219T120000Z.png" status: "success"``` 

---

## 7. Error Handling

### 7.1 Partial Failures

The Batch API does not fail the entire job for individual item failures. Each result 
line may contain:
- `response` (success) — Contains generated content
- `error` (failure) — Contains error code and message

**Handling:**
1. Parse each line, check for `error` field
2. Log failed items to `failed/` directory with full context
3. Continue processing successful items
4. Include failure count in summary report

### 7.2 Job-Level Failures

If job reaches `JOB_STATE_FAILED`:
1. Log error details from job metadata
2. Preserve all uploaded files for debugging
3. Allow retry via `--resume` with fresh job submission

### 7.3 Network/Transient Errors

During file upload or polling:
1. Retry with exponential backoff (1s, 2s, 4s, 8s, 16s max)
2. Add jitter to prevent thundering herd
3. After 5 retries, fail the operation and preserve state

---

## 8. Constraints & Limits

### 8.1 Google Batch API Limits

| Limit | Value | Mitigation |
|-------|-------|------------|
| Concurrent batch jobs | 100 | Queue excess jobs |
| Input JSONL size | 2 GB | Use Files API for images |
| File storage | 20 GB | Cleanup after success |
| File retention | 48 hours | Re-upload if expired |
| Output tokens per request | 32,768 | 1 image per request |

### 8.2 Recommended Defaults

| Setting | Default | Notes |
|---------|---------|-------|
| Poll interval | 30,000 ms | Balance responsiveness vs API calls |
| Upload concurrency | 5 | Avoid rate limits on Files API |
| Chunk size | 500 tasks | Split large batches into multiple jobs |
| Cleanup | true | Delete uploaded files after success |

---

## 9. Security & Privacy

- API keys read from environment variables or config file (never committed)
- Uploaded files are ephemeral (48-hour retention)
- No PII in prompts or task keys
- Safety settings configurable per batch (default: standard filtering)

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Batch completion rate | > 95% tasks succeed |
| Resume success rate | 100% (no data loss on crash) |
| Cost savings vs sync | ~50% (per Google pricing) |
| Time to generate 100 images | < 2 hours (including queue time) |
```

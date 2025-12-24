``` markdown
# Chargen Batch Processing — API & Usage Analysis

Version: 1.0
Date: 2025-12-19

---

## 1. Google Gemini Batch API Reference

### 1.1 Overview

The Gemini Batch API enables asynchronous processing of large request volumes with:
- **50% cost reduction** compared to synchronous calls
- **Higher throughput** (bypasses standard RPM/TPM limits)
- **Target completion** within 24 hours (typically faster)

**Documentation**: https://ai.google.dev/gemini-api/docs/batch-api

### 1.2 SDK Setup
```

typescript import { GoogleGenAI } from '@google/genai';
const client = new GoogleGenAI({ apiKey: process.env.MYTHICINDEX_GOOGLE_API_KEY, });```

**SDK Methods Used**:
- `client.files.upload()` — Upload images and JSONL
- `client.files.download()` — Download results
- `client.files.delete()` — Cleanup
- `client.batches.create()` — Submit batch job
- `client.batches.get()` — Poll job status

### 1.3 Rate Limits & Quotas

#### Tier 1 (Free/Default)

| Resource | Limit |
|----------|-------|
| Concurrent batch jobs | 10 |
| Input file size | 2 GB |
| File storage | 2 GB |
| Batch enqueued tokens (Flash) | 4,000,000 |
| Batch enqueued tokens (Pro Image) | 2,700,000 |

#### Tier 2 (Pay-as-you-go)

| Resource | Limit |
|----------|-------|
| Concurrent batch jobs | 100 |
| Input file size | 2 GB |
| File storage | 20 GB |
| Batch enqueued tokens (Flash) | 400,000,000 |
| Batch enqueued tokens (Pro Image) | 270,000,000 |

**Documentation**: https://ai.google.dev/gemini-api/docs/rate-limits

### 1.4 Files API Constraints

| Constraint | Value | Impact |
|------------|-------|--------|
| Max file size | 2 GB | N/A for images |
| Retention period | 48 hours | Must re-upload for new runs |
| Max files | Based on storage quota | Cleanup after success |

**Best Practice**: Upload images via Files API, reference by URI in JSONL. Avoid inline Base64.

---

## 2. JSONL Request Format

### 2.1 Analysis Request
```

json { "key": "character/cidrella/portrait-v1", "request": { "contents":   , "generationConfig": { "responseMimeType": "application/json", "temperature": 0.2 } } }latex_unknown_tag``` 

### 2.2 Generation Request (Text Only)
```

json { "key": "character/cidrella/workshop-tinkering@sha256:abc123", "request": { "contents":   , "generationConfig": { "responseModalities": ["IMAGE"], "temperature": 1.0 } } }latex_unknown_tag```

### 2.3 Generation Request (With Reference Images)
```

json { "key": "character/cidrella/workshop-tinkering@sha256:abc123", "request": { "contents":   , "generationConfig": { "responseModalities": ["IMAGE"], "temperature": 1.0 } } }latex_unknown_tag``` 

---

## 3. JSONL Response Format

### 3.1 Successful Analysis Response
```

json { "key": "character/cidrella/portrait-v1", "response": { "candidates":    } }latex_unknown_tag```

### 3.2 Successful Generation Response
```

json { "key": "character/cidrella/workshop-tinkering@sha256:abc123", "response": { "candidates":    } }latex_unknown_tag``` 

### 3.3 Failed Response
```

json { "key": "character/cidrella/workshop-tinkering@sha256:abc123", "error": { "code": "SAFETY", "message": "Content blocked due to safety filters." } }```

---

## 4. Model Selection

### 4.1 For Analysis

| Model | Use Case | Cost | Speed |
|-------|----------|------|-------|
| `gemini-2.0-flash` | Standard analysis | Low | Fast |
| `gemini-1.5-flash` | Fallback | Low | Fast |
| `gemini-2.0-pro` | Complex analysis | Medium | Medium |

**Recommendation**: Use `gemini-2.0-flash` for analysis (good quality, low cost).

### 4.2 For Generation

| Model | Use Case | Cost | Quality |
|-------|----------|------|---------|
| `gemini-2.0-flash-preview-image-generation` | Fast generation | Low | Good |
| `imagen-3.0-generate-002` | High quality | Medium | Excellent |

**Recommendation**: Use `gemini-2.0-flash-preview-image-generation` for batch (cost-effective).

---

## 5. Workflow Patterns

### 5.1 Simple Generation Batch
```

User selects "Batch Generate" │ ├─> Select scope (characters / locations / all) │ ├─> System scans entity cache │ └─> Filters by scope │ └─> Reads imagery.yaml for each entity │ └─> Identifies pending scenes (no existing image) │ ├─> System shows plan │ └─> "Found 47 tasks across 12 characters" │ └─> "Estimated cost: ~$X.XX" │ ├─> User confirms │ ├─> System stages files │ └─> Uploads reference images (if any) │ └─> Builds JSONL │ └─> Uploads JSONL │ ├─> System submits batch │ └─> Creates job │ └─> Saves state │ ├─> System polls (with spinner) │ └─> "Batch running... 47 tasks" │ └─> Updates every 30s │ ├─> System downloads results │ ├─> System applies results │ └─> Writes images to correct folders │ └─> Updates imagery.yaml files │ └─> System shows report └─> "Completed: 45 success, 2 failed" └─> "View failed items? [y/n]"``` 

### 5.2 Analysis → Generation Pipeline
```

Phase 1: Analyze existing images │ ├─> Scan all characters for images without analysis ├─> Upload images, submit analysis batch ├─> Parse results, save to imagery.yaml │ └─> Output: Structured metadata for each image
Phase 2: Generate new images │ ├─> Use analysis metadata to build richer prompts │ └─> Include canonical traits from analysis │ └─> Enforce style consistency │ └─> Generate with improved prompt quality```

### 5.3 Resume Pattern
```

User runs "chargen" after crash │ ├─> System detects incomplete batch run │ └─> ".chargen/batch/2025-12-19T12-00-00Z/state.json" │ └─> Phase: "running" │ ├─> System prompts: "Resume interrupted batch? [y/n]" │ ├─> User confirms │ ├─> System determines resume point │ └─> Files already uploaded? → Skip staging │ └─> Job already submitted? → Poll for results │ └─> Results already downloaded? → Apply │ └─> Continue from last checkpoint``` 

---

## 6. Cost Analysis

### 6.1 Pricing (Batch API)

| Model | Input | Output |
|-------|-------|--------|
| gemini-2.0-flash | $0.0375/1M tokens | $0.15/1M tokens |
| imagen-3.0 | N/A | ~$0.02/image |

**Note**: Batch API provides 50% discount on these rates.

### 6.2 Estimated Costs

| Scenario | Tasks | Est. Cost |
|----------|-------|-----------|
| Analyze 100 images | 100 | ~$0.50 |
| Generate 50 character images | 50 | ~$1.00 |
| Full project batch (200 tasks) | 200 | ~$3.00 |

### 6.3 Cost Optimization

1. **Use Files API** — Avoid inline Base64 (reduces input tokens)
2. **Batch similar tasks** — One job per model type
3. **Skip duplicates** — Idempotent planning saves re-generation
4. **Clean up files** — Stay within storage quota

---

## 7. Error Scenarios & Handling

### 7.1 Upload Failures

| Error | Cause | Handling |
|-------|-------|----------|
| `QUOTA_EXCEEDED` | Storage limit reached | Cleanup old files, retry |
| `INVALID_ARGUMENT` | Bad file format | Skip file, log error |
| `DEADLINE_EXCEEDED` | Upload timeout | Retry with backoff |

### 7.2 Job Failures

| State | Cause | Handling |
|-------|-------|----------|
| `JOB_STATE_FAILED` | Batch-level error | Log error, abort run |
| Item error | Per-request failure | Log to DLQ, continue |

### 7.3 Safety Blocks

| Error Code | Cause | Handling |
|------------|-------|----------|
| `SAFETY` | Content policy violation | Log, suggest prompt revision |
| `RECITATION` | Copyrighted content | Log, suggest prompt revision |

---

## 8. CLI Commands

### 8.1 Menu-Based (Primary)
```

chargen → Batch Operations → Generate Images (Batch) → Select scope: [Characters / Locations / Chapters / All] → Filter by slug? [optional] → Confirm plan → [Running...] → View report
→ Analyze Images (Batch)
→ Select scope
→ [Running...]
→ View report

→ Resume Interrupted Run
→ Select run to resume
→ [Running...]

→ View Batch History
→ List recent runs
→ View run details```

### 8.2 Direct Commands (Optional, Future)
```

bash
Generate all pending character images
chargen batch generate --scope characters
Analyze specific character's images
chargen batch analyze --scope characters --filter cidrella-vexweld
Dry run (plan only, no execution)
chargen batch generate --scope all --dry-run
Resume specific run
chargen batch resume 2025-12-19T12-00-00Z
View run history
chargen batch history``` 

---

## 9. Monitoring & Observability

### 9.1 Progress Display

During execution:
```

◐ Batch running... 47 tasks ├─ Phase: running ├─ Job: batches/abc123 ├─ Started: 2 minutes ago └─ Poll in: 28s```

### 9.2 Completion Report
```

┌─────────────────────────────────────────┐ │ Batch Run Complete │ ├─────────────────────────────────────────┤ │ Run ID: 2025-12-19T12-00-00Z │ │ Duration: 8m 32s │ │ Tasks: 47 total │ │ ✓ Success: 45 │ │ ✗ Failed: 2 │ │ ○ Skipped: 0 │ ├─────────────────────────────────────────┤ │ Outputs: │ │ characters/cidrella-vexweld/images/ │ │ characters/thane-blackwood/images/ │ │ ... (10 more) │ ├─────────────────────────────────────────┤ │ View failed items? [y/n] │ └─────────────────────────────────────────┘``` 

### 9.3 Log Files
```

.chargen/batch/2025-12-19T12-00-00Z/ ├── logs.ndjson # Structured logs └── report.json # Machine-readable summary```

---

## 10. Security Considerations

### 10.1 API Key Management

- Store in environment variable: `MYTHICINDEX_GOOGLE_API_KEY`
- Never log or persist API keys
- Use separate keys for dev/prod if needed

### 10.2 Content Safety

- Default safety settings are recommended for creative content
- Option to adjust for specific use cases:
```

typescript safetySettings:   latex_unknown_tag``` 

### 10.3 Data Privacy

- Uploaded files are ephemeral (48-hour retention)
- No PII should be included in prompts
- Google's data use policies apply to uploaded content
```

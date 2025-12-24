``` markdown
# Chargen Batch Processing — Code Architecture

Version: 1.0
Date: 2025-12-19

---

## 1. Module Structure
```

src/ ├── batch/ # NEW: Batch processing module │ ├── index.ts # Public API exports │ ├── types.ts # Type definitions │ │ │ ├── planner/ │ │ ├── index.ts # Plan builder orchestration │ │ ├── character-planner.ts # Character-specific task discovery │ │ ├── location-planner.ts # Location-specific task discovery │ │ ├── chapter-planner.ts # Chapter-specific task discovery │ │ └── task-key.ts # Deterministic key generation │ │ │ ├── staging/ │ │ ├── files-cache.ts # Upload cache management │ │ ├── uploader.ts # Files API wrapper │ │ └── jsonl-builder.ts # JSONL construction │ │ │ ├── execution/ │ │ ├── submit.ts # Batch job creation │ │ ├── poller.ts # Status polling with backoff │ │ └── downloader.ts # Result retrieval │ │ │ ├── results/ │ │ ├── parser.ts # Output JSONL parsing │ │ ├── apply.ts # Write images + update YAML │ │ └── report.ts # Summary generation │ │ │ ├── state/ │ │ ├── run-state.ts # State persistence │ │ └── lock.ts # Concurrent run prevention │ │ │ └── adapters/ │ ├── analysis.ts # Analysis request/response handling │ └── generation.ts # Generation request/response handling │ ├── menus/ │ ├── batch-menu.ts # NEW: Batch operations menu │ └── ... (existing menus) │ ├── services/ │ ├── google/ # NEW: Google SDK wrappers │ │ ├── client.ts # GenAI client singleton │ │ ├── files.ts # Files API helpers │ │ └── batches.ts # Batch API helpers │ │ │ ├── images/ │ │ └── providers/ │ │ └── google.ts # EXTEND: Add batch support │ │ │ └── ... (existing services) │ └── types/ └── batch.ts # NEW: Batch type definitions```

---

## 2. Core Types

### 2.1 `src/types/batch.ts`
```

typescript /**
Batch processing type definitions */
export type BatchMode = 'analyze' | 'generate'; export type BatchScope = 'characters' | 'locations' | 'chapters' | 'all'; export type EntityType = 'character' | 'location' | 'chapter';
export interface BatchConfig { mode: BatchMode; scope: BatchScope; model: string; entityFilter?: string[]; // Specific slugs to include dryRun: boolean; pollIntervalMs: number; uploadConcurrency: number; cleanupAfterSuccess: boolean; }
export interface BatchTask { key: string; // Deterministic identifier kind: BatchMode; entityType: EntityType; entitySlug: string;
// For analysis inputImages?: ImageRef[];
// For generation prompt?: string; negativePrompt?: string; referenceImages?: ImageRef[];
// Output targeting outputDir: string; outputFileNameHint: string;
// Provider config model: string; aspectRatio?: string; temperature?: number; responseMimeType?: string; }
export interface ImageRef { path: string; mime: string; sha256?: string; // Computed during staging uploadedUri?: string; // Populated after upload }
export interface TaskResult { key: string; status: 'success' | 'failed' | 'skipped'; error?: { code?: string; message: string; };
// For analysis analysisJson?: unknown;
// For generation imagePath?: string;
// Provider metadata providerMeta?: Record<string, unknown>; }
export interface BatchPlan { runId: string; createdAt: string; config: BatchConfig; tasks: BatchTask[]; }
export type BatchPhase = | 'planned' | 'staging' | 'staged' | 'submitted' | 'running' | 'downloading' | 'applying' | 'completed' | 'failed';
export interface BatchRunState { runId: string; phase: BatchPhase; config: BatchConfig;
// Timing createdAt: string; updatedAt: string; completedAt?: string;
// Job tracking batchJobName?: string; requestFileName?: string; resultFileName?: string;
// Progress totalTasks: number; completedTasks: number; failedTasks: number; skippedTasks: number;
// Error info (if failed) error?: string; }
export interface FilesCache { entries: Record<string, FilesCacheEntry>; runId: string; createdAt: string; }
export interface FilesCacheEntry { localPath: string; sha256: string; mime: string; uploadedUri: string; uploadedAt: string; expiresAt: string; // 48 hours from upload }
export interface BatchReport { runId: string; config: BatchConfig; timing: { startedAt: string; completedAt: string; durationMs: number; }; summary: { total: number; success: number; failed: number; skipped: number; }; failures: Array<{ key: string; error: string; }>; }``` 

---

## 3. Key Interfaces

### 3.1 Google SDK Abstraction
```

typescript // src/services/google/batches.ts
export interface GoogleBatchClient { createJob(args: { model: string; inputFileUri: string; displayName?: string; }): Promise<{ jobName: string }>;
getJob(jobName: string): Promise<{ state: 'JOB_STATE_PENDING' | 'JOB_STATE_RUNNING' | 'JOB_STATE_SUCCEEDED' | 'JOB_STATE_FAILED'; outputFileUri?: string; error?: string; }>;
cancelJob(jobName: string): Promise; }
export interface GoogleFilesClient { upload(args: { localPath: string; mimeType: string; displayName?: string; }): Promise<{ uri: string; name: string }>;
download(fileUri: string): Promise;
delete(fileName: string): Promise; }```

### 3.2 Planner Interface
```

typescript // src/batch/planner/index.ts
export interface PlannerOptions { scope: BatchScope; mode: BatchMode; entityFilter?: string[]; model: string; }
export interface Planner { buildPlan(options: PlannerOptions): Promise<BatchTask[]>; }``` 

### 3.3 Adapter Interface
```

typescript // src/batch/adapters/types.ts
export interface BatchAdapter { /** Build JSONL request lines from tasks */ buildRequests(tasks: BatchTask[]): JsonlRequestLine[];
/** Extract results from response lines */ parseResults(lines: JsonlResponseLine[], tasks: BatchTask[]): TaskResult[];
/** Apply a single result (write file, update YAML) */ applyResult(result: TaskResult, task: BatchTask): Promise; }```

---

## 4. Data Flow
```

┌─────────────────────────────────────────────────────────────────────────────┐ │ PLANNING PHASE │ ├─────────────────────────────────────────────────────────────────────────────┤ │ │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ Entity Cache │───>│ Planner │───>│ Task[] │ │ │ │ (existing) │ │ (per entity) │ │ │ │ │ └──────────────┘ └──────────────┘ └──────┬───────┘ │ │ │ │ │ ┌──────────────┐ ┌──────────────┐ │ │ │ │ imagery.yaml │───>│ Skip Check │──────────┤ Filter out already done │ │ │ (existing) │ │ (by key) │ │ │ │ └──────────────┘ └──────────────┘ ▼ │ │ ┌──────────────┐ │ │ │ plan.json │ │ │ └──────────────┘ │ └─────────────────────────────────────────────────────────────────────────────┘ │ ▼ ┌─────────────────────────────────────────────────────────────────────────────┐ │ STAGING PHASE │ ├─────────────────────────────────────────────────────────────────────────────┤ │ │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ Reference │───>│ SHA256 │───>│ Files Cache │ │ │ │ Images │ │ + Upload │ │ Check │ │ │ └──────────────┘ └──────────────┘ └──────┬───────┘ │ │ │ │ │ ┌─────────────────────┼─────────────────────┐ │ │ │ cache miss │ cache hit │ │ │ ▼ ▼ │ │ │ ┌──────────────┐ ┌──────────────┐ │ │ │ │ Files API │ │ Reuse URI │ │ │ │ │ Upload │ │ │ │ │ │ └──────┬───────┘ └──────────────┘ │ │ │ │ │ │ │ └────────────────────┬───────────────────────┘ │ │ ▼ │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ Tasks[] │───>│ JSONL │───>│ requests. │ │ │ │ + URIs │ │ Builder │ │ jsonl │ │ │ └──────────────┘ └──────────────┘ └──────┬───────┘ │ │ │ │ │ ▼ │ │ ┌──────────────┐ │ │ │ Upload JSONL │ │ │ │ to Files API │ │ │ └──────────────┘ │ └─────────────────────────────────────────────────────────────────────────────┘ │ ▼ ┌─────────────────────────────────────────────────────────────────────────────┐ │ EXECUTION PHASE │ ├─────────────────────────────────────────────────────────────────────────────┤ │ │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ JSONL URI │───>│ batches. │───>│ Job Name │ │ │ │ │ │ create() │ │ │ │ │ └──────────────┘ └──────────────┘ └──────┬───────┘ │ │ │ │ │ ▼ │ │ ┌──────────────┐ │ │ │ Poll Loop │ │ │ │ (30s interval)│ │ │ └──────┬───────┘ │ │ │ │ │ ┌──────────────────────────┼──────────────────────┐ │ │ │ SUCCEEDED │ FAILED │ │ │ ▼ ▼ │ │ │ ┌──────────────┐ ┌──────────────┐ │ │ │ │ Download │ │ Log Error │ │ │ │ │ results.jsonl│ │ + Abort │ │ │ │ └──────────────┘ └──────────────┘ │ │ │ │ └─────────────────────────────────────────────────────────────────────────────┘ │ ▼ ┌─────────────────────────────────────────────────────────────────────────────┐ │ RESULTS PHASE │ ├─────────────────────────────────────────────────────────────────────────────┤ │ │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ results.jsonl│───>│ Parser │───>│ TaskResult[] │ │ │ │ (streaming) │ │ (per line) │ │ │ │ │ └──────────────┘ └──────────────┘ └──────┬───────┘ │ │ │ │ │ ┌──────────────────────────┼──────────────────────┐ │ │ │ success │ failed │ │ │ ▼ ▼ │ │ │ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │ │ │ │ Decode Base64│───>│ Write Image │ │ Log to DLQ │ │ │ │ │ │ │ to outputDir │ │ │ │ │ │ └──────────────┘ └──────┬───────┘ └──────────────┘ │ │ │ │ │ │ │ ▼ │ │ │ ┌──────────────┐ │ │ │ │ Update │ │ │ │ │ imagery.yaml │ │ │ │ └──────────────┘ │ │ │ │ │ │ │ ▼ │ │ │ ┌──────────────┐ │ │ │ report.json │ │ │ └──────────────┘ │ └─────────────────────────────────────────────────────────────────────────────┘``` 

---

## 5. State Machine
```

    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │    ┌─────────┐                                              │
    │    │ planned │                                              │
    │    └────┬────┘                                              │
    │         │ startStaging()                                    │
    │         ▼                                                   │
    │    ┌─────────┐                                              │
    │    │ staging │ ←───────────────────┐                        │
    │    └────┬────┘                     │                        │
    │         │ completeStaging()        │ resume (staged)        │
    │         ▼                          │                        │
    │    ┌─────────┐                     │                        │
    │    │ staged  │─────────────────────┘                        │
    │    └────┬────┘                                              │
    │         │ submit()                                          │
    │         ▼                                                   │
    │    ┌───────────┐                                            │
    │    │ submitted │ ←─────────────────┐                        │
    │    └─────┬─────┘                   │                        │
    │          │ poll() → running        │ resume (submitted)     │
    │          ▼                         │                        │
    │    ┌─────────┐                     │                        │
    │    │ running │─────────────────────┘                        │
    │    └────┬────┘                                              │
    │         │                                                   │
    │    ┌────┴────────────────┐                                  │
    │    │ poll() → succeeded  │ poll() → failed                  │
    │    ▼                     ▼                                  │
    │  ┌─────────────┐    ┌────────┐                              │
    │  │ downloading │    │ failed │ ─────────────────────────────┘
    │  └──────┬──────┘    └────────┘
    │         │ download()
    │         ▼
    │  ┌──────────┐
    │  │ applying │
    │  └────┬─────┘
    │       │ apply()
    │       ▼
    │  ┌───────────┐
    │  │ completed │
    │  └───────────┘
    │
    └─────────────────────────────────────────────────────────────┘``` 

---

## 6. Integration Points

### 6.1 Reuse Existing Services

| Existing Service | Usage in Batch |
|------------------|----------------|
| `entity-cache.ts` | Discover characters/locations/chapters |
| `prompt-compiler/` | Build prompts for generation tasks |
| `imagery-yaml.ts` | Read existing state, write generation results |
| `asset-registry.ts` | Resolve reference image paths |
| `config.ts` | Read API keys, default models |

### 6.2 Menu Integration

Add to `src/menus/main.ts`:
```

typescript const mainMenuChoices =   ;
// In switch statement: case 'batch': await runBatchMenu(); break;latex_unknown_tag``` 

New `src/menus/batch-menu.ts`:
```

typescript export async function runBatchMenu(): Promise{ const action = await select({ message: 'Batch Operations', choices:   , });
// Handle selection... }latex_unknown_tag```

---

## 7. Error Handling Strategy

### 7.1 Error Categories
```

typescript // src/batch/errors.ts
export class BatchError extends Error { constructor(message: string, public readonly code: string) { super(message); this.name = 'BatchError'; } }
export class PlanningError extends BatchError { constructor(message: string) { super(message, 'PLANNING_ERROR'); } }
export class StagingError extends BatchError { constructor(message: string, public readonly failedUploads: string[]) { super(message, 'STAGING_ERROR'); } }
export class ExecutionError extends BatchError { constructor(message: string, public readonly jobName?: string) { super(message, 'EXECUTION_ERROR'); } }
export class ResultsError extends BatchError { constructor(message: string, public readonly failedKeys: string[]) { super(message, 'RESULTS_ERROR'); } }``` 

### 7.2 Retry Logic
```

typescript // src/batch/util/retry.ts
export interface RetryOptions { maxAttempts: number; baseDelayMs: number; maxDelayMs: number; jitter: boolean; }
export async function withRetry  : Promise { let lastError: Error | undefined;
for (let attempt = 1; attempt <= options.maxAttempts; attempt++) { try { return await fn(); } catch (error) { lastError = error as Error;
if (attempt === options.maxAttempts) break;
if (!isRetryable(error)) throw error;

const delay = calculateBackoff(attempt, options);
await sleep(delay);
}
}
throw lastError; }
function isRetryable(error: unknown): boolean { if (error instanceof Error) { // Retry on network errors and rate limits return error.message.includes('429') || error.message.includes('ECONNRESET') || error.message.includes('ETIMEDOUT') || error.message.includes('5'); } return false; }latex_unknown_tag```

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Module | Test Focus |
|--------|------------|
| `task-key.ts` | Deterministic key generation, hash stability |
| `jsonl-builder.ts` | Correct JSONL format, streaming |
| `parser.ts` | Response parsing, error extraction |
| `run-state.ts` | State persistence, resume logic |

### 8.2 Integration Tests

| Test | Description |
|------|-------------|
| Plan → Execute (mock) | Full flow with mocked Google APIs |
| Resume from each phase | Verify state machine transitions |
| Partial failure handling | Mix of success/failure results |

### 8.3 E2E Tests

| Test | Description |
|------|-------------|
| Small batch (5 tasks) | Real API call with minimal tasks |
| Resume after crash | Kill process mid-run, verify resume |
```

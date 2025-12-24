Below is a **clean, dedicated “batch mode” layout** you can drop into `chargen` without tangling up your interactive CLI. It’s built around the **Gemini Batch API + Files API** from the **Google GenAI SDK for JS** (`@google/genai`). ([Google AI for Developers][1])

---

## Batch mode goals (for your use-case)

You want two big batch-able flows:

1. **Mass image analysis** (100+ local images → structured text/JSON outputs)

    * Default model: `gemini-3-flash-preview` (fast, multimodal input, text output) ([Google AI for Developers][2])
    * For “harder” understanding: `gemini-3-pro-preview` ([Google AI for Developers][2])

2. **Mass image generation** (many prompts → lots of images)

    * Model: `gemini-3-pro-image-preview` (image+text output) ([Google AI for Developers][2])
    * Batch is ideal when you don’t need immediate results; it’s async (target 24h, usually faster) and discounted vs realtime. ([Google AI for Developers][3])

Batch constraints you’ll design around:

* **100 concurrent batch requests**, **2GB input file**, **20GB file storage**, and **Tier 2 batch enqueued tokens** that are large enough to support serious workloads (e.g. Tier 2: Flash Preview 400,000,000; Pro Image Preview 270,000,000). ([Google AI for Developers][4])

Non-batch (realtime) RPM/TPM/RPD vary by model and tier; Google explicitly points you to **AI Studio** to see the active numbers. ([Google AI for Developers][4])

---

## How batch mode operates (diagram)

```mermaid
flowchart TD
  A[Scan local inputs] --> B[Upload media to Files API]
  B --> C[Build requests.jsonl\n(one line per request)]
  C --> D[Upload requests.jsonl to Files API]
  D --> E[Create batch job\nai.batches.create]
  E --> F[Poll status\nai.batches.get]
  F -->|Succeeded| G[Download results JSONL\nai.files.download]
  G --> H[Materialize outputs\n(text/json/images)]
  H --> I[(Optional) Cleanup\nfiles.delete]
```

Key idea: **don’t inline base64 images into JSONL** if you can avoid it. Uploading images once via **Files API** keeps your JSONL tiny and prevents the 2GB input file limit from surprising you. ([Google AI for Developers][5])

---

## Proposed module layout

Add a dedicated folder that doesn’t mess with your existing menus:

```
chargen/src/
  batch/
    cli.ts
    types.ts
    config.ts
    planner.ts
    jsonl.ts
    genai.ts
    runner.ts
    poller.ts
    results.ts
    state.ts
    adapters/
      imageAnalysis.ts
      imageGeneration.ts
```

**Responsibilities**

* `cli.ts`: parses args, selects adapter, kicks off runner
* `planner.ts`: turns “images on disk” into `BatchTask[]`
* `adapters/*`: how to build prompts + how to materialize results
* `jsonl.ts`: writes/reads jsonl in the *Batch API format*
* `genai.ts`: thin wrapper around `@google/genai` client calls
* `state.ts`: stores run manifests so you can resume safely
* `runner.ts`: orchestration (prepare → submit → poll → download → materialize)
* `poller.ts`: backoff/polling rules
* `results.ts`: decode output JSONL and write files

---

## Minimal code scaffold (drop-in)

### `src/batch/types.ts`

```ts
export type BatchMode = "analyze-images" | "generate-images";

export interface BatchRunConfig {
  mode: BatchMode;
  model: string;                // e.g. gemini-3-flash-preview
  runDir: string;               // e.g. .chargen-batch/2025-12-19T....
  pollIntervalMs: number;       // e.g. 10_000
  uploadConcurrency: number;    // e.g. 5
  chunkSize: number;            // requests per batch job (keep it simple at first)
  cleanupUploadedFiles: boolean;
}

export interface BatchTask {
  key: string;                  // must be unique; used to map results back
  localPath?: string;           // image path (analysis)
  mimeType?: string;            // image mime
  uploadedFileUri?: string;     // Files API URI after upload
  uploadedFileMime?: string;    // Files API mimeType after upload

  // prompt content
  prompt: string;

  // output
  outputDir: string;            // where to write result for this task
  outputBaseName: string;       // filename stem
}

export interface BatchJobState {
  runId: string;
  model: string;
  createdAt: string;
  mode: BatchMode;

  // Files API name for uploaded jsonl
  requestFileName?: string;

  // Batch job name returned by API
  batchJobName?: string;

  // Once succeeded, dest file name (results jsonl)
  resultFileName?: string;
}
```

---

### `src/batch/genai.ts`

```ts
import { GoogleGenAI } from "@google/genai";

export function getGenAIClient(): GoogleGenAI {
  // The SDK will read env vars if configured; you can also pass apiKey explicitly.
  // Keep this wrapper so you can later support ADC / OAuth / multiple projects.
  return new GoogleGenAI({});
}
```

---

### `src/batch/state.ts`

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { BatchJobState } from "./types";

const STATE_FILE = "state.json";

export async function writeState(runDir: string, state: BatchJobState): Promise<void> {
  await fs.mkdir(runDir, { recursive: true });
  await fs.writeFile(path.join(runDir, STATE_FILE), JSON.stringify(state, null, 2), "utf8");
}

export async function readState(runDir: string): Promise<BatchJobState | null> {
  try {
    const raw = await fs.readFile(path.join(runDir, STATE_FILE), "utf8");
    return JSON.parse(raw) as BatchJobState;
  } catch {
    return null;
  }
}
```

---

### `src/batch/jsonl.ts`

This matches the Batch API “one line per request” structure: `{ key, request }`. ([Google AI for Developers][1])

```ts
import { createWriteStream, promises as fs } from "node:fs";
import * as readline from "node:readline";

export type JsonlRequestLine = {
  key: string;
  request: Record<string, unknown>;
};

export async function writeJsonl(filePath: string, lines: JsonlRequestLine[]): Promise<void> {
  await fs.mkdir(require("node:path").dirname(filePath), { recursive: true });
  const ws = createWriteStream(filePath, { encoding: "utf8" });
  for (const line of lines) {
    ws.write(JSON.stringify(line) + "\n");
  }
  await new Promise<void>((resolve, reject) => {
    ws.end(() => resolve());
    ws.on("error", reject);
  });
}

export async function readJsonl<T = any>(filePath: string): Promise<T[]> {
  const rs = require("node:fs").createReadStream(filePath, "utf8");
  const rl = readline.createInterface({ input: rs, crlfDelay: Infinity });
  const out: T[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    out.push(JSON.parse(trimmed) as T);
  }
  return out;
}
```

---

### `src/batch/poller.ts`

```ts
export async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
```

---

### `src/batch/adapters/imageAnalysis.ts`

Build requests that reference **uploaded Files API URIs** (recommended). ([Google AI for Developers][5])

```ts
import { BatchTask } from "../types";

export function buildAnalysisJsonlLines(tasks: BatchTask[]) {
  return tasks.map((t) => {
    if (!t.uploadedFileUri || !t.uploadedFileMime) {
      throw new Error(`Task ${t.key} missing uploadedFileUri/mime`);
    }

    return {
      key: t.key,
      request: {
        // Request body for generateContent. Model is specified when creating the batch job.
        contents: [
          {
            role: "user",
            parts: [
              { fileData: { fileUri: t.uploadedFileUri, mimeType: t.uploadedFileMime } },
              { text: t.prompt },
            ],
          },
        ],
        // Optional: you can add structured output constraints here later.
        // generationConfig: { temperature: 0.2 },
      },
    };
  });
}

export function extractTextFromResponseLine(line: any): string {
  // Typical: line.response.candidates[0].content.parts[*].text
  const parts = line?.response?.candidates?.[0]?.content?.parts ?? [];
  const texts = parts.map((p: any) => p?.text).filter(Boolean);
  return texts.join("\n").trim();
}
```

---

### `src/batch/adapters/imageGeneration.ts`

Batch image generation returns images as inline base64 in `inlineData` parts (example shown in Google docs). ([Google AI for Developers][1])

```ts
import { BatchTask } from "../types";

export function buildImageGenJsonlLines(tasks: BatchTask[]) {
  return tasks.map((t) => ({
    key: t.key,
    request: {
      contents: [{ role: "user", parts: [{ text: t.prompt }] }],
      // Gemini docs show generation_config for multi-modal output in batch examples.
      // Keep it explicit so the model returns images.
      generation_config: { responseModalities: ["TEXT", "IMAGE"] },
    },
  }));
}

export function extractInlineImages(line: any): Array<{ mimeType: string; dataB64: string }> {
  const parts = line?.response?.candidates?.[0]?.content?.parts ?? [];
  const imgs: Array<{ mimeType: string; dataB64: string }> = [];
  for (const p of parts) {
    const inline = p?.inlineData;
    if (inline?.data && inline?.mimeType) {
      imgs.push({ mimeType: inline.mimeType, dataB64: inline.data });
    }
  }
  return imgs;
}
```

---

### `src/batch/runner.ts`

This is the core orchestration using **Files API + Batch API** methods that Google documents (`files.upload`, `batches.create`, `batches.get`, `files.download`). ([Google AI for Developers][1])

```ts
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { getGenAIClient } from "./genai";
import { writeJsonl, readJsonl } from "./jsonl";
import { sleep } from "./poller";
import { BatchRunConfig, BatchTask, BatchJobState } from "./types";
import { writeState } from "./state";
import { buildAnalysisJsonlLines, extractTextFromResponseLine } from "./adapters/imageAnalysis";
import { buildImageGenJsonlLines, extractInlineImages } from "./adapters/imageGeneration";

function nowRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function limitConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.max(1, concurrency) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function runBatch(config: Omit<BatchRunConfig, "runDir">, tasks: BatchTask[]): Promise<string> {
  const runId = nowRunId();
  const runDir = path.join(".chargen-batch", runId);
  await fs.mkdir(runDir, { recursive: true });

  const fullConfig: BatchRunConfig = { ...config, runDir };
  const ai = getGenAIClient();

  const state: BatchJobState = {
    runId,
    model: fullConfig.model,
    createdAt: new Date().toISOString(),
    mode: fullConfig.mode,
  };
  await writeState(runDir, state);

  // 1) Upload media (analysis mode)
  if (fullConfig.mode === "analyze-images") {
    // Validate inputs exist early
    for (const t of tasks) {
      if (!t.localPath) throw new Error(`Task ${t.key} missing localPath`);
      if (!(await fileExists(t.localPath))) throw new Error(`Missing file: ${t.localPath}`);
    }

    await limitConcurrency(tasks, fullConfig.uploadConcurrency, async (t) => {
      const up = await ai.files.upload({
        file: t.localPath!,
        config: { mimeType: t.mimeType || "image/png" },
      });
      t.uploadedFileUri = up.uri;
      t.uploadedFileMime = up.mimeType;
      return up.name;
    });
  }

  // 2) Build JSONL lines
  const lines =
    fullConfig.mode === "analyze-images"
      ? buildAnalysisJsonlLines(tasks)
      : buildImageGenJsonlLines(tasks);

  // 3) Write requests.jsonl locally
  const requestsJsonlPath = path.join(runDir, "requests.jsonl");
  await writeJsonl(requestsJsonlPath, lines);

  // 4) Upload requests.jsonl
  const uploadedReqFile = await ai.files.upload({
    file: requestsJsonlPath,
    config: { mimeType: "application/jsonl" },
  });
  state.requestFileName = uploadedReqFile.name;
  await writeState(runDir, state);

  // 5) Create batch job
  const batch = await ai.batches.create({
    model: fullConfig.model,
    src: uploadedReqFile.name,
    config: { displayName: `chargen-${fullConfig.mode}-${runId}` },
  });

  state.batchJobName = batch.name;
  await writeState(runDir, state);

  // 6) Poll until terminal
  while (true) {
    const job = await ai.batches.get({ name: state.batchJobName! });
    const jobState = job.state;

    if (jobState !== "JOB_STATE_RUNNING") {
      if (jobState !== "JOB_STATE_SUCCEEDED") {
        throw new Error(`Batch job ended in state ${jobState}`);
      }
      state.resultFileName = job.dest?.fileName;
      await writeState(runDir, state);
      break;
    }

    await sleep(fullConfig.pollIntervalMs);
  }

  // 7) Download result JSONL
  const resultJsonlPath = path.join(runDir, "results.jsonl");
  const resultContent = await ai.files.download({ file: state.resultFileName! });
  await fs.writeFile(resultJsonlPath, resultContent as any);

  // 8) Materialize outputs
  const resultLines = await readJsonl<any>(resultJsonlPath);

  if (fullConfig.mode === "analyze-images") {
    for (const line of resultLines) {
      const key = line?.key;
      const task = tasks.find((t) => t.key === key);
      if (!task) continue;

      await fs.mkdir(task.outputDir, { recursive: true });
      const outPath = path.join(task.outputDir, `${task.outputBaseName}.analysis.txt`);

      if (line?.error) {
        await fs.writeFile(outPath, `ERROR:\n${JSON.stringify(line.error, null, 2)}\n`, "utf8");
        continue;
      }

      const text = extractTextFromResponseLine(line);
      await fs.writeFile(outPath, text + "\n", "utf8");
    }
  } else {
    for (const line of resultLines) {
      const key = line?.key;
      const task = tasks.find((t) => t.key === key);
      if (!task) continue;

      await fs.mkdir(task.outputDir, { recursive: true });

      if (line?.error) {
        const errPath = path.join(task.outputDir, `${task.outputBaseName}.error.json`);
        await fs.writeFile(errPath, JSON.stringify(line.error, null, 2), "utf8");
        continue;
      }

      const imgs = extractInlineImages(line);
      let idx = 1;
      for (const img of imgs) {
        const ext = img.mimeType.includes("png") ? "png" : "jpg";
        const outImgPath = path.join(task.outputDir, `${task.outputBaseName}.${idx}.${ext}`);
        await fs.writeFile(outImgPath, Buffer.from(img.dataB64, "base64"));
        idx++;
      }

      // Optional: also store text parts
      const textPath = path.join(task.outputDir, `${task.outputBaseName}.text.txt`);
      const parts = line?.response?.candidates?.[0]?.content?.parts ?? [];
      const texts = parts.map((p: any) => p?.text).filter(Boolean).join("\n").trim();
      if (texts) await fs.writeFile(textPath, texts + "\n", "utf8");
    }
  }

  // 9) Cleanup (optional)
  if (fullConfig.cleanupUploadedFiles) {
    // Note: you may also delete per-image uploaded files if you store their .name.
    // Files are auto-deleted after ~48 hours anyway. :contentReference[oaicite:12]{index=12}
    try {
      await ai.files.delete({ name: state.requestFileName! });
    } catch {
      // best-effort
    }
  }

  return runDir;
}
```

---

### `src/batch/cli.ts`

Keep this boring: one command, a few flags, reuse your existing config/env.

```ts
import * as path from "node:path";
import { runBatch } from "./runner";
import { BatchTask, BatchMode } from "./types";

function getArg(name: string, def?: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : def;
}

function requireArg(name: string): string {
  const v = getArg(name);
  if (!v) throw new Error(`Missing --${name}=...`);
  return v;
}

// Minimal “scan”: you can replace this with your entity-cache powered scan later.
async function buildTasksFromDir(inputDir: string, outputDir: string): Promise<BatchTask[]> {
  const fs = await import("node:fs/promises");
  const entries = await fs.readdir(inputDir, { withFileTypes: true });

  const tasks: BatchTask[] = [];
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!/\.(png|jpg|jpeg|webp)$/i.test(ent.name)) continue;

    const localPath = path.join(inputDir, ent.name);
    const key = ent.name; // good enough for v1; you can hash later
    tasks.push({
      key,
      localPath,
      mimeType: ent.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
      prompt: "Describe this character image. Extract: apparent age, species, clothing, notable features, mood, lighting, background. Output as concise JSON.",
      outputDir,
      outputBaseName: ent.name.replace(/\.(png|jpg|jpeg|webp)$/i, ""),
    });
  }
  return tasks;
}

async function main() {
  const mode = (getArg("mode", "analyze-images") as BatchMode);
  const model = getArg("model") || (
    mode === "generate-images" ? "gemini-3-pro-image-preview" : "gemini-3-flash-preview"
  );

  const inputDir = requireArg("inputDir");
  const outputDir = requireArg("outputDir");

  const tasks = await buildTasksFromDir(inputDir, outputDir);

  const runDir = await runBatch(
    {
      mode,
      model,
      pollIntervalMs: Number(getArg("pollMs", "10000")),
      uploadConcurrency: Number(getArg("uploadConc", "5")),
      chunkSize: Number(getArg("chunkSize", "500")),
      cleanupUploadedFiles: getArg("cleanup", "false") === "true",
    },
    tasks
  );

  console.log(`Batch run saved at: ${runDir}`);
  console.log(`Tasks: ${tasks.length}`);
  console.log(`Model: ${model}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

---

## Hook it into your repo

### Add dependency

Use the GenAI SDK for JS shown in Google’s docs/examples. ([Google AI for Developers][5])

```bash
npm i @google/genai
```

### Add a script (example)

```json
{
  "scripts": {
    "batch": "tsx src/batch/cli.ts"
  }
}
```

### Run

```bash
MYTHICINDEX_GOOGLE_API_KEY="..." \
npm run batch -- \
  --mode=analyze-images \
  --model=gemini-3-flash-preview \
  --inputDir=MemoryQuill/story-content/characters/cidrella-vexweld/images \
  --outputDir=MemoryQuill/story-content/characters/cidrella-vexweld/generated_analysis \
  --uploadConc=5 \
  --pollMs=10000
```

---

## Practical “Tier 2” guidance for batching

For **Tier 2**, the batch quotas are big enough that your bottleneck is usually:

* input file size (2GB for JSONL),
* file storage (20GB),
* and how many concurrent batch jobs you kick off (up to 100). ([Google AI for Developers][4])

So the first “boring, safe” strategy is:

* **1 batch job per workload type** (analysis vs generation)
* **chunk by N tasks** (e.g. 250–1000 per job)
* store a **run manifest** so you can resume if your laptop sleeps

---

## Next step (if you want it): integrate with your actual `chargen` entities

Once this skeleton feels good, the clean integration is:

* replace `buildTasksFromDir()` with a planner that:

    * reads your character/location/chapter YAML
    * builds per-image prompts using your existing prompt compiler
    * writes outputs back into `imagery.yaml` / `imagery.runs.yaml`

If you paste your current `imageService.generateWithReferences()` (Google path), I’ll align the adapter prompts + output materialization so batch + non-batch share the same “prompt IR” + logging format.

[1]: https://ai.google.dev/gemini-api/docs/batch-api "Batch API  |  Gemini API  |  Google AI for Developers"
[2]: https://ai.google.dev/gemini-api/docs/models "Gemini models  |  Gemini API  |  Google AI for Developers"
[3]: https://ai.google.dev/gemini-api/docs/batch-api?utm_source=chatgpt.com "Batch API | Gemini API - Google AI for Developers"
[4]: https://ai.google.dev/gemini-api/docs/rate-limits "Rate limits  |  Gemini API  |  Google AI for Developers"
[5]: https://ai.google.dev/gemini-api/docs/files "Files API  |  Gemini API  |  Google AI for Developers"

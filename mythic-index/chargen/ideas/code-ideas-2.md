Here’s a clean “public API surface” you can export without accidentally turning half the repo into a dependency. I’m assuming your goal is: **let other code call generation / IR compile+render / YAML read-write / run logging** while keeping providers + UI logging mostly internal.

---

## 1) The module map (what depends on what)

```
+------------------+        +---------------------+        +------------------+
| prompt-compiler  | -----> | prompt-renderer     | -----> | images (service) |
|  (compile IR)    |        | (render + trim)     |        | (generate)       |
+------------------+        +---------------------+        +------------------+
          |                                                          |
          v                                                          v
+------------------+                                        +------------------+
| imagery-yaml      | <------------------------------------- | runs (appendRun) |
| (read/write spec) |                                        | createRun record |
+------------------+                                        +------------------+
```

If you export only the **boxed** pieces (compiler/renderer/service/yaml/runs + types), you have a tight “image kit” API.

---

## 2) What I would export (and what I would keep internal)

### Export (stable surface)

**Images**

* `ImageService`
* `initImageService`, `getImageService` *(or better: `createImageService(config)`—see below)*
* `generateFromIR`
* Types: `GeneratedImage`, `ImageGenerationOptions`, `CharacterConsistencyOptions`, `ImageEditOptions`, `ImageEditResult`, `ImageProvider`, `ImageScenario`

**Prompt**

* `compilePromptIR`, `compileLocationOverview`, `compileLocationPart`, `compileAllLocationTargets`, `listLocationTargets`
* `compileChapterImages`, `compileChapterImage`, `listChapterTargets`, `loadChapterContext`
* `renderPrompt`
* Types: `CompiledPromptIR`, `RenderedPrompt`, `GenerationConstraints`, `ResolvedReference`, `ReferenceRole`, `GenerationRun`, `ImageryRunsFile`, `TargetMetadata`

**YAML + run logging**

* `readImageryYaml`, `writeImageryYaml`
* `readRunsFile`, `writeRunsFile`
* `appendRun`, `createGenerationRun`
* Types: `GeneratedImageEntry`, `ImageInventoryEntry`, `CharacterImagery`, `LocationImagery`, `ChapterImagery`, `EntityType`

### Keep internal (avoid locking in implementation)

* Provider classes: `GoogleProvider`, `OpenAIProvider`
* CLI UI logging (`ui/log`, `ui/display`) **unless** you deliberately want a “noisy” library
* Path derivation that assumes repo layout (more on this below)

---

## 3) The “barrel exports” I’d actually add

### `chargen/src/services/images/public.ts`

```ts
export { ImageService, initImageService, getImageService, generateFromIR } from './index.js';

// Re-export just the public types/constants you want stable
export type {
  GeneratedImage,
  ImageProvider,
  ImageGenerationOptions,
  ImageEditOptions,
  ImageEditResult,
  CharacterConsistencyOptions,
  ImageScenario,
} from './types.js';

export { MASTER_STYLE, SCENARIO_DEFAULTS } from './constants.js';
```

### `chargen/src/services/prompt-compiler/public.ts`

```ts
export {
  compilePromptIR,
  // location compiler exports
  compileLocationOverview,
  compileLocationPart,
  compileAllLocationTargets,
  listLocationTargets,
  // chapter compiler exports
  compileChapterImages,
  compileChapterImage,
  listChapterTargets,
  loadChapterContext,
} from './index.js';
```

### `chargen/src/services/prompt-renderer/public.ts`

```ts
export { renderPrompt } from '../prompt-renderer.js';
export type { RenderedPrompt, RenderOptions, CompiledPromptIR } from '../../types/prompt-ir.js';
```

### `chargen/src/services/imagery-yaml/public.ts`

```ts
export {
  // imagery.yaml
  readImageryYaml,
  writeImageryYaml,
  getImageryPath,
  // imagery.runs.yaml
  readRunsFile,
  writeRunsFile,
  appendRun,
  createGenerationRun,
  getRunsPath,
} from '../imagery-yaml.js';

export type {
  EntityType,
  GeneratedImageEntry,
  ImageInventoryEntry,
  CharacterImagery,
  LocationImagery,
  ChapterImagery,
  ImageryData,
} from '../imagery-yaml.js';
```

### Root entrypoint `chargen/src/public.ts`

```ts
export * from './services/images/public.js';
export * from './services/prompt-compiler/public.js';
export * from './services/prompt-renderer/public.js';
export * from './services/imagery-yaml/public.js';

// Types that callers will commonly want
export type {
  CompiledPromptIR,
  RenderedPrompt,
  GenerationRun,
  ImageryRunsFile,
  ReferenceRole,
  TargetMetadata,
} from './types/prompt-ir.js';

export type { Config } from './types/config.js';
export { initConfig, getConfig, loadConfig } from './services/config.js';
```

That gives consumers: `import { compilePromptIR, renderPrompt, generateFromIR, appendRun } from '.../public'`.

---

## 4) Two sharp edges to fix before you “bless” the API

### A) `appendRun()` currently accepts `EntityType` but runs types don’t support `character`

In your `types/prompt-ir.ts`, `ImageryRunsFile.entity_type` is `'location' | 'chapter'`, but `appendRun()` takes `'character' | 'location' | 'chapter'` and does this:

```ts
entity_type: entityType === 'character' ? 'location' : entityType
```

That’s a footgun.

**Clean fix (recommended):** make runs explicitly only for location/chapter.

```ts
export type RunsEntityType = Exclude<EntityType, 'character'>;

export async function appendRun(entityType: RunsEntityType, slug: string, run: GenerationRun) { ... }
export function getRunsPath(entityType: RunsEntityType, slug: string) { ... }
export async function readRunsFile(entityType: RunsEntityType, slug: string) { ... }
export async function writeRunsFile(entityType: RunsEntityType, slug: string, data: ImageryRunsFile) { ... }
```

If you *do* want character runs, then update `ImageryRunsFile` + `GenerationRun.target_metadata.entity_type` to allow it, and treat it intentionally.

---

### B) Your “library” still hardcodes repo filesystem layout

Multiple modules derive `STORY_CONTENT_BASE` via `import.meta.url` + `.. / MemoryQuill / story-content`.

That’s fine for the CLI, but as a reusable image service it’s brittle.

**Minimal, maintainable upgrade:** a single “paths provider” module, and everything calls it.

Example:

```ts
// services/paths.ts
let storyContentBase: string | null = null;

export function setStoryContentBase(p: string) {
  storyContentBase = p;
}

export function getStoryContentBase(): string {
  if (!storyContentBase) throw new Error('storyContentBase not set');
  return storyContentBase;
}
```

Then in `imagery-yaml.ts` and `chapter-compiler.ts`, replace the local `STORY_CONTENT_BASE` const with `getStoryContentBase()`.

If you do only one refactor before exporting, do this one.

---

## 5) One more “API correctness” nit I’d fix now

In `resolveChapterConstraints()`:

```ts
aspect_ratio: options.aspectRatio || imageSpec.aspect_ratio || imagery.metadata.generation_defaults?.quality || '16:9'
```

That `generation_defaults?.quality` looks like it got pasted into the wrong slot. If you export this compiler, callers will trust it—so fix it before you publish the surface.

---

## 6) Suggested “public API” contract (what callers do)

**Flow:**

1. `compilePromptIR(entityType, slug, targetId)`
2. `renderPrompt(ir)`
3. `generateFromIR(entityType, slug, ir, rendered)`
4. `createGenerationRun(...)` + `appendRun(...)`

Sequence diagram:

```
Caller
  |
  | compilePromptIR(type, slug, target)
  v
Prompt Compiler  ---> reads imagery.yaml + resolves references
  |
  | renderPrompt(ir)
  v
Prompt Renderer  ---> trims/weights + negative prompt + hash
  |
  | generateFromIR(type, slug, ir, rendered)
  v
Image Service    ---> uses refs if present, writes PNG
  |
  | createGenerationRun(...) / appendRun(...)
  v
Runs YAML        ---> imagery.runs.yaml
```

---

If you want, paste your current `package.json` (or whatever you use to publish/build), and I’ll show the clean `exports` map so consumers can import `.../public` without reaching into deep paths.

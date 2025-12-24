Nice — with your current `package.json`, you’re *running TypeScript directly* via `tsx`, which is perfect for local dev, but if you want a **stable “library surface”** (`import { compilePromptIR } from 'chargen'`) you should add a **build step** and an **exports map**.

Below is a clean, minimal setup that supports **both**:

* a CLI (`chargen`)
* a “public API” library entrypoint (`chargen`)

---

## Target shape

```
src/
  public.ts          <-- your stable API barrel
  cli.ts             <-- CLI entry (calls menus)
dist/
  public.js + .d.ts
  cli.js + .d.ts
package.json exports:
  "chargen"      -> dist/public.js
  "chargen/cli"  -> dist/cli.js
bin:
  "chargen"      -> dist/cli.js
```

---

## 1) Add `src/public.ts`

This is your “blessed surface” (the barrels we talked about).

```ts
// src/public.ts
export * from './services/images/public.js';
export * from './services/prompt-compiler/public.js';
export * from './services/prompt-renderer/public.js';
export * from './services/imagery-yaml/public.js';

export type {
  CompiledPromptIR,
  RenderedPrompt,
  GenerationRun,
  ImageryRunsFile,
  ReferenceRole,
  TargetMetadata,
} from './types/prompt-ir.js';

export type { Config } from './types/config.js';
```

---

## 2) Add `src/cli.ts` (CLI entrypoint)

Basically your current `src/index.ts`, but move it to `cli.ts` so `index.ts` can remain internal if you want.

```ts
#!/usr/bin/env node
import { initConfig } from './services/config.js';
import { initImageService } from './services/images/index.js';
import { initEntityCache } from './services/entity-cache.js';
import { initAssetRegistry } from './services/asset-registry.js';
import { runMainMenu } from './menus/main.js';
import { showHeader, showError } from './ui/display.js';
import { withSpinner } from './ui/spinner.js';
import chalk from 'chalk';

async function main(): Promise<void> {
  try {
    showHeader();

    await initConfig();

    await withSpinner(
      'Scanning story content...',
      () => initEntityCache(),
      (cache) =>
        `Found ${cache.characters.length} characters, ` +
        `${cache.locations.length} locations, ` +
        `${cache.chapters.length} chapters`
    );

    await initAssetRegistry();
    initImageService();

    await runMainMenu();
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      console.log(chalk.dim('\n\nGoodbye!\n'));
      process.exit(0);
    }
    showError(`Fatal error: ${(error as Error).message}`);
    console.error(error);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  console.log(chalk.dim('\n\nGoodbye!\n'));
  process.exit(0);
});

main();
```

---

## 3) Add a build tsconfig (recommended)

Create `tsconfig.build.json`:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "emitDeclarationOnly": false,
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["**/*.test.ts", "dist", "node_modules"]
}
```

Key point: **NodeNext** keeps your `import './x.js'` style working cleanly in ESM output.

---

## 4) Update `package.json` (exports map + build)

Here’s a concrete version you can paste and tweak.

```json
{
  "name": "chargen",
  "version": "1.0.0",
  "description": "Interactive character image generator for MythicIndex",
  "type": "module",
  "bin": {
    "chargen": "./dist/cli.js"
  },
  "main": "./dist/public.js",
  "types": "./dist/public.d.ts",
  "exports": {
    ".": {
      "types": "./dist/public.d.ts",
      "default": "./dist/public.js"
    },
    "./cli": {
      "types": "./dist/cli.d.ts",
      "default": "./dist/cli.js"
    },
    "./package.json": "./package.json"
  },
  "files": [
    "dist",
    "package.json",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "tsx src/cli.ts",
    "dev": "tsx watch src/cli.ts",
    "lint": "eslint 'src/**/*.ts'",
    "format": "prettier --write 'src/**/*.ts'"
  },
  "dependencies": {
    "@google/genai": "^1.33.0",
    "@inquirer/prompts": "^7.0.0",
    "better-sqlite3": "^12.4.1",
    "chalk": "^5.3.0",
    "openai": "^4.104.0",
    "ora": "^8.0.0",
    "yaml": "^2.8.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.10.2",
    "@typescript-eslint/eslint-plugin": "^8.50.0",
    "@typescript-eslint/parser": "^8.50.0",
    "eslint": "^9.39.2",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-tsdoc": "^0.5.0",
    "prettier": "^3.7.4",
    "tsx": "^4.0.0",
    "typescript": "^5.7.2"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### What this gives you

* Consumers can do:

```ts
import { compilePromptIR, renderPrompt, generateFromIR } from 'chargen';
```

* You (or others) can also do:

```ts
import { runMainMenu } from 'chargen/cli'; // if you want that pattern
```

* And the CLI remains:

```bash
npx chargen
```

---

## 5) One “gotcha” to watch: `.js` import specifiers in TS

Your code already uses `import './x.js'` inside TypeScript. That’s correct for Node ESM builds with TS. Just make sure your main `tsconfig.json` (the one you extend) is also using NodeNext, or at least compatible.

If you paste your `tsconfig.json`, I’ll point out the one or two options that matter for this layout.

---

## 6) Optional but worth it: mark a stable API boundary

If you want to keep internals truly internal, the exports map should **only** expose `"."` and `"./cli"` like above (don’t export deep `./services/*`). That forces consumers to stick to your surface.

---

If you share your current `tsconfig.json` and the current `bin/chargen.js` (if it exists), I’ll show the exact minimal diffs so you don’t break local dev or the CLI shebang behavior.

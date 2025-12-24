#!/usr/bin/env node
/**
 * Batch-generate images for every character (default: Gemini, no archiving).
 *
 * - Concurrency: 5 (override with env CHAR_IMAGE_CONCURRENCY).
 * - Skips characters without imagery.yaml.
 * - Does NOT archive existing images (archiveExisting=false).
 * - Provider/model override via CLI: --provider=<google|openai> --model=<modelName>
 * - Size override via CLI: --size=<WxH> (e.g., 1800x2400 for gpt-image-1.5)
 *
 * Usage (from mythic-index/mcp-server):
 *   node scripts/generate-all-character-images.mjs
 *
 * Requirements:
 * - Google API key configured in ~/.mythicindex/config.json or env.
 * - `npm run build` has been executed so dist/ exists.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Disable file logging for this batch run to avoid permission issues in shared environments
if (process.env.LOG_FILE_ENABLED === undefined) {
  process.env.LOG_FILE_ENABLED = 'false';
}

import { initLogger } from '../dist/services/logger.js';
import { initConfig, getConfig } from '../dist/services/config.js';
import { initStorage } from '../dist/services/storage.js';
import { initImageService } from '../dist/services/images.js';
import { generateImagesForEntity } from '../dist/tools/images.js';

const ts = () => new Date().toISOString();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Repo layout: mythic-index/mcp-server (this script) and mythic-index/MemoryQuill/story-content at sibling level
const CHAR_DIR = path.resolve(__dirname, '..', '..', 'MemoryQuill', 'story-content', 'characters');
const MAX_CONCURRENCY = Number(process.env.CHAR_IMAGE_CONCURRENCY || 5);
const INCLUDE = process.env.CHAR_SLUGS
  ? new Set(process.env.CHAR_SLUGS.split(',').map(s => s.trim()).filter(Boolean))
  : null;
const PROVIDER = (() => {
  const arg = process.argv.find(a => a.startsWith('--provider='));
  const val = arg ? arg.split('=')[1] : '';
  return val === 'openai' ? 'openai' : 'google';
})();
const MODEL = (() => {
  const arg = process.argv.find(a => a.startsWith('--model='));
  return arg ? arg.split('=')[1] : undefined;
})();
const SIZE = (() => {
  const arg = process.argv.find(a => a.startsWith('--size='));
  return arg ? arg.split('=')[1] : undefined;
})();

async function discoverCharacterSlugs() {
  const entries = await fs.readdir(CHAR_DIR, { withFileTypes: true });
  const slugs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'character-template' || entry.name === 'drafts') continue;
    if (INCLUDE && !INCLUDE.has(entry.name)) continue;
    const imageryPath = path.join(CHAR_DIR, entry.name, 'imagery.yaml');
    try {
      await fs.access(imageryPath);
      slugs.push(entry.name);
    } catch {
      // skip characters without imagery.yaml
    }
  }
  return slugs.sort();
}

async function generateForSlug(slug) {
  const start = Date.now();
  console.log(`[${ts()}] [start] ${slug}`);
  try {
    const res = await generateImagesForEntity({
      entityType: 'character',
      slug,
      provider: PROVIDER,
      model: MODEL,
      size: SIZE,
      use_portrait_references: PROVIDER === 'google',
      preview: false,
      archiveExisting: false, // per request: do NOT archive
    });
    const generated =
      res.mode === 'generate' && Array.isArray(res.generatedImages)
        ? res.generatedImages.length
        : 0;
    const errors =
      res.mode === 'generate' && Array.isArray(res.errors) ? res.errors.filter(Boolean) : [];
    const durationMs = Date.now() - start;
    console.log(
      `[${ts()}] [done ] ${slug} generated=${generated}${errors.length ? ` errors=${errors.length}` : ''} duration=${durationMs}ms`
    );
    if (errors.length) {
      console.log(
        `[${ts()}] [errs ] ${slug} details: ${errors.join(' | ')}`
      );
    }
    return { slug, success: true, generated, errors, durationMs };
  } catch (err) {
    const durationMs = Date.now() - start;
    console.error(`[${ts()}] [fail ] ${slug}: ${err?.message || err} duration=${durationMs}ms`);
    return { slug, success: false, error: err?.message || String(err), durationMs };
  }
}

async function main() {
  const scriptStart = Date.now();
  await initLogger();
  await initConfig();
  const config = getConfig();
  await initStorage(config.paths.cacheDb);
  initImageService();

  const slugs = await discoverCharacterSlugs();
  if (slugs.length === 0) {
    console.log('No character imagery.yaml files found; nothing to do.');
    return;
  }

  console.log(
    `[${ts()}] Found ${slugs.length} character(s) to generate. Concurrency=${MAX_CONCURRENCY}. archiveExisting=false provider=${PROVIDER}${MODEL ? ` model=${MODEL}` : ''}${SIZE ? ` size=${SIZE}` : ''}`
  );

  const results = [];
  let active = 0;
  let index = 0;
  let completed = 0;

  await new Promise((resolve) => {
    const pump = () => {
      while (active < MAX_CONCURRENCY && index < slugs.length) {
        const slug = slugs[index++];
        active++;
        generateForSlug(slug)
          .then((res) => results.push(res))
          .finally(() => {
            active--;
            completed++;
            console.log(
              `[${ts()}] Progress: ${completed}/${slugs.length} active=${active} queued=${slugs.length - index}`
            );
            pump();
          });
      }
      if (active === 0 && index >= slugs.length) {
        resolve();
      }
    };
    pump();
  });

  const summary = results.reduce(
    (acc, r) => {
      if (r.success) {
        acc.success++;
        acc.generated += r.generated || 0;
        if (r.errors?.length) acc.partial++;
      } else {
        acc.failure++;
      }
      return acc;
    },
    { success: 0, failure: 0, partial: 0, generated: 0 }
  );

  const totalDuration = Date.now() - scriptStart;
  const avgMs =
    results.length > 0
      ? Math.round(results.reduce((acc, r) => acc + (r.durationMs || 0), 0) / results.length)
      : 0;

  console.log('--- Summary ---');
  console.log(
    `Success: ${summary.success} (partial with errors: ${summary.partial}), Failures: ${summary.failure}, Images generated: ${summary.generated}`
  );
  console.log(`Total duration: ${totalDuration}ms (~${(totalDuration / 1000).toFixed(1)}s), avg per character: ${avgMs}ms`);
  const failures = results.filter((r) => !r.success);
  if (failures.length) {
    console.log('Failures:', failures.map((f) => `${f.slug}: ${f.error}`).join('; '));
  }
}

main().catch((err) => {
  console.error('Fatal error', err);
  process.exit(1);
});

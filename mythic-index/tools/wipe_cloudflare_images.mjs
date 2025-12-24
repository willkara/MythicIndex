#!/usr/bin/env node
/**
 * wipe_cloudflare_images.mjs
 *
 * Deletes all images from a Cloudflare Images account.
 *
 * DANGER: This is destructive and irreversible!
 *
 * Required environment variables:
 *   CLOUDFLARE_ACCOUNT_ID  - Your Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN   - API token with Images:Edit permission
 *
 * Usage:
 *   # List how many images exist (safe, read-only)
 *   node tools/wipe_cloudflare_images.mjs --list-only
 *
 *   # Dry run - see what would be deleted
 *   node tools/wipe_cloudflare_images.mjs --dry-run --verbose
 *
 *   # Delete all images (DESTRUCTIVE)
 *   node tools/wipe_cloudflare_images.mjs --yes-really --verbose
 *
 *   # Delete only first 100 images
 *   node tools/wipe_cloudflare_images.mjs --yes-really --limit 100
 *
 * Options:
 *   --yes-really   Required to actually delete (safety flag)
 *   --list-only    Just count images, don't delete anything
 *   --dry-run      Simulate deletion without making changes
 *   --limit N      Only delete up to N images
 *   --verbose      Log each deletion
 */
import childProcess from 'node:child_process';

function parseArgs(argv) {
  const args = {
    yesReally: false,
    limit: 0,
    verbose: false,
    dryRun: false,
    listOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--yes-really') args.yesReally = true;
    else if (token === '--limit') args.limit = Number.parseInt(argv[++i] ?? '0', 10);
    else if (token === '--verbose') args.verbose = true;
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--list-only') args.listOnly = true;
    else throw new Error(`Unknown arg: ${token}`);
  }
  return args;
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(resp) {
  const v = resp.headers.get('retry-after');
  if (!v) return 0;
  const seconds = Number.parseInt(v, 10);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const dt = Date.parse(v);
  if (Number.isFinite(dt)) return Math.max(0, dt - Date.now());
  return 0;
}

async function cloudflareFetchWithRetry(url, init, { maxRetries = 10, baseDelayMs = 750, maxDelayMs = 20000 } = {}) {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const resp = await fetch(url, init);
    if (resp.ok) return resp;

    const retryable = resp.status === 429 || resp.status === 500 || resp.status === 502 || resp.status === 503 || resp.status === 504;
    if (!retryable || attempt > maxRetries + 1) return resp;

    const retryAfterMs = parseRetryAfterMs(resp);
    const backoff = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
    const jitter = Math.floor(Math.random() * 250);
    const waitMs = Math.max(retryAfterMs, backoff + jitter);
    console.warn(`${nowIso()} WARN Cloudflare ${resp.status} ${url} (attempt ${attempt}/${maxRetries + 1}); retrying in ${waitMs}ms`);
    await sleep(waitMs);
  }
}

async function readJsonBody(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function sh(cmd) {
  return childProcess.execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function listViaApi({ accountId, token, page, perPage }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1?page=${page}&per_page=${perPage}`;
  return cloudflareFetchWithRetry(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function deleteViaApi({ accountId, token, imageId }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(imageId)}`;
  return cloudflareFetchWithRetry(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const accountId = mustEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = mustEnv('CLOUDFLARE_API_TOKEN');

  if (!args.listOnly && !args.dryRun && !args.yesReally) {
    throw new Error('Refusing to delete Cloudflare Images without --yes-really');
  }

  // Best-effort auth sanity check if wrangler is available.
  try {
    sh('wrangler whoami');
  } catch {
    // ignore; API token may still be valid for Images
  }

  const perPage = 100;

  if (args.listOnly) {
    let page = 1;
    let total = 0;
    while (true) {
      const resp = await listViaApi({ accountId, token: apiToken, page, perPage });
      if (!resp.ok) {
        const body = await readJsonBody(resp);
        throw new Error(`List images failed ${resp.status}: ${JSON.stringify(body)}`);
      }
      const json = await resp.json();
      if (!json?.success) throw new Error(`List images error: ${JSON.stringify(json)}`);
      const images = json?.result?.images ?? [];
      const info = json?.result_info ?? {};
      if (!Array.isArray(images)) throw new Error(`Unexpected list result: ${JSON.stringify(json)}`);
      total += images.length;
      const totalPages = Number(info?.total_pages ?? 0);
      if (!totalPages || page >= totalPages) break;
      page += 1;
    }
    console.log(`${nowIso()} Images count=${total}`);
    return;
  }

  let deleted = 0;
  let rounds = 0;
  while (true) {
    rounds += 1;
    if (rounds > 1000) throw new Error('Aborting: too many rounds (possible API instability).');

    // Always list page=1 while deleting to avoid skipping due to pagination shifting.
    const resp = await listViaApi({ accountId, token: apiToken, page: 1, perPage });
    if (!resp.ok) {
      const body = await readJsonBody(resp);
      throw new Error(`List images failed ${resp.status}: ${JSON.stringify(body)}`);
    }
    const json = await resp.json();
    if (!json?.success) throw new Error(`List images error: ${JSON.stringify(json)}`);
    const images = json?.result?.images ?? [];
    if (!Array.isArray(images)) throw new Error(`Unexpected list result: ${JSON.stringify(json)}`);
    if (images.length === 0) break;

    for (const img of images) {
      const id = img?.id;
      if (!id) continue;
      if (args.limit && deleted >= args.limit) break;

      if (args.dryRun) {
        deleted += 1;
        if (args.verbose || deleted % 50 === 0) console.log(`${nowIso()} [dry-run] would delete ${deleted} images...`);
        continue;
      }

      const del = await deleteViaApi({ accountId, token: apiToken, imageId: id });
      if (!del.ok) {
        const body = await readJsonBody(del);
        throw new Error(`Delete failed ${del.status}: ${JSON.stringify(body)}`);
      }
      const delJson = await del.json();
      if (!delJson?.success) throw new Error(`Delete error: ${JSON.stringify(delJson)}`);

      deleted += 1;
      if (args.verbose || deleted % 50 === 0) console.log(`${nowIso()} Deleted ${deleted} images...`);
    }

    if (args.limit && deleted >= args.limit) break;
  }

  console.log(`${nowIso()} Done. Deleted=${deleted}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

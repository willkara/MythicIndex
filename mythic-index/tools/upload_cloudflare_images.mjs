#!/usr/bin/env node
/**
 * upload_cloudflare_images.mjs
 *
 * Uploads images from local storage to Cloudflare Images and generates
 * SQL to update the image_asset table with Cloudflare delivery URLs.
 *
 * Required environment variables:
 *   CLOUDFLARE_ACCOUNT_ID       - Your Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN        - API token with Images:Edit permission
 *   CLOUDFLARE_ACCOUNT_HASH     - Account hash for delivery URL (or CLOUDFLARE_DELIVERY_BASE_URL)
 *
 * Usage:
 *   cd mythic-index
 *
 *   # Dry run - see what would be uploaded
 *   node tools/upload_cloudflare_images.mjs --dry-run
 *
 *   # Upload all images
 *   node tools/upload_cloudflare_images.mjs \
 *     --sqlite ../ingestion/memoryquill.db \
 *     --out-sql frontend/import/cloudflare_images_updates.sql
 *
 *   # Upload only specific assets (from image_link SQL)
 *   node tools/upload_cloudflare_images.mjs \
 *     --only-assets-from-sql frontend/import/image_link_from_imagery.sql
 *
 *   # Limit to first 50 images
 *   node tools/upload_cloudflare_images.mjs --limit 50
 *
 * Options:
 *   --sqlite PATH           Source SQLite DB for image_asset records
 *   --out-sql PATH          Output SQL file with UPDATE statements
 *   --variants-ts PATH      TypeScript file containing variant definitions
 *   --only-assets-from-sql  Filter to only assets referenced in this SQL
 *   --limit N               Only upload first N images
 *   --dry-run               Simulate without uploading
 *   --id-strategy asset     Use asset UUID as Cloudflare image ID (allows resuming)
 *   --transaction           Wrap output SQL in BEGIN/COMMIT (not for D1)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import childProcess from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    sqlite: '../ingestion/memoryquill.db',
    outSql: 'frontend/import/cloudflare_images_updates.sql',
    variantsTs: 'frontend/src/app/core/models/cloudflare-variants.ts',
    onlyAssetsFromSql: '',
    limit: 0,
    dryRun: false,
    idStrategy: 'asset', // 'asset' | 'cloudflare'
    useTransaction: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--sqlite') args.sqlite = argv[++i];
    else if (token === '--out-sql') args.outSql = argv[++i];
    else if (token === '--variants-ts') args.variantsTs = argv[++i];
    else if (token === '--only-assets-from-sql') args.onlyAssetsFromSql = argv[++i];
    else if (token === '--limit') args.limit = Number.parseInt(argv[++i] ?? '0', 10);
    else if (token === '--dry-run') args.dryRun = true;
    else if (token === '--id-strategy') args.idStrategy = argv[++i];
    else if (token === '--transaction') args.useTransaction = true;
    else throw new Error(`Unknown arg: ${token}`);
  }
  return args;
}

function mustEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

function sh(cmd) {
  return childProcess.execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function normalizePath(p) {
  if (!p) return null;
  return p.replaceAll('\\', '/');
}

function nowIso() {
  return new Date().toISOString();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildFileIndex(rootDir, roots) {
  const index = new Map();
  const toScan = roots.map(r => path.resolve(rootDir, r)).filter(r => fs.existsSync(r));
  for (const root of toScan) {
    const stack = [root];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      const stat = fs.statSync(current);
      if (stat.isDirectory()) {
        for (const ent of fs.readdirSync(current)) {
          stack.push(path.join(current, ent));
        }
        continue;
      }
      const base = path.basename(current);
      const existing = index.get(base) ?? [];
      existing.push(current);
      index.set(base, existing);
    }
  }
  return index;
}

function extractVariantNamesFromTs(tsPath) {
  if (!fs.existsSync(tsPath)) {
    // Fallback: return common variants if file doesn't exist
    console.warn(`Variants TS not found at ${tsPath}, using defaults`);
    return ['public', 'thumbnail', 'medium', 'large'];
  }
  const text = fs.readFileSync(tsPath, 'utf-8');
  const start = text.indexOf('variants: [');
  if (start === -1) return ['public', 'thumbnail', 'medium', 'large'];
  const end = text.indexOf('],', start);
  if (end === -1) return ['public', 'thumbnail', 'medium', 'large'];
  const block = text.slice(start, end);
  const names = [];
  const re = /name:\s*'([^']+)'/g;
  let m;
  while ((m = re.exec(block))) names.push(m[1]);
  return [...new Set(names)];
}

function extractAssetIdsFromImageLinkSql(sqlPath) {
  const text = fs.readFileSync(sqlPath, 'utf-8');
  const ids = new Set();
  const re =
    /INSERT INTO image_link \(id, asset_id, content_id, scene_id, role, sort_order, caption, alt_text\) VALUES \('([^']+)', '([^']+)'/g;
  let m;
  while ((m = re.exec(text))) {
    ids.add(m[2]);
  }
  return ids;
}

function sqliteQueryRows(sqlitePath, query) {
  const cmd = `sqlite3 -json ${sqlString(sqlitePath)} ${sqlString(query)}`;
  const out = sh(cmd);
  const parsed = JSON.parse(out || '[]');
  if (!Array.isArray(parsed)) throw new Error('Unexpected sqlite3 -json output');
  return parsed;
}

async function readJsonBody(resp) {
  const text = await resp.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
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

async function cloudflareFetchWithRetry(url, init, { maxRetries = 8, baseDelayMs = 750, maxDelayMs = 20000 } = {}) {
  let attempt = 0;
  // attempts: 1..(maxRetries+1)
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

async function uploadToCloudflareImages({ accountId, token, filePath, requestedId }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;
  const form = new FormData();
  if (requestedId) form.set('id', requestedId);
  const buf = fs.readFileSync(filePath);
  form.set('file', new Blob([buf]), path.basename(filePath));

  const resp = await cloudflareFetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: form,
    },
    { maxRetries: 8 }
  );

  if (!resp.ok) {
    // Resume behavior: if we requested a custom id and it already exists, fetch it and continue.
    // This allows safe re-runs after partial uploads.
    if (resp.status === 409 && requestedId) {
      return await getCloudflareImageById({ accountId, token, imageId: requestedId });
    }

    const body = await readJsonBody(resp);
    throw new Error(`Upload failed ${resp.status}: ${JSON.stringify(body)}`);
  }
  const json = await resp.json();
  if (!json?.success) {
    throw new Error(`Upload error: ${JSON.stringify(json)}`);
  }
  return json.result;
}

async function getCloudflareImageById({ accountId, token, imageId }) {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${encodeURIComponent(imageId)}`;
  const resp = await cloudflareFetchWithRetry(
    url,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    { maxRetries: 8 }
  );
  if (!resp.ok) {
    const body = await readJsonBody(resp);
    throw new Error(`Get image failed ${resp.status}: ${JSON.stringify(body)}`);
  }
  const json = await resp.json();
  if (!json?.success) {
    throw new Error(`Get image error: ${JSON.stringify(json)}`);
  }
  return json.result;
}

function sha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function toCloudflareCustomId(assetId) {
  if (!assetId) return undefined;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // Cloudflare Images rejects UUID-shaped custom IDs; prefix to keep stable + valid.
  return uuidRe.test(assetId) ? `asset-${assetId}` : assetId;
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, '..');

  const accountId = mustEnv('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = mustEnv('CLOUDFLARE_API_TOKEN');
  const deliveryBaseUrl =
    process.env.CLOUDFLARE_DELIVERY_BASE_URL ||
    (process.env.CLOUDFLARE_ACCOUNT_HASH
      ? `https://imagedelivery.net/${process.env.CLOUDFLARE_ACCOUNT_HASH}`
      : null);
  if (!deliveryBaseUrl) throw new Error('Missing CLOUDFLARE_DELIVERY_BASE_URL (or CLOUDFLARE_ACCOUNT_HASH)');

  const variantsTsPath = path.resolve(repoRoot, args.variantsTs);
  const variantNames = extractVariantNamesFromTs(variantsTsPath);
  console.log(`Using variants: ${variantNames.join(', ')}`);

  const sqlitePath = path.resolve(repoRoot, args.sqlite);
  if (!fs.existsSync(sqlitePath)) throw new Error(`SQLite not found: ${sqlitePath}`);

  const assets = sqliteQueryRows(
    sqlitePath,
    "SELECT id, file_hash, source_path, storage_path, mime_type FROM image_asset ORDER BY created_at ASC"
  );

  let allowedAssetIds = null;
  if (args.onlyAssetsFromSql) {
    const sqlPath = path.resolve(repoRoot, args.onlyAssetsFromSql);
    if (!fs.existsSync(sqlPath)) throw new Error(`SQL file not found: ${sqlPath}`);
    allowedAssetIds = extractAssetIdsFromImageLinkSql(sqlPath);
    console.log(`Filtering to ${allowedAssetIds.size} assets from ${sqlPath}`);
  }

  const fileIndex = buildFileIndex(repoRoot, [
    'MemoryQuill/story-content',
    'MemoryQuill/images',
    'backend/storage/images',
    'backend/storage',
  ]);

  let processed = 0;
  let uploaded = 0;
  const outSqlPath = path.resolve(repoRoot, args.outSql);
  fs.mkdirSync(path.dirname(outSqlPath), { recursive: true });

  // Write updates incrementally so a mid-run failure still leaves usable progress.
  fs.writeFileSync(outSqlPath, args.useTransaction ? 'BEGIN;\n' : '', 'utf-8');

  for (const asset of assets) {
    if (allowedAssetIds && !allowedAssetIds.has(asset.id)) continue;
    if (args.limit && processed >= args.limit) break;
    processed += 1;

    const sourcePath = normalizePath(asset.source_path);
    const storagePath = normalizePath(asset.storage_path);

    const candidates = [];
    if (sourcePath) candidates.push(path.resolve(repoRoot, sourcePath));
    if (storagePath) candidates.push(path.resolve(repoRoot, storagePath));

    const baseName = path.basename(sourcePath || storagePath || '');
    const indexed = baseName ? fileIndex.get(baseName) : null;
    if (indexed?.length) candidates.push(...indexed);

    const filePath = candidates.find(p => fs.existsSync(p));
    if (!filePath) {
      console.warn(`Missing file for asset ${asset.id} (${baseName})`);
      continue;
    }

    const computedHash = sha256(filePath);
    if (asset.file_hash && computedHash !== asset.file_hash) {
      console.warn(`Hash mismatch for asset ${asset.id}: db=${asset.file_hash} fs=${computedHash} (${filePath})`);
    }

    if (args.dryRun) {
      console.log(`[dry-run] would upload ${filePath} as asset ${asset.id}`);
      continue;
    }

    const requestedId = args.idStrategy === 'asset' ? toCloudflareCustomId(asset.id) : undefined;
    const result = await uploadToCloudflareImages({
      accountId,
      token: apiToken,
      filePath,
      requestedId,
    });

    const cfId = result.id;
    const baseUrl = `${deliveryBaseUrl.replace(/\/+$/, '')}/${cfId}`;
    const variantsJson = JSON.stringify(variantNames);

    const update =
      `UPDATE image_asset SET ` +
      `cloudflare_image_id=${sqlString(cfId)}, ` +
      `cloudflare_base_url=${sqlString(baseUrl)}, ` +
      `cloudflare_variant_names=${sqlString(variantsJson)}, ` +
      `cloudflare_uploaded_at=CURRENT_TIMESTAMP ` +
      `WHERE id=${sqlString(asset.id)};`;
    fs.appendFileSync(outSqlPath, update + '\n', 'utf-8');

    uploaded += 1;
    if (uploaded % 25 === 0) console.log(`Uploaded ${uploaded} images...`);
  }

  if (args.useTransaction) fs.appendFileSync(outSqlPath, 'COMMIT;\n', 'utf-8');
  console.log(`Wrote D1 update SQL: ${outSqlPath}`);
  console.log(`Processed: ${processed}, uploaded: ${uploaded}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

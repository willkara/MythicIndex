/**
 * Cloudflare D1 REST API Service
 *
 * Connects to Cloudflare D1 database via REST API for CLI ingestion.
 * Provides functions for querying, executing statements, and managing tables.
 * Modeled after mcp-server/src/services/d1.ts
 */

import { config as loadEnv } from 'dotenv';

// Load environment variables
loadEnv();

/**
 * Configuration for Cloudflare D1 REST API connection
 */
export interface D1Config {
  accountId: string;
  databaseId: string;
  token: string;
}

/**
 * D1 query result from REST API
 */
interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: {
    served_by?: string;
    duration?: number;
    changes?: number;
    last_row_id?: number;
    changed_db?: boolean;
    size_after?: number;
    rows_read?: number;
    rows_written?: number;
  };
}

/**
 * Complete D1 API response structure
 */
interface D1Response<T = Record<string, unknown>> {
  result: D1QueryResult<T>[];
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}

let config: D1Config | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Initialize D1 configuration from environment variables
 *
 * Reads CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN
 * from environment unless a config object is provided.
 *
 * @param d1Config - Optional configuration object to use instead of environment
 * @throws Error if required environment variables are missing
 */
export function initD1(d1Config?: D1Config): void {
  if (d1Config) {
    config = d1Config;
    return;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !databaseId || !token) {
    throw new Error(
      'D1 requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_D1_DATABASE_ID, and CLOUDFLARE_API_TOKEN environment variables'
    );
  }

  config = { accountId, databaseId, token };
}

/**
 * Reset the D1 configuration
 */
export function resetD1(): void {
  config = null;
}

/**
 * Check if D1 is configured and available
 */
export function isD1Available(): boolean {
  if (config) return true;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const token = process.env.CLOUDFLARE_API_TOKEN;

  return !!(accountId && databaseId && token);
}

/**
 * Get missing environment variables
 */
export function getMissingEnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.CLOUDFLARE_ACCOUNT_ID) missing.push('CLOUDFLARE_ACCOUNT_ID');
  if (!process.env.CLOUDFLARE_D1_DATABASE_ID) missing.push('CLOUDFLARE_D1_DATABASE_ID');
  if (!process.env.CLOUDFLARE_API_TOKEN) missing.push('CLOUDFLARE_API_TOKEN');
  return missing;
}

/**
 * Get the current D1 configuration
 */
function getConfig(): D1Config {
  if (!config) {
    initD1();
  }
  if (!config) {
    throw new Error('D1 not configured');
  }
  return config;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Execute a SQL query against D1
 *
 * @param sql - SQL query string
 * @param params - Query parameters for parameterized queries
 * @returns Array of result rows
 * @throws Error if query fails or D1 returns an error
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const { accountId, databaseId, token } = getConfig();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`D1 query failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = (await response.json()) as D1Response<T>;

  if (!data.success) {
    throw new Error(`D1 query error: ${data.errors.map(e => e.message).join(', ')}`);
  }

  // Return results from first query (we're sending single queries)
  return data.result[0]?.results || [];
}

/**
 * Execute multiple SQL statements in a batch
 *
 * @param statements - Array of SQL statements with optional parameters
 * @returns Array of result arrays (one per statement)
 * @throws Error if batch execution fails
 */
export async function batch<T = Record<string, unknown>>(
  statements: Array<{ sql: string; params?: unknown[] }>
): Promise<T[][]> {
  const { accountId, databaseId, token } = getConfig();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  // D1 API expects sql array for batch
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      statements.map(s => ({
        sql: s.sql,
        params: s.params || [],
      }))
    ),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `D1 batch query failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as D1Response<T>;

  if (!data.success) {
    throw new Error(`D1 batch error: ${data.errors.map(e => e.message).join(', ')}`);
  }

  return data.result.map(r => r.results || []);
}

/**
 * Execute a single INSERT/UPDATE/DELETE statement
 *
 * @param sql - SQL statement
 * @param params - Statement parameters
 * @returns Object with changes count and last row ID
 * @throws Error if execution fails
 */
export async function execute(
  sql: string,
  params: unknown[] = []
): Promise<{
  changes: number;
  lastRowId: number | null;
}> {
  const { accountId, databaseId, token } = getConfig();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sql,
      params,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`D1 execute failed: ${response.status} ${response.statusText} - ${errorText}`);
  }

  const data = (await response.json()) as D1Response;

  if (!data.success) {
    throw new Error(`D1 execute error: ${data.errors.map(e => e.message).join(', ')}`);
  }

  const meta = data.result[0]?.meta;
  return {
    changes: meta?.changes || 0,
    lastRowId: meta?.last_row_id || null,
  };
}

// ============================================================================
// Test Connection
// ============================================================================

/**
 * Test the D1 connection
 *
 * Executes a simple SELECT 1 query to verify connectivity.
 *
 * @returns Object with success status and message
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const results = await query<{ test: number }>('SELECT 1 as test');
    if (results[0]?.test === 1) {
      return { success: true, message: 'Connected to Cloudflare D1' };
    }
    return { success: false, message: 'Unexpected response from D1' };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get table counts for verification
 *
 * Queries COUNT(*) for all ingestion-related tables.
 *
 * @returns Record mapping table names to row counts (-1 if table doesn't exist)
 */
export async function getTableCounts(): Promise<Record<string, number>> {
  const tables = [
    'character',
    'location',
    'content_item',
    'scene',
    'character_relationship',
    'scene_character',
    'scene_tag',
    'content_section',
    'content_block',
    'content_revision',
    'scene_segment',
  ];
  const counts: Record<string, number> = {};

  for (const table of tables) {
    try {
      const results = await query<{ count: number }>(`SELECT COUNT(*) as count FROM ${table}`);
      counts[table] = results[0]?.count || 0;
    } catch {
      // Table might not exist
      counts[table] = -1;
    }
  }

  return counts;
}

/**
 * Clear all ingested data from the database
 *
 * Deletes tables in foreign key order to avoid constraint violations.
 * Only deletes chapter-type content_items, preserving other content types.
 *
 * @returns Record mapping table names to number of deleted rows
 */
export async function clearAllTables(): Promise<Record<string, number>> {
  // Order matters! Delete child tables first (respecting foreign keys)
  const tablesToClear = [
    'scene_segment', // References scene and content_block
    'scene_character', // References scene and character
    'scene_tag', // References scene
    'content_block', // References content_section
    'content_section', // References content_revision
    'scene', // References content_item, location, character
    'content_revision', // References content_item
    'content_item', // Base content table (chapters only)
    'character_relationship', // References character
    'character', // Entity table
    'location', // Entity table
  ];

  const deletedCounts: Record<string, number> = {};

  for (const table of tablesToClear) {
    try {
      // For content_item, only delete chapters (not lore/worldbuilding)
      let sql: string;
      if (table === 'content_item') {
        sql = `DELETE FROM ${table} WHERE kind = 'chapter'`;
      } else {
        sql = `DELETE FROM ${table}`;
      }

      const result = await execute(sql);
      deletedCounts[table] = result.changes;
    } catch (_err) {
      // Table might not exist
      deletedCounts[table] = -1;
    }
  }

  return deletedCounts;
}

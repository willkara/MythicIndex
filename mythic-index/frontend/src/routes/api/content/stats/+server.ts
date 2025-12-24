import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { contentItem } from '$lib/server/db/schema';
import { VALID_KINDS } from '$lib/server/utils';
import type { RequestHandler } from './$types';

/**
 * GET /api/content/stats
 * Returns content statistics grouped by content kind
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with content counts by kind and total
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const db = getDb(platform.env.DB);

  try {
    // Get counts for all valid kinds
    const allItems = await db.select().from(contentItem);

    const byKind: Record<string, number> = {};
    for (const kind of VALID_KINDS) {
      byKind[kind] = 0;
    }

    for (const item of allItems) {
      if (byKind[item.kind] !== undefined) {
        byKind[item.kind]++;
      }
    }

    const total = Object.values(byKind).reduce((a, b) => a + b, 0);

    return json({
      by_kind: byKind,
      total,
    });
  } catch (e) {
    console.error('Failed to fetch content stats:', e);
    throw error(500, 'Failed to fetch content stats');
  }
};

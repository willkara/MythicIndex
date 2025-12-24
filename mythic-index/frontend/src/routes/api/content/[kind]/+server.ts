import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { listContentByKind } from '$lib/server/content';
import { isValidKind } from '$lib/server/utils';
import type { RequestHandler } from './$types';

/**
 * GET /api/content/[kind]
 * Lists content items of a specific kind with pagination
 * @param params - Route parameters containing content kind
 * @param url - URL with optional limit and offset query parameters
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with paginated content items
 * @throws 400 if kind is invalid
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ params, url, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const { kind } = params;

  if (!isValidKind(kind)) {
    throw error(400, `Invalid content kind: ${kind}`);
  }

  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');

  const limit = limitParam ? Math.min(Math.max(1, parseInt(limitParam, 10) || 50), 100) : 50;
  const offset = offsetParam ? Math.max(0, parseInt(offsetParam, 10) || 0) : 0;

  const db = getDb(platform.env.DB);

  try {
    const result = await listContentByKind(db, kind, limit, offset);

    return json({
      items: result.items,
      total_count: result.total,
      has_more: result.has_more,
      next_offset: result.has_more ? offset + result.items.length : undefined,
    });
  } catch (e) {
    console.error(`Failed to list ${kind} content:`, e);
    throw error(500, `Failed to list ${kind} content`);
  }
};

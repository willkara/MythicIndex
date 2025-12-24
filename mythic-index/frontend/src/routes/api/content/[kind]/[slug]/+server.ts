import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { loadFullContentItem } from '$lib/server/content';
import { isValidKind } from '$lib/server/utils';
import type { RequestHandler } from './$types';

/**
 * GET /api/content/[kind]/[slug]
 * Fetches a single content item by kind and slug
 * @param params - Route parameters containing kind and slug
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with full content item data
 * @throws 400 if kind is invalid
 * @throws 404 if content item not found
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const { kind, slug } = params;

  if (!isValidKind(kind)) {
    throw error(400, `Invalid content kind: ${kind}`);
  }

  const db = getDb(platform.env.DB);

  try {
    const item = await loadFullContentItem(db, kind, slug);

    if (!item) {
      throw error(404, `Content not found: ${kind}/${slug}`);
    }

    return json(item);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) {
      throw e; // Re-throw SvelteKit errors
    }
    console.error(`Failed to fetch ${kind}/${slug}:`, e);
    throw error(500, `Failed to fetch content`);
  }
};

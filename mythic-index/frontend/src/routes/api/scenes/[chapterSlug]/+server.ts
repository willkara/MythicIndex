import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getChapterScenes } from '$lib/server/scenes';
import type { RequestHandler } from './$types';

/**
 * GET /api/scenes/[chapterSlug]
 * Fetches all scenes for a specific chapter
 * @param params - Route parameters containing chapter slug
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with scene data
 * @throws 404 if chapter not found
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ params, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const { chapterSlug } = params;
  const db = getDb(platform.env.DB);

  try {
    const result = await getChapterScenes(db, chapterSlug);

    if (!result) {
      throw error(404, `Chapter not found: ${chapterSlug}`);
    }

    return json(result);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) {
      throw e;
    }
    console.error(`Failed to fetch scenes for ${chapterSlug}:`, e);
    throw error(500, 'Failed to fetch scenes');
  }
};

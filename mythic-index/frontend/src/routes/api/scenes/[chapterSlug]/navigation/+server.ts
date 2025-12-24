import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getSceneNavigation } from '$lib/server/scenes';
import type { RequestHandler } from './$types';

/**
 * GET /api/scenes/[chapterSlug]/navigation
 * Fetches navigation data for scenes (previous/next scene info)
 * @param params - Route parameters containing chapter slug
 * @param url - URL with current_scene_order query parameter
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with navigation data for surrounding scenes
 * @throws 404 if chapter not found
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ params, url, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const { chapterSlug } = params;
  const currentSceneOrderStr = url.searchParams.get('current_scene_order');
  const currentSceneOrder = currentSceneOrderStr ? parseInt(currentSceneOrderStr, 10) : 1;

  const db = getDb(platform.env.DB);

  try {
    const result = await getSceneNavigation(db, chapterSlug, currentSceneOrder);

    if (!result) {
      throw error(404, `Chapter not found: ${chapterSlug}`);
    }

    return json(result);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) {
      throw e;
    }
    console.error(`Failed to fetch scene navigation for ${chapterSlug}:`, e);
    throw error(500, 'Failed to fetch scene navigation');
  }
};

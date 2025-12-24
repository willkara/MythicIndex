import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getSceneAtPosition } from '$lib/server/scenes';
import type { RequestHandler } from './$types';

/**
 * GET /api/scenes/[chapterSlug]/at-position
 * Fetches the scene at a specific line number in a chapter
 * @param params - Route parameters containing chapter slug
 * @param url - URL with line_number query parameter
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with scene data at the specified position
 * @throws 404 if scene not found at given position
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ params, url, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const { chapterSlug } = params;
  const lineNumberParam = url.searchParams.get('line_number');
  const lineNumber = lineNumberParam ? Math.max(1, parseInt(lineNumberParam, 10) || 1) : 1;

  const db = getDb(platform.env.DB);

  try {
    const scene = await getSceneAtPosition(db, chapterSlug, lineNumber);

    if (!scene) {
      throw error(404, `Scene not found at line ${lineNumber} in chapter ${chapterSlug}`);
    }

    return json(scene);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) {
      throw e;
    }
    console.error(`Failed to fetch scene at position for ${chapterSlug}:`, e);
    throw error(500, 'Failed to fetch scene');
  }
};

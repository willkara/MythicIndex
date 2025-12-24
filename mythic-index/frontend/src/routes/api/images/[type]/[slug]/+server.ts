import { json, error } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { loadContentImagesBySlug } from '$lib/server/images';
import type { RequestHandler } from './$types';

/** Valid content types that can have images */
const VALID_IMAGE_TYPES = new Set(['chapter', 'character', 'location', 'lore', 'worldbuilding']);

/**
 * GET /api/images/[type]/[slug]
 * Fetches images associated with a content item
 * @param params - Route parameters containing content type and slug
 * @param url - URL with optional role query parameter to filter images
 * @param platform - SvelteKit platform with D1 database binding
 * @returns JSON response with image data
 * @throws 400 if content type is unsupported
 * @throws 404 if content not found
 * @throws 500 if database is not available or query fails
 */
export const GET: RequestHandler = async ({ params, url, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, 'Database not available');
  }

  const { type, slug } = params;

  if (!VALID_IMAGE_TYPES.has(type)) {
    throw error(400, `Unsupported content type: ${type}`);
  }

  const role = url.searchParams.get('role') ?? undefined;
  const db = getDb(platform.env.DB);

  try {
    const result = await loadContentImagesBySlug(db, type, slug, '', role);

    if (!result) {
      throw error(404, `Content not found: ${type}/${slug}`);
    }

    return json(result);
  } catch (e) {
    if (e && typeof e === 'object' && 'status' in e) {
      throw e; // Re-throw SvelteKit errors
    }
    console.error(`Failed to fetch images for ${type}/${slug}:`, e);
    throw error(500, 'Failed to fetch images');
  }
};

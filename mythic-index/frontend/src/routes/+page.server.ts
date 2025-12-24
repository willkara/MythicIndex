import { getDb } from '$lib/server/db';
import { contentItem, character, location } from '$lib/server/db/schema';
import { createRouteLogger } from '$lib/server/logging';
import { eq, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const log = createRouteLogger('/');

/**
 * Content statistics for dashboard
 */
interface ContentStats {
  /** Number of chapters */
  chapters: number;
  /** Number of characters */
  characters: number;
  /** Number of locations */
  locations: number;
  /** Number of lore entries */
  lore: number;
  /** Number of worldbuilding entries */
  worldbuilding: number;
  /** Total word count across all content */
  totalWords: number;
}

/**
 * Data returned to homepage
 */
interface HomePageData {
  /** Content statistics or null if unavailable */
  stats: ContentStats | null;
  /** Whether database connection is available */
  dbAvailable: boolean;
  /** Recent chapters for quick access */
  recentChapters: Array<{ slug: string; title: string }>;
}

/**
 * Server load function for homepage
 * Fetches content statistics and recent chapters from the database
 * @param platform - SvelteKit platform with D1 database binding
 * @returns Homepage data including stats and recent chapters
 */
export const load: PageServerLoad<HomePageData> = async ({ platform }) => {
  if (!platform?.env?.DB) {
    log.warn('Database not available - returning empty stats', {
      action: 'load',
      hint: 'Run with "npm run dev" (uses wrangler) to get D1 bindings',
    });
    return {
      stats: null,
      dbAvailable: false,
      recentChapters: [],
    };
  }

  const db = getDb(platform.env.DB);
  log.debug('Loading dashboard stats');

  try {
    // Get content counts by kind
    // Characters and locations are in dedicated tables, not content_item
    const [
      chapterCount,
      characterCount,
      locationCount,
      loreCount,
      worldbuildingCount,
      recentChapters,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(contentItem)
        .where(eq(contentItem.kind, 'chapter'))
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(character)
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(location)
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(contentItem)
        .where(eq(contentItem.kind, 'lore'))
        .get(),
      db
        .select({ count: sql<number>`count(*)` })
        .from(contentItem)
        .where(eq(contentItem.kind, 'worldbuilding'))
        .get(),
      db
        .select({ slug: contentItem.slug, title: contentItem.title })
        .from(contentItem)
        .where(eq(contentItem.kind, 'chapter'))
        .orderBy(sql`${contentItem.createdAt} DESC`)
        .limit(5),
    ]);

    // Get total word count (sum of all content)
    const wordCountResult = await db
      .select({ total: sql<number>`COALESCE(SUM(word_count), 0)` })
      .from(contentItem)
      .get();

    const stats: ContentStats = {
      chapters: chapterCount?.count ?? 0,
      characters: characterCount?.count ?? 0,
      locations: locationCount?.count ?? 0,
      lore: loreCount?.count ?? 0,
      worldbuilding: worldbuildingCount?.count ?? 0,
      totalWords: wordCountResult?.total ?? 0,
    };

    log.info('Dashboard stats loaded', { action: 'load', stats });

    return {
      stats,
      dbAvailable: true,
      recentChapters: recentChapters.map(c => ({ slug: c.slug, title: c.title })),
    };
  } catch (e) {
    log.error('Failed to load dashboard stats', e, { action: 'load' });
    return {
      stats: null,
      dbAvailable: true, // DB was available but query failed
      recentChapters: [],
    };
  }
};

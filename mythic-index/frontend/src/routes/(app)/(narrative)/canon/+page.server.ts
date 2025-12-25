import { getDb } from '$lib/server/db';
import { contentItem, imageLink, imageAsset, character, location } from '$lib/server/db/schema';
import { createRouteLogger } from '$lib/server/logging';
import { asc, desc, eq, sql, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const log = createRouteLogger('/canon');

type ContentItem = typeof contentItem.$inferSelect;
type Character = typeof character.$inferSelect;
type Location = typeof location.$inferSelect;

/**
 * Thumbnail image data
 */
interface Thumbnail {
  /** Image URL */
  src: string;
  /** Alt text for accessibility */
  alt: string;
}

/**
 * Content item with attached thumbnail
 */
interface ContentItemWithThumbnail extends ContentItem {
  /** Optional thumbnail image */
  thumbnail: Thumbnail | null;
}

/**
 * Unified type for display across different content kinds
 * Maps character/location fields to contentItem-like shape for consistent rendering
 */
interface CanonItem {
  /** Unique identifier */
  id: string;
  /** URL slug */
  slug: string;
  /** Display title */
  title: string;
  /** Content kind */
  kind: 'character' | 'location' | 'chapter' | 'lore' | 'worldbuilding';
  /** Brief summary */
  summary: string | null;
  /** Thumbnail image */
  thumbnail: Thumbnail | null;
  /** Word count */
  wordCount: number | null;
  /** Creation timestamp */
  createdAt: string;
  /** Last update timestamp */
  updatedAt: string;
}

/**
 * Data returned to canon browser page
 */
interface CanonPageData {
  /** All characters */
  characters: CanonItem[];
  /** All locations */
  locations: CanonItem[];
  /** All chapters */
  chapters: CanonItem[];
  /** All lore entries */
  lore: CanonItem[];
  /** All worldbuilding entries */
  worldbuilding: CanonItem[];
  /** Recently updated items */
  recentItems: CanonItem[];
  /** Whether database connection is available */
  dbAvailable: boolean;
}

/**
 * Server load function for canon browser page
 * Fetches all content grouped by kind with thumbnails
 * @param platform - SvelteKit platform with D1 database and Cloudflare bindings
 * @returns Canon page data with all content types
 */
export const load: PageServerLoad<CanonPageData> = async ({ platform }) => {
  // Handle missing DB gracefully - return empty data instead of 500
  if (!platform?.env?.DB) {
    log.warn('Database not available - returning empty content', {
      action: 'load',
      hint: 'Run with "npm run dev" (uses wrangler) to get D1 bindings',
    });
    return {
      characters: [],
      locations: [],
      chapters: [],
      lore: [],
      worldbuilding: [],
      recentItems: [],
      dbAvailable: false,
    };
  }

  const db = getDb(platform.env.DB);
  const accountHash = platform.env.CLOUDFLARE_ACCOUNT_HASH || '';
  const deliveryBaseUrl = `https://imagedelivery.net/${accountHash}`;

  log.debug('Loading canon content from D1');

  // Helper to attach thumbnails to content items
  async function attachThumbnails(items: ContentItem[]): Promise<ContentItemWithThumbnail[]> {
    if (items.length === 0) return [];

    const itemIds = items.map(item => item.id);

    // Fetch all images for all items, ordered by sortOrder to get first image as fallback
    const thumbnailRows = await db
      .select({
        contentId: imageLink.contentId,
        cloudflareId: imageAsset.cloudflareImageId,
        alt: imageLink.altText,
        role: imageLink.role,
        sortOrder: imageLink.sortOrder,
      })
      .from(imageLink)
      .innerJoin(imageAsset, eq(imageLink.assetId, imageAsset.id))
      .where(inArray(imageLink.contentId, itemIds))
      .orderBy(asc(imageLink.contentId), asc(imageLink.sortOrder));

    // Create map of content item ID to thumbnail
    // Priority: profile > hero > first available image
    const thumbnailMap = new Map<string, { thumbnail: Thumbnail; priority: number }>();
    for (const row of thumbnailRows) {
      if (!row.contentId || !row.cloudflareId) continue;

      // Assign priority: profile=0 (highest), hero=1, others=2
      const priority = row.role === 'profile' ? 0 : row.role === 'hero' ? 1 : 2;

      const existing = thumbnailMap.get(row.contentId);
      // Use this image if no existing, or if this one has higher priority (lower number)
      if (!existing || priority < existing.priority) {
        thumbnailMap.set(row.contentId, {
          thumbnail: {
            src: `${deliveryBaseUrl}/${row.cloudflareId}/thumbnail`,
            alt: row.alt || '',
          },
          priority,
        });
      }
    }

    return items.map(item => ({
      ...item,
      thumbnail: thumbnailMap.get(item.id)?.thumbnail || null,
    }));
  }

  // Helper to attach thumbnails to characters (uses portraitImageId directly)
  async function attachCharacterThumbnails(chars: Character[]): Promise<CanonItem[]> {
    if (chars.length === 0) return [];

    // Get portrait image IDs for characters that have one
    const portraitIds = chars.filter(c => c.portraitImageId).map(c => c.portraitImageId as string);

    // Fetch portrait images
    const portraits =
      portraitIds.length > 0
        ? await db
            .select({
              id: imageAsset.id,
              cloudflareId: imageAsset.cloudflareImageId,
            })
            .from(imageAsset)
            .where(inArray(imageAsset.id, portraitIds))
        : [];

    const portraitMap = new Map(portraits.map(p => [p.id, p.cloudflareId]));

    return chars.map(char => ({
      id: char.id,
      slug: char.slug,
      title: char.name,
      kind: 'character' as const,
      summary: char.background || char.visualSummary || null,
      thumbnail:
        char.portraitImageId && portraitMap.get(char.portraitImageId)
          ? {
              src: `${deliveryBaseUrl}/${portraitMap.get(char.portraitImageId)}/thumbnail`,
              alt: char.name,
            }
          : null,
      wordCount: null,
      createdAt: char.createdAt,
      updatedAt: char.updatedAt,
    }));
  }

  // Helper to attach thumbnails to locations (via imageLink with contentItemId)
  async function attachLocationThumbnails(locs: Location[]): Promise<CanonItem[]> {
    if (locs.length === 0) return [];

    // Get content item IDs for locations that have one
    const contentItemIds = locs.filter(l => l.contentItemId).map(l => l.contentItemId as string);

    // Fetch images via imageLink
    const locationImages =
      contentItemIds.length > 0
        ? await db
            .select({
              contentId: imageLink.contentId,
              cloudflareId: imageAsset.cloudflareImageId,
              role: imageLink.role,
              sortOrder: imageLink.sortOrder,
            })
            .from(imageLink)
            .innerJoin(imageAsset, eq(imageLink.assetId, imageAsset.id))
            .where(inArray(imageLink.contentId, contentItemIds))
            .orderBy(asc(imageLink.sortOrder))
        : [];

    // Build thumbnail map prioritizing hero > profile > first image
    const thumbnailMap = new Map<string, { cloudflareId: string; priority: number }>();
    for (const row of locationImages) {
      if (!row.contentId || !row.cloudflareId) continue;
      const priority = row.role === 'hero' ? 0 : row.role === 'profile' ? 1 : 2;
      const existing = thumbnailMap.get(row.contentId);
      if (!existing || priority < existing.priority) {
        thumbnailMap.set(row.contentId, { cloudflareId: row.cloudflareId, priority });
      }
    }

    return locs.map(loc => ({
      id: loc.id,
      slug: loc.slug,
      title: loc.name,
      kind: 'location' as const,
      summary: loc.quickDescription || loc.atmosphere || null,
      thumbnail:
        loc.contentItemId && thumbnailMap.get(loc.contentItemId)
          ? {
              src: `${deliveryBaseUrl}/${thumbnailMap.get(loc.contentItemId)!.cloudflareId}/thumbnail`,
              alt: loc.name,
            }
          : null,
      wordCount: null,
      createdAt: loc.createdAt,
      updatedAt: loc.updatedAt,
    }));
  }

  // Helper to convert ContentItemWithThumbnail to CanonItem
  function toCanonItem(item: ContentItemWithThumbnail): CanonItem {
    return {
      id: item.id,
      slug: item.slug,
      title: item.title,
      kind: item.kind as CanonItem['kind'],
      summary: item.summary,
      thumbnail: item.thumbnail,
      wordCount: item.wordCount,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  try {
    // Fetch all content types in parallel using new schema
    // Characters and locations from dedicated tables
    // Chapters, lore, worldbuilding from content_item
    // Sort chapters by chapter number from slug (ch01, ch02, etc.)
    const [charactersRaw, locationsRaw, chapters, lore, worldbuilding, recentItems] =
      await Promise.all([
        // Query dedicated character table
        db.select().from(character).orderBy(asc(character.name)),
        // Query dedicated location table
        db.select().from(location).orderBy(asc(location.name)),
        db
          .select()
          .from(contentItem)
          .where(eq(contentItem.kind, 'chapter'))
          .orderBy(
            asc(
              sql`CAST(SUBSTR(${contentItem.slug}, 3, CASE WHEN INSTR(SUBSTR(${contentItem.slug}, 3), '-') > 0 THEN INSTR(SUBSTR(${contentItem.slug}, 3), '-') - 1 ELSE LENGTH(${contentItem.slug}) END) AS REAL)`
            )
          ),
        db
          .select()
          .from(contentItem)
          .where(eq(contentItem.kind, 'lore'))
          .orderBy(asc(contentItem.title)),
        db
          .select()
          .from(contentItem)
          .where(eq(contentItem.kind, 'worldbuilding'))
          .orderBy(asc(contentItem.title)),
        // Recent items - top 5 most recently updated across all types
        db.select().from(contentItem).orderBy(desc(contentItem.updatedAt)).limit(5),
      ]);

    // Attach thumbnails to all content types in parallel
    const [
      charactersWithThumbs,
      locationsWithThumbs,
      chaptersWithThumbs,
      loreWithThumbs,
      worldbuildingWithThumbs,
      recentWithThumbs,
    ] = await Promise.all([
      attachCharacterThumbnails(charactersRaw),
      attachLocationThumbnails(locationsRaw),
      attachThumbnails(chapters),
      attachThumbnails(lore),
      attachThumbnails(worldbuilding),
      attachThumbnails(recentItems),
    ]);

    log.info('Canon content loaded successfully', {
      action: 'load',
      counts: {
        characters: charactersRaw.length,
        locations: locationsRaw.length,
        chapters: chapters.length,
        lore: lore.length,
        worldbuilding: worldbuilding.length,
        recentItems: recentItems.length,
      },
    });

    return {
      characters: charactersWithThumbs,
      locations: locationsWithThumbs,
      chapters: chaptersWithThumbs.map(toCanonItem),
      lore: loreWithThumbs.map(toCanonItem),
      worldbuilding: worldbuildingWithThumbs.map(toCanonItem),
      recentItems: recentWithThumbs.map(toCanonItem),
      dbAvailable: true,
    };
  } catch (e) {
    log.error('Failed to load canon content', e, { action: 'load' });
    // Return empty data instead of throwing 500
    return {
      characters: [],
      locations: [],
      chapters: [],
      lore: [],
      worldbuilding: [],
      recentItems: [],
      dbAvailable: true, // DB was available but query failed
    };
  }
};

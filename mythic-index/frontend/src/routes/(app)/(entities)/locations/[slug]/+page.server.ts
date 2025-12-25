import { getDb } from '$lib/server/db';
import {
  unifiedContent,
  contentItem,
  contentRevision,
  contentSection,
  contentBlock,
  imageAsset,
  imageLink,
  imageDerivative,
  location,
  locationZone,
} from '$lib/server/db/schema';
import { createRouteLogger } from '$lib/server/logging';
import { error } from '@sveltejs/kit';
import { eq, asc, lt, gt, and } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const log = createRouteLogger('/locations/[slug]');

/**
 * Helper function to safely parse JSON array fields from database
 * @param value - JSON string or null/undefined
 * @returns Parsed array or empty array if invalid
 */
function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Server load function for location detail page
 * Loads location profile with child/parent locations, content blocks, and images
 * Supports new dedicated location table, content_item schema, and legacy unified content
 * @param params - Route parameters containing location slug
 * @param platform - SvelteKit platform with D1 database binding
 * @returns Location data with profile, hierarchy, blocks, images, and navigation
 * @throws 404 if location not found
 * @throws 500 if database query fails
 * @throws 503 if database not available
 */
export const load: PageServerLoad = async ({ params, platform }) => {
  const { slug } = params;

  if (!platform?.env?.DB) {
    log.warn('Database not available', {
      action: 'load',
      slug,
      hint: 'Run with "npm run dev" (uses wrangler) to get D1 bindings',
    });
    throw error(503, 'Database not available. Run with wrangler to enable D1 bindings.');
  }

  const db = getDb(platform.env.DB);
  log.debug('Loading location', { action: 'load', slug });

  try {
    // First, try to load from new dedicated location table
    const locEntity = await db.select().from(location).where(eq(location.slug, slug)).get();

    if (locEntity) {
      // Load child locations
      const childLocations = await db
        .select({
          id: location.id,
          slug: location.slug,
          name: location.name,
          locationType: location.locationType,
        })
        .from(location)
        .where(eq(location.parentLocationId, locEntity.id));

      // Load parent location if exists
      let parentLocation: { slug: string; name: string } | null = null;
      if (locEntity.parentLocationId) {
        const parent = await db
          .select({ slug: location.slug, name: location.name })
          .from(location)
          .where(eq(location.id, locEntity.parentLocationId))
          .get();
        if (parent) {
          parentLocation = parent;
        }
      }

      // Load prose content blocks if contentItemId exists
      let blocks: { blockType: string; textPayload: string | null; richPayload: unknown }[] = [];
      let wordCount = 0;

      if (locEntity.contentItemId) {
        const contentItemRecord = await db
          .select()
          .from(contentItem)
          .where(eq(contentItem.id, locEntity.contentItemId))
          .get();

        if (contentItemRecord?.defaultRevisionId) {
          const revision = await db
            .select()
            .from(contentRevision)
            .where(eq(contentRevision.id, contentItemRecord.defaultRevisionId))
            .get();

          if (revision) {
            const sections = await db
              .select()
              .from(contentSection)
              .where(eq(contentSection.revisionId, revision.id))
              .orderBy(asc(contentSection.position));

            const sectionIds = sections.map(s => s.id);
            if (sectionIds.length > 0) {
              const allBlocks = await Promise.all(
                sectionIds.map(sectionId =>
                  db
                    .select()
                    .from(contentBlock)
                    .where(eq(contentBlock.sectionId, sectionId))
                    .orderBy(asc(contentBlock.position))
                )
              );
              const flatBlocks = allBlocks.flat();
              wordCount = flatBlocks.reduce((acc, b) => acc + (b.wordCount || 0), 0);
              blocks = flatBlocks.map(b => ({
                blockType: b.blockType,
                textPayload: b.textPayload,
                richPayload: b.richPayload ? JSON.parse(b.richPayload) : null,
              }));
            }
          }
        }
      }

      // Get prev/next locations (alphabetically by name from location table)
      const [prevLoc, nextLoc] = await Promise.all([
        db
          .select({ slug: location.slug, name: location.name })
          .from(location)
          .where(lt(location.name, locEntity.name))
          .orderBy(asc(location.name))
          .limit(1)
          .get(),
        db
          .select({ slug: location.slug, name: location.name })
          .from(location)
          .where(gt(location.name, locEntity.name))
          .orderBy(asc(location.name))
          .limit(1)
          .get(),
      ]);

      // Load images (use contentItemId if available)
      let images: {
        src: string;
        alt: string;
        role: string;
        caption: string | null;
        lqip: string | null;
      }[] = [];
      if (locEntity.contentItemId) {
        const rawImages = await db
          .select({
            assetId: imageAsset.id,
            cloudflareId: imageAsset.cloudflareImageId,
            baseUrl: imageAsset.cloudflareBaseUrl,
            variants: imageAsset.cloudflareVariantNames,
            role: imageLink.role,
            altText: imageLink.altText,
            caption: imageLink.caption,
            sortOrder: imageLink.sortOrder,
            lqip: imageDerivative.lqip,
          })
          .from(imageLink)
          .innerJoin(imageAsset, eq(imageLink.assetId, imageAsset.id))
          .leftJoin(imageDerivative, eq(imageDerivative.assetId, imageAsset.id))
          .where(eq(imageLink.contentId, locEntity.contentItemId))
          .orderBy(asc(imageLink.sortOrder));

        // Deduplicate
        const imageMap = new Map<string, (typeof rawImages)[0]>();
        for (const img of rawImages) {
          const existing = imageMap.get(img.assetId);
          if (!existing) {
            imageMap.set(img.assetId, img);
          } else if (img.lqip && !existing.lqip) {
            imageMap.set(img.assetId, { ...existing, lqip: img.lqip });
          }
        }
        images = Array.from(imageMap.values()).map(img => ({
          src: img.baseUrl ? `${img.baseUrl}/public` : '',
          alt: img.altText || locEntity.name,
          role: img.role,
          caption: img.caption,
          lqip: img.lqip,
        }));
      }

      // Load zones for this location
      const zones = await db
        .select({
          id: locationZone.id,
          slug: locationZone.slug,
          name: locationZone.name,
          zoneType: locationZone.zoneType,
          locationWithin: locationZone.locationWithin,
          parentZoneId: locationZone.parentZoneId,
          physicalDescription: locationZone.physicalDescription,
          narrativeFunction: locationZone.narrativeFunction,
          emotionalRegister: locationZone.emotionalRegister,
          signatureDetails: locationZone.signatureDetails,
          moodAffinity: locationZone.moodAffinity,
          characterAssociations: locationZone.characterAssociations,
          lightConditions: locationZone.lightConditions,
          firstAppearance: locationZone.firstAppearance,
          storySignificance: locationZone.storySignificance,
        })
        .from(locationZone)
        .where(eq(locationZone.locationId, locEntity.id))
        .orderBy(asc(locationZone.slug));

      // Build location entity data with typed fields
      const locationData = {
        id: locEntity.id,
        slug: locEntity.slug,
        name: locEntity.name,
        locationType: locEntity.locationType,
        region: locEntity.region,
        quickDescription: locEntity.quickDescription,
        visualSummary: locEntity.visualSummary,
        atmosphere: locEntity.atmosphere,
        history: locEntity.history,
        notableLandmarks: parseJsonArray(locEntity.notableLandmarks),
        keyPersonnel: parseJsonArray(locEntity.keyPersonnel),
        // Extended fields
        storyRole: locEntity.storyRole,
        hazardsDangers: parseJsonArray(locEntity.hazardsDangers),
        connections: parseJsonArray(locEntity.connections),
        accessibility: locEntity.accessibility,
        significanceLevel: locEntity.significanceLevel,
        firstAppearance: locEntity.firstAppearance,
        parentLocation,
        childLocations: childLocations.map(c => ({
          slug: c.slug,
          name: c.name,
          locationType: c.locationType,
        })),
      };

      return {
        mode: 'entity' as const,
        contentType: 'location' as const,
        item: {
          id: locEntity.id,
          title: locEntity.name,
          slug: locEntity.slug,
          type: 'location',
          summary: locEntity.quickDescription || locEntity.visualSummary,
          updatedAt: locEntity.updatedAt,
          wordCount,
          createdAt: locEntity.createdAt,
          markdownContent: null,
        },
        location: locationData,
        blocks,
        images,
        zones: zones.map(z => ({
          id: z.id,
          slug: z.slug,
          name: z.name,
          zoneType: z.zoneType,
          locationWithin: z.locationWithin,
          parentZoneId: z.parentZoneId,
          physicalDescription: z.physicalDescription,
          narrativeFunction: z.narrativeFunction,
          emotionalRegister: z.emotionalRegister,
          signatureDetails: parseJsonArray(z.signatureDetails),
          moodAffinity: parseJsonArray(z.moodAffinity),
          characterAssociations: parseJsonArray(z.characterAssociations),
          lightConditions: z.lightConditions,
          firstAppearance: z.firstAppearance,
          storySignificance: z.storySignificance,
        })),
        navigation: {
          prev: prevLoc ? { slug: prevLoc.slug, title: prevLoc.name } : null,
          next: nextLoc ? { slug: nextLoc.slug, title: nextLoc.name } : null,
        },
      };
    }

    // Fallback: Load from contentItem (old schema)
    const item = await db
      .select()
      .from(contentItem)
      .where(and(eq(contentItem.slug, slug), eq(contentItem.kind, 'location')))
      .get();

    if (item && item.defaultRevisionId) {
      // Get the default revision
      const revision = await db
        .select()
        .from(contentRevision)
        .where(eq(contentRevision.id, item.defaultRevisionId))
        .get();

      if (revision) {
        // Get sections ordered by position
        const sections = await db
          .select()
          .from(contentSection)
          .where(eq(contentSection.revisionId, revision.id))
          .orderBy(asc(contentSection.position));

        // Get all blocks for all sections
        const sectionIds = sections.map(s => s.id);
        let blocks: (typeof contentBlock.$inferSelect)[] = [];
        if (sectionIds.length > 0) {
          const allBlocks = await Promise.all(
            sectionIds.map(sectionId =>
              db
                .select()
                .from(contentBlock)
                .where(eq(contentBlock.sectionId, sectionId))
                .orderBy(asc(contentBlock.position))
            )
          );
          blocks = allBlocks.flat();
        }

        const wordCount = blocks.reduce((acc: number, b) => acc + (b.wordCount || 0), 0);

        // Get prev/next locations (alphabetically by title)
        const [prevItem, nextItem] = await Promise.all([
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(and(eq(contentItem.kind, 'location'), lt(contentItem.title, item.title)))
            .orderBy(asc(contentItem.title))
            .limit(1)
            .get(),
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(and(eq(contentItem.kind, 'location'), gt(contentItem.title, item.title)))
            .orderBy(asc(contentItem.title))
            .limit(1)
            .get(),
        ]);

        // Load images for this location (with LQIP from derivatives)
        const rawImages = await db
          .select({
            assetId: imageAsset.id,
            cloudflareId: imageAsset.cloudflareImageId,
            baseUrl: imageAsset.cloudflareBaseUrl,
            variants: imageAsset.cloudflareVariantNames,
            role: imageLink.role,
            altText: imageLink.altText,
            caption: imageLink.caption,
            sortOrder: imageLink.sortOrder,
            lqip: imageDerivative.lqip,
          })
          .from(imageLink)
          .innerJoin(imageAsset, eq(imageLink.assetId, imageAsset.id))
          .leftJoin(imageDerivative, eq(imageDerivative.assetId, imageAsset.id))
          .where(eq(imageLink.contentId, item.id))
          .orderBy(asc(imageLink.sortOrder));

        // Deduplicate (multiple derivatives per asset may cause duplicates)
        const imageMap = new Map<string, (typeof rawImages)[0]>();
        for (const img of rawImages) {
          const existing = imageMap.get(img.assetId);
          if (!existing) {
            imageMap.set(img.assetId, img);
          } else if (img.lqip && !existing.lqip) {
            imageMap.set(img.assetId, { ...existing, lqip: img.lqip });
          }
        }
        const images = Array.from(imageMap.values());

        // Parse metadata JSON
        let metadata: Record<string, unknown> = {};
        try {
          if (item.metadataJson) {
            metadata = JSON.parse(item.metadataJson);
          }
        } catch {
          // Invalid JSON, use empty object
        }

        return {
          mode: 'blocks' as const,
          contentType: 'location' as const,
          item: {
            id: item.id,
            title: item.title,
            slug: item.slug,
            type: item.kind,
            summary: item.summary,
            updatedAt: item.updatedAt,
            wordCount,
            createdAt: item.createdAt,
            markdownContent: null,
          },
          metadata,
          blocks: blocks.map(b => ({
            blockType: b.blockType,
            textPayload: b.textPayload,
            richPayload: b.richPayload ? JSON.parse(b.richPayload) : null,
          })),
          images: images.map(img => ({
            src: img.baseUrl ? `${img.baseUrl}/public` : '',
            alt: img.altText || item.title,
            role: img.role,
            caption: img.caption,
            lqip: img.lqip,
          })),
          zones: [], // No zones available in fallback content_item path
          navigation: {
            prev: prevItem ? { slug: prevItem.slug, title: prevItem.title } : null,
            next: nextItem ? { slug: nextItem.slug, title: nextItem.title } : null,
          },
        };
      }
    }

    // Fallback to Legacy Table for locations
    const legacyItem = await db
      .select()
      .from(unifiedContent)
      .where(and(eq(unifiedContent.slug, slug), eq(unifiedContent.type, 'location')))
      .get();

    if (!legacyItem) {
      throw error(404, 'Location not found');
    }

    // Get prev/next for legacy items
    const [prevLegacy, nextLegacy] = await Promise.all([
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(and(eq(unifiedContent.type, 'location'), lt(unifiedContent.title, legacyItem.title)))
        .orderBy(asc(unifiedContent.title))
        .limit(1)
        .get(),
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(and(eq(unifiedContent.type, 'location'), gt(unifiedContent.title, legacyItem.title)))
        .orderBy(asc(unifiedContent.title))
        .limit(1)
        .get(),
    ]);

    return {
      mode: 'legacy' as const,
      contentType: 'location' as const,
      item: {
        id: legacyItem.id,
        title: legacyItem.title,
        slug: legacyItem.slug,
        type: legacyItem.type,
        summary: legacyItem.summary,
        updatedAt: legacyItem.updatedAt,
        createdAt: legacyItem.createdAt,
        wordCount: legacyItem.wordCount,
        markdownContent: legacyItem.markdownContent,
      },
      metadata: {},
      blocks: [],
      images: [],
      zones: [], // No zones available in legacy unified_content path
      navigation: {
        prev: prevLegacy ? { slug: prevLegacy.slug, title: prevLegacy.title } : null,
        next: nextLegacy ? { slug: nextLegacy.slug, title: nextLegacy.title } : null,
      },
    };
  } catch (e) {
    if ((e as any).status) throw e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error('Failed to load location', e, { action: 'load', slug, errorMessage });
    throw error(500, `Failed to load location: ${errorMessage}`);
  }
};

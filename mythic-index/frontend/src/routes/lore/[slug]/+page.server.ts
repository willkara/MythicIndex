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
} from '$lib/server/db/schema';
import { createRouteLogger } from '$lib/server/logging';
import { error } from '@sveltejs/kit';
import { eq, asc, lt, gt, and } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const log = createRouteLogger('/lore/[slug]');

/**
 * Server load function for lore entry detail page
 * Loads lore content with blocks, images, and navigation
 * Supports both new relational schema and legacy unified content table
 * @param params - Route parameters containing lore slug
 * @param platform - SvelteKit platform with D1 database binding
 * @returns Lore data with content blocks, images, and prev/next navigation
 * @throws 404 if lore entry not found
 * @throws 500 if database query fails
 * @throws 503 if database not available
 */
export const load: PageServerLoad = async ({ params, platform }) => {
  const { slug } = params;

  if (!platform?.env?.DB) {
    log.warn('Database not available', { action: 'load', slug });
    throw error(503, 'Database not available. Run with wrangler to enable D1 bindings.');
  }

  const db = getDb(platform.env.DB);
  log.debug('Loading lore entry', { action: 'load', slug });

  try {
    const item = await db
      .select()
      .from(contentItem)
      .where(and(eq(contentItem.slug, slug), eq(contentItem.kind, 'lore')))
      .get();

    if (item && item.defaultRevisionId) {
      const revision = await db
        .select()
        .from(contentRevision)
        .where(eq(contentRevision.id, item.defaultRevisionId))
        .get();

      if (revision) {
        const sections = await db
          .select()
          .from(contentSection)
          .where(eq(contentSection.revisionId, revision.id))
          .orderBy(asc(contentSection.position));

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

        const [prevItem, nextItem] = await Promise.all([
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(and(eq(contentItem.kind, 'lore'), lt(contentItem.title, item.title)))
            .orderBy(asc(contentItem.title))
            .limit(1)
            .get(),
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(and(eq(contentItem.kind, 'lore'), gt(contentItem.title, item.title)))
            .orderBy(asc(contentItem.title))
            .limit(1)
            .get(),
        ]);

        // Load images with LQIP from derivatives
        const rawImages = await db
          .select({
            assetId: imageAsset.id,
            baseUrl: imageAsset.cloudflareBaseUrl,
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

        return {
          mode: 'blocks' as const,
          contentType: 'lore' as const,
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
          navigation: {
            prev: prevItem ? { slug: prevItem.slug, title: prevItem.title } : null,
            next: nextItem ? { slug: nextItem.slug, title: nextItem.title } : null,
          },
        };
      }
    }

    // Fallback to Legacy Table
    const legacyItem = await db
      .select()
      .from(unifiedContent)
      .where(and(eq(unifiedContent.slug, slug), eq(unifiedContent.type, 'lore')))
      .get();

    if (!legacyItem) {
      throw error(404, 'Lore entry not found');
    }

    const [prevLegacy, nextLegacy] = await Promise.all([
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(and(eq(unifiedContent.type, 'lore'), lt(unifiedContent.title, legacyItem.title)))
        .orderBy(asc(unifiedContent.title))
        .limit(1)
        .get(),
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(and(eq(unifiedContent.type, 'lore'), gt(unifiedContent.title, legacyItem.title)))
        .orderBy(asc(unifiedContent.title))
        .limit(1)
        .get(),
    ]);

    return {
      mode: 'legacy' as const,
      contentType: 'lore' as const,
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
      blocks: [],
      images: [],
      navigation: {
        prev: prevLegacy ? { slug: prevLegacy.slug, title: prevLegacy.title } : null,
        next: nextLegacy ? { slug: nextLegacy.slug, title: nextLegacy.title } : null,
      },
    };
  } catch (e) {
    if ((e as any).status) throw e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error('Failed to load lore entry', e, { action: 'load', slug, errorMessage });
    throw error(500, `Failed to load lore entry: ${errorMessage}`);
  }
};

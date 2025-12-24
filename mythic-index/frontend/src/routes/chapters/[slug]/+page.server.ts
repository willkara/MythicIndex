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
  sceneSegment,
} from '$lib/server/db/schema';
import { createRouteLogger } from '$lib/server/logging';
import { error } from '@sveltejs/kit';
import { eq, asc, desc, and, inArray, sql } from 'drizzle-orm';
import { buildEnrichedSceneResponses, getEnrichedChapterScenes } from '$lib/server/scenes';
import type { PageServerLoad } from './$types';

const log = createRouteLogger('/chapters/[slug]');

/**
 * Server load function for chapter detail page
 * Loads chapter content with blocks, scenes, images, and navigation
 * Supports both new relational schema and legacy unified content table
 * @param params - Route parameters containing chapter slug
 * @param platform - SvelteKit platform with D1 database binding
 * @returns Chapter data with content blocks, scenes, images, and prev/next navigation
 * @throws 404 if chapter not found
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
  log.debug('Loading chapter', { action: 'load', slug });

  try {
    // Load from Relational Schema - chapters only
    const item = await db
      .select()
      .from(contentItem)
      .where(and(eq(contentItem.slug, slug), eq(contentItem.kind, 'chapter')))
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

        // Load scene-to-block mappings from sceneSegment junction table
        // D1 has a limit of ~100 params for IN clause, so batch the query
        const blockIds = blocks.map(b => b.id);
        let blockToScene = new Map<string, string>();
        if (blockIds.length > 0) {
          const BATCH_SIZE = 99;
          const batches: string[][] = [];
          for (let i = 0; i < blockIds.length; i += BATCH_SIZE) {
            batches.push(blockIds.slice(i, i + BATCH_SIZE));
          }
          const allMappings = await Promise.all(
            batches.map(batch =>
              db
                .select({
                  blockId: sceneSegment.blockId,
                  sceneId: sceneSegment.sceneId,
                })
                .from(sceneSegment)
                .where(inArray(sceneSegment.blockId, batch))
            )
          );
          const sceneMappings = allMappings.flat();
          blockToScene = new Map(sceneMappings.map(m => [m.blockId, m.sceneId]));
        }

        const wordCount = blocks.reduce((acc: number, b) => acc + (b.wordCount || 0), 0);

        // Get prev/next chapters by chapter number (extracted from slug like "ch01-title")
        const currentChapterNum = parseInt(item.slug.match(/ch(\d+)/)?.[1] || '0', 10);
        const chapterNumExpr = sql`CAST(SUBSTR(${contentItem.slug}, 3, INSTR(SUBSTR(${contentItem.slug}, 3), '-') - 1) AS INTEGER)`;

        const [prevItem, nextItem] = await Promise.all([
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(
              and(eq(contentItem.kind, 'chapter'), sql`${chapterNumExpr} < ${currentChapterNum}`)
            )
            .orderBy(desc(chapterNumExpr))
            .limit(1)
            .get(),
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(
              and(eq(contentItem.kind, 'chapter'), sql`${chapterNumExpr} > ${currentChapterNum}`)
            )
            .orderBy(asc(chapterNumExpr))
            .limit(1)
            .get(),
        ]);

        // Load enriched scenes for chapter (includes characters, tags, location, POV)
        let scenes: ReturnType<typeof buildEnrichedSceneResponses> = [];
        try {
          const chapterScenes = await getEnrichedChapterScenes(db, item.slug);
          scenes = buildEnrichedSceneResponses(chapterScenes);
        } catch (sceneError) {
          log.warn('Failed to load scenes, continuing without them', {
            slug: item.slug,
            error: sceneError,
          });
        }

        // Load images for this chapter (with LQIP from derivatives)
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
            sceneId: imageLink.sceneId,
            displayStyle: imageLink.displayStyle,
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
          contentType: 'chapter' as const,
          item: {
            id: item.id,
            title: item.title,
            slug: item.slug,
            type: item.kind,
            updatedAt: item.updatedAt,
            wordCount,
            createdAt: item.createdAt,
            markdownContent: null,
          },
          blocks: blocks.map(b => {
            const sceneId = blockToScene.get(b.id);
            const parsed = b.richPayload ? JSON.parse(b.richPayload) : null;
            const richPayload = parsed && typeof parsed === 'object' ? parsed : {};

            // Inject sceneId if this block is linked to a scene
            if (sceneId) {
              richPayload.sceneId = sceneId;
            }

            return {
              blockType: b.blockType,
              textPayload: b.textPayload,
              richPayload: Object.keys(richPayload).length > 0 ? richPayload : null,
            };
          }),
          scenes,
          images: images.map(img => ({
            src: img.baseUrl ? `${img.baseUrl}/public` : '',
            alt: img.altText || '',
            role: img.role,
            caption: img.caption,
            sceneId: img.sceneId,
            displayStyle: img.displayStyle || 'float',
            lqip: img.lqip,
          })),
          navigation: {
            prev: prevItem ? { slug: prevItem.slug, title: prevItem.title } : null,
            next: nextItem ? { slug: nextItem.slug, title: nextItem.title } : null,
          },
        };
      }
    }

    // Fallback to Legacy Table for chapters
    const legacyItem = await db
      .select()
      .from(unifiedContent)
      .where(and(eq(unifiedContent.slug, slug), eq(unifiedContent.type, 'chapter')))
      .get();

    if (!legacyItem) {
      throw error(404, 'Chapter not found');
    }

    // Get prev/next for legacy items by chapter number
    const legacyChapterNum = parseInt(legacyItem.slug.match(/ch(\d+)/)?.[1] || '0', 10);
    const legacyChapterNumExpr = sql`CAST(SUBSTR(${unifiedContent.slug}, 3, INSTR(SUBSTR(${unifiedContent.slug}, 3), '-') - 1) AS INTEGER)`;

    const [prevLegacy, nextLegacy] = await Promise.all([
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(
          and(
            eq(unifiedContent.type, 'chapter'),
            sql`${legacyChapterNumExpr} < ${legacyChapterNum}`
          )
        )
        .orderBy(desc(legacyChapterNumExpr))
        .limit(1)
        .get(),
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(
          and(
            eq(unifiedContent.type, 'chapter'),
            sql`${legacyChapterNumExpr} > ${legacyChapterNum}`
          )
        )
        .orderBy(asc(legacyChapterNumExpr))
        .limit(1)
        .get(),
    ]);

    return {
      mode: 'legacy' as const,
      contentType: 'chapter' as const,
      item: {
        id: legacyItem.id,
        title: legacyItem.title,
        slug: legacyItem.slug,
        type: legacyItem.type,
        updatedAt: legacyItem.updatedAt,
        createdAt: legacyItem.createdAt,
        wordCount: legacyItem.wordCount,
        markdownContent: legacyItem.markdownContent,
      },
      blocks: [],
      scenes: [],
      images: [],
      navigation: {
        prev: prevLegacy ? { slug: prevLegacy.slug, title: prevLegacy.title } : null,
        next: nextLegacy ? { slug: nextLegacy.slug, title: nextLegacy.title } : null,
      },
    };
  } catch (e) {
    if ((e as any).status) throw e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error('Failed to load chapter', e, { action: 'load', slug, errorMessage });
    throw error(500, `Failed to load chapter: ${errorMessage}`);
  }
};

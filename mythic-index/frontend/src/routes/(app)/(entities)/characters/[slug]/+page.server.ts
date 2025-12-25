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
  character,
  characterRelationship,
} from '$lib/server/db/schema';
import { createRouteLogger } from '$lib/server/logging';
import { error } from '@sveltejs/kit';
import { eq, asc, lt, gt, and } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const log = createRouteLogger('/characters/[slug]');

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
 * Server load function for character detail page
 * Loads character profile with relationships, content blocks, and images
 * Supports new dedicated character table, content_item schema, and legacy unified content
 * @param params - Route parameters containing character slug
 * @param platform - SvelteKit platform with D1 database binding
 * @returns Character data with profile, relationships, blocks, images, and navigation
 * @throws 404 if character not found
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
  log.debug('Loading character', { action: 'load', slug });

  try {
    // First, try to load from new dedicated character table
    const charEntity = await db.select().from(character).where(eq(character.slug, slug)).get();

    if (charEntity) {
      // Load relationships (outgoing)
      const rawRelationships = await db
        .select({
          id: characterRelationship.id,
          targetId: characterRelationship.targetCharacterId,
          type: characterRelationship.relationshipType,
          description: characterRelationship.description,
          strength: characterRelationship.strength,
          targetSlug: character.slug,
          targetName: character.name,
        })
        .from(characterRelationship)
        .innerJoin(character, eq(characterRelationship.targetCharacterId, character.id))
        .where(eq(characterRelationship.sourceCharacterId, charEntity.id));

      const relationships = rawRelationships.map(r => ({
        targetSlug: r.targetSlug,
        targetName: r.targetName,
        type: r.type,
        description: r.description,
        strength: r.strength,
      }));

      // Load prose content blocks if contentItemId exists
      let blocks: { blockType: string; textPayload: string | null; richPayload: unknown }[] = [];
      let wordCount = 0;
      let contentItemRecord: typeof contentItem.$inferSelect | null = null;

      if (charEntity.contentItemId) {
        contentItemRecord =
          (await db
            .select()
            .from(contentItem)
            .where(eq(contentItem.id, charEntity.contentItemId))
            .get()) ?? null;

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

      // Get prev/next characters (alphabetically by name from character table)
      const [prevChar, nextChar] = await Promise.all([
        db
          .select({ slug: character.slug, name: character.name })
          .from(character)
          .where(lt(character.name, charEntity.name))
          .orderBy(asc(character.name))
          .limit(1)
          .get(),
        db
          .select({ slug: character.slug, name: character.name })
          .from(character)
          .where(gt(character.name, charEntity.name))
          .orderBy(asc(character.name))
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
      const _imageContentId = charEntity.contentItemId || charEntity.id;
      if (charEntity.contentItemId) {
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
          .where(eq(imageLink.contentId, charEntity.contentItemId))
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
          alt: img.altText || charEntity.name,
          role: img.role,
          caption: img.caption,
          lqip: img.lqip,
        }));
      }

      // Build character entity data with typed fields
      const characterData = {
        id: charEntity.id,
        slug: charEntity.slug,
        name: charEntity.name,
        aliases: parseJsonArray(charEntity.aliases),
        race: charEntity.race,
        characterClass: charEntity.characterClass,
        role: charEntity.role,
        status: charEntity.status,
        firstAppearance: charEntity.firstAppearance,
        // Appearance
        appearance: {
          age: charEntity.appearanceAge,
          height: charEntity.appearanceHeight,
          build: charEntity.appearanceBuild,
          hair: charEntity.appearanceHair,
          eyes: charEntity.appearanceEyes,
          distinguishingFeatures: parseJsonArray(charEntity.appearanceDistinguishingFeatures),
          clothing: charEntity.appearanceClothing,
        },
        visualSummary: charEntity.visualSummary,
        // Personality
        personality: {
          archetype: charEntity.personalityArchetype,
          temperament: charEntity.personalityTemperament,
          positiveTraits: parseJsonArray(charEntity.personalityPositiveTraits),
          negativeTraits: parseJsonArray(charEntity.personalityNegativeTraits),
          moralAlignment: charEntity.personalityMoralAlignment,
        },
        // Background & Psychology
        background: charEntity.background,
        motivations: parseJsonArray(charEntity.motivations),
        fears: parseJsonArray(charEntity.fears),
        secrets: parseJsonArray(charEntity.secrets),
        // Combat
        combat: {
          primaryWeapons: charEntity.primaryWeapons,
          fightingStyle: charEntity.fightingStyle,
          tacticalRole: charEntity.tacticalRole,
        },
        // Voice
        voice: {
          speechStyle: charEntity.speechStyle,
          signaturePhrases: parseJsonArray(charEntity.signaturePhrases),
        },
        // Story
        faction: charEntity.faction,
        occupation: charEntity.occupation,
        notes: charEntity.notes,
      };

      return {
        mode: 'entity' as const,
        contentType: 'character' as const,
        item: {
          id: charEntity.id,
          title: charEntity.name,
          slug: charEntity.slug,
          type: 'character',
          summary: charEntity.visualSummary || charEntity.background,
          updatedAt: charEntity.updatedAt,
          wordCount,
          createdAt: charEntity.createdAt,
          markdownContent: null,
        },
        character: characterData,
        relationships,
        blocks,
        images,
        navigation: {
          prev: prevChar ? { slug: prevChar.slug, title: prevChar.name } : null,
          next: nextChar ? { slug: nextChar.slug, title: nextChar.name } : null,
        },
      };
    }

    // Fallback: Load from contentItem (old schema)
    const item = await db
      .select()
      .from(contentItem)
      .where(and(eq(contentItem.slug, slug), eq(contentItem.kind, 'character')))
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

        // Get prev/next characters (alphabetically by title)
        const [prevItem, nextItem] = await Promise.all([
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(and(eq(contentItem.kind, 'character'), lt(contentItem.title, item.title)))
            .orderBy(asc(contentItem.title))
            .limit(1)
            .get(),
          db
            .select({ slug: contentItem.slug, title: contentItem.title })
            .from(contentItem)
            .where(and(eq(contentItem.kind, 'character'), gt(contentItem.title, item.title)))
            .orderBy(asc(contentItem.title))
            .limit(1)
            .get(),
        ]);

        // Load images for this character (with LQIP from derivatives)
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
          contentType: 'character' as const,
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
          navigation: {
            prev: prevItem ? { slug: prevItem.slug, title: prevItem.title } : null,
            next: nextItem ? { slug: nextItem.slug, title: nextItem.title } : null,
          },
        };
      }
    }

    // Fallback to Legacy Table for characters
    const legacyItem = await db
      .select()
      .from(unifiedContent)
      .where(and(eq(unifiedContent.slug, slug), eq(unifiedContent.type, 'character')))
      .get();

    if (!legacyItem) {
      throw error(404, 'Character not found');
    }

    // Get prev/next for legacy items
    const [prevLegacy, nextLegacy] = await Promise.all([
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(
          and(eq(unifiedContent.type, 'character'), lt(unifiedContent.title, legacyItem.title))
        )
        .orderBy(asc(unifiedContent.title))
        .limit(1)
        .get(),
      db
        .select({ slug: unifiedContent.slug, title: unifiedContent.title })
        .from(unifiedContent)
        .where(
          and(eq(unifiedContent.type, 'character'), gt(unifiedContent.title, legacyItem.title))
        )
        .orderBy(asc(unifiedContent.title))
        .limit(1)
        .get(),
    ]);

    return {
      mode: 'legacy' as const,
      contentType: 'character' as const,
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
      navigation: {
        prev: prevLegacy ? { slug: prevLegacy.slug, title: prevLegacy.title } : null,
        next: nextLegacy ? { slug: nextLegacy.slug, title: nextLegacy.title } : null,
      },
    };
  } catch (e) {
    if ((e as any).status) throw e;
    const errorMessage = e instanceof Error ? e.message : String(e);
    log.error('Failed to load character', e, { action: 'load', slug, errorMessage });
    throw error(500, `Failed to load character: ${errorMessage}`);
  }
};

import { getDb } from '$lib/server/db';
import {
  unifiedContent,
  workspace,
  contentItem,
  contentRevision,
  contentSection,
  contentBlock,
  loreEntity,
  entityLink,
  scene,
} from '$lib/server/db/schema';
import { MarkdownBlockParser } from '$lib/server/ingestion/parser';
import { EmbeddingService } from '$lib/server/ai/embedding';
import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { Actions } from './$types';

/**
 * Helper function to get current ISO timestamp
 * @returns Current datetime in ISO 8601 format
 */
const now = () => new Date().toISOString();

/**
 * Server actions for admin upload page
 * Handles markdown file uploads and content ingestion into the database
 */
export const actions = {
  /**
   * Upload action - processes markdown files and ingests them into the database
   * Creates content items, revisions, sections, blocks, entities, and vector embeddings
   *
   * @param request - Form request with file upload and content type
   * @param platform - SvelteKit platform with D1, AI, and VECTORIZE bindings
   * @returns Success response or validation error
   * @throws 400 if no file uploaded
   * @throws 500 if database not available or processing fails
   *
   * TODO: Security - Add authentication check here.
   * Currently relying on external protection (e.g. Cloudflare Access),
   * but this endpoint should verify user permissions explicitly.
   */
  upload: async ({ request, platform }) => {
    if (!platform?.env?.DB) {
      return fail(500, { message: 'Database not available' });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const manualType = formData.get('type') as string;

    if (!file || file.name === 'undefined') {
      return fail(400, { message: 'No file uploaded' });
    }

    try {
      const text = await file.text();
      const parsed = MarkdownBlockParser.parse(text);
      const finalType = (manualType || parsed.type).toLowerCase() as any;
      const slug = file.name
        .replace(/\.md$/, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');

      const db = getDb(platform.env.DB);

      // Initialize Embedding Service if AI binding exists
      let embeddingService: EmbeddingService | null = null;
      if (platform.env.AI) {
        embeddingService = new EmbeddingService(platform.env.AI);
      }

      // 1. Ensure Workspace
      const WORKSPACE_SLUG = 'main';
      const ws = await db.select().from(workspace).where(eq(workspace.slug, WORKSPACE_SLUG)).get();
      const wsId = ws ? ws.id : uuidv4();

      if (!ws) {
        await db.insert(workspace).values({
          id: wsId,
          slug: WORKSPACE_SLUG,
          name: 'Main Workspace',
          plan: 'standard',
          createdAt: now(),
          updatedAt: now(),
        });
      }

      // 2. Upsert Content Item
      const item = await db.select().from(contentItem).where(eq(contentItem.slug, slug)).get();
      const itemId = item ? item.id : uuidv4();

      if (!item) {
        await db.insert(contentItem).values({
          id: itemId,
          workspaceId: wsId,
          kind: finalType,
          slug: slug,
          title: parsed.title,
          summary: parsed.summary || null,
          status: 'draft',
          createdBy: 'importer',
          updatedBy: 'importer',
          createdAt: now(),
          updatedAt: now(),
        });
      } else {
        await db
          .update(contentItem)
          .set({ title: parsed.title, updatedAt: now() })
          .where(eq(contentItem.id, itemId));
      }

      if (finalType === 'character' || finalType === 'location') {
        const lore = await db.select().from(loreEntity).where(eq(loreEntity.slug, slug)).get();
        if (!lore) {
          await db.insert(loreEntity).values({
            id: uuidv4(),
            workspaceId: wsId,
            contentId: itemId,
            entityType: finalType,
            slug: slug,
            displayName: parsed.title,
            createdAt: now(),
            updatedAt: now(),
          });
        }
      }

      // 3. Create New Revision
      const revisionId = uuidv4();
      const revisionNumber = Math.floor(Date.now() / 1000);
      await db.insert(contentRevision).values({
        id: revisionId,
        contentId: itemId,
        revisionNumber: revisionNumber,
        state: 'author_draft',
        authorId: 'importer',
        createdAt: now(),
        updatedAt: now(),
      });
      await db
        .update(contentItem)
        .set({ defaultRevisionId: revisionId })
        .where(eq(contentItem.id, itemId));

      // 4. Create Section
      const sectionId = uuidv4();
      await db.insert(contentSection).values({
        id: sectionId,
        revisionId: revisionId,
        sectionType: finalType === 'chapter' ? 'scenes' : 'profile',
        title: 'Main Content',
        position: 1,
        createdAt: now(),
        updatedAt: now(),
      });

      // 5. Insert Blocks & Generate Embeddings
      let position = 1;
      const vectorsToInsert: Array<{
        id: string;
        values: number[];
        metadata: {
          contentId: string;
          blockType: string;
          slug: string;
          title: string;
          textPreview: string;
        };
      }> = [];

      for (const block of parsed.blocks) {
        const blockId = uuidv4();

        // For images/scenes, store metadata in richPayload (must be JSON string)
        const richPayload = block.metadata ? JSON.stringify(block.metadata) : null;

        await db.insert(contentBlock).values({
          id: blockId,
          sectionId: sectionId,
          blockType: block.type as any,
          position: position++,
          textPayload: block.text,
          richPayload: richPayload,
          wordCount: block.text.split(/\s+/).length,
          createdAt: now(),
          updatedAt: now(),
        });

        // Generate Embedding for searchable blocks
        if (
          embeddingService &&
          platform.env.VECTORIZE &&
          (block.type === 'paragraph' || block.type === 'dialogue') &&
          block.text.length > 20
        ) {
          const vector = await embeddingService.generateEmbedding(block.text);
          if (vector.length > 0) {
            vectorsToInsert.push({
              id: blockId,
              values: vector,
              metadata: {
                contentId: itemId,
                blockType: block.type,
                slug: slug,
                title: parsed.title,
                textPreview: block.text.substring(0, 100),
              },
            });
          }
        }
      }

      // Batch insert vectors
      if (vectorsToInsert.length > 0 && platform.env.VECTORIZE) {
        await platform.env.VECTORIZE.upsert(vectorsToInsert);
      }

      // 5.1 Create Scenes from Parser
      // Note: In a real migration, we would link blocks to scenes via sceneSegment.
      // For this PoC, we just store the Scene record to support listing/filtering later.
      let seq = 1;
      for (const sceneData of parsed.scenes) {
        // Check dupes
        const existingScene = await db
          .select()
          .from(scene)
          .where(eq(scene.slug, sceneData.id))
          .get();
        if (!existingScene) {
          await db.insert(scene).values({
            id: uuidv4(),
            contentId: itemId,
            revisionId: revisionId,
            slug: sceneData.id,
            title: sceneData.title,
            sequenceOrder: seq++,
            createdAt: now(),
            updatedAt: now(),
          });
        }
      }

      // 6. Create Entity Links (Mock Logic)
      if (finalType === 'chapter' && parsed.mentions.length > 0) {
        if (finalType === 'character') {
          const source = await db.select().from(loreEntity).where(eq(loreEntity.slug, slug)).get();
          if (source) {
            for (const mentionSlug of parsed.mentions) {
              if (mentionSlug === slug) continue;
              const target = await db
                .select()
                .from(loreEntity)
                .where(eq(loreEntity.slug, mentionSlug))
                .get();
              if (target) {
                const exists = await db
                  .select()
                  .from(entityLink)
                  .where(eq(entityLink.sourceEntityId, source.id))
                  .get();

                if (!exists) {
                  await db.insert(entityLink).values({
                    id: uuidv4(),
                    sourceEntityId: source.id,
                    targetEntityId: target.id,
                    relationship: 'related',
                    createdAt: now(),
                    updatedAt: now(),
                  });
                }
              }
            }
          }
        }
      }

      // Legacy Update
      const existingUnified = await db
        .select()
        .from(unifiedContent)
        .where(eq(unifiedContent.slug, slug))
        .get();
      if (existingUnified) {
        await db
          .update(unifiedContent)
          .set({
            title: parsed.title,
            type: finalType.toUpperCase(),
            markdownContent: text,
            wordCount: parsed.wordCount,
            updatedAt: now(),
          })
          .where(eq(unifiedContent.id, existingUnified.id));
      } else {
        await db.insert(unifiedContent).values({
          id: itemId,
          slug: slug,
          type: finalType.toUpperCase(),
          title: parsed.title,
          markdownContent: text,
          wordCount: parsed.wordCount,
          createdAt: now(),
          updatedAt: now(),
        });
      }

      return { success: true };
    } catch (e) {
      console.error(e);
      return fail(500, { message: 'Upload failed: ' + (e as Error).message });
    }
  },
} satisfies Actions;

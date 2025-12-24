import { eq, and, count } from 'drizzle-orm';
import type { Database } from './db';
import { contentItem, contentSection, contentBlock } from './db/schema';
import type { ContentKind } from './utils';

/**
 * Represents a summary of a content item with core metadata.
 *
 * This interface provides a lightweight representation of content items
 * for list views and summary displays, excluding the full content blocks.
 */
export interface ContentItemSummary {
  /** Unique identifier for the content item */
  id: string;
  /** Type of content (chapter, character, location, etc.) */
  kind: string;
  /** URL-friendly unique identifier */
  slug: string;
  /** Display title of the content */
  title: string;
  /** Brief description or summary */
  summary: string | null;
  /** Total word count across all blocks */
  wordCount: number | null;
  /** ISO 8601 timestamp of creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
}

/**
 * Generic paginated result container.
 *
 * @template T - The type of items being paginated
 */
export interface PaginatedResult<T> {
  /** Array of items for the current page */
  items: T[];
  /** Total number of items across all pages */
  total: number;
  /** Whether more items exist beyond this page */
  has_more: boolean;
}

/**
 * Represents a complete content item including all content blocks.
 *
 * Extends ContentItemSummary with the full hierarchical content structure,
 * including all blocks from the default revision. Optionally includes
 * pre-rendered markdown for display purposes.
 */
export interface FullContentItem extends ContentItemSummary {
  /** All content blocks in this item, sorted by position */
  blocks: ContentBlockData[];
  /** Optional pre-rendered markdown representation */
  markdownContent?: string;
}

/**
 * Represents a single content block with its data payloads.
 *
 * Content blocks are the atomic units of content, each with a specific type
 * (prose, dialogue, scene_header) and containing either plain text or
 * structured rich data.
 */
export interface ContentBlockData {
  /** Unique identifier for the block */
  id: string;
  /** Type of block (prose, dialogue, scene_header, etc.) */
  blockType: string;
  /** Position of block within its parent section */
  position: number;
  /** Plain text content of the block */
  textPayload: string | null;
  /** Structured JSON data for complex block types */
  richPayload: Record<string, unknown> | null;
  /** Word count for this block */
  wordCount: number | null;
}

/**
 * Retrieves a paginated list of content items filtered by type.
 *
 * Fetches content items of a specific kind (chapter, character, location, etc.)
 * with pagination support. Returns both the items and metadata about the total
 * count and whether more results are available.
 *
 * @param db - The Drizzle database instance
 * @param kind - The type of content to retrieve
 * @param limit - Maximum number of items to return (default: 50)
 * @param offset - Number of items to skip for pagination (default: 0)
 * @returns A paginated result containing content item summaries and metadata
 *
 * @example
 * ```typescript
 * const result = await listContentByKind(db, 'chapter', 25, 0);
 * console.log(`Showing ${result.items.length} of ${result.total} chapters`);
 * ```
 */
export async function listContentByKind(
  db: Database,
  kind: ContentKind,
  limit: number = 50,
  offset: number = 0
): Promise<PaginatedResult<ContentItemSummary>> {
  // Get total count
  const countResult = await db
    .select({ value: count() })
    .from(contentItem)
    .where(eq(contentItem.kind, kind));
  const total = countResult[0]?.value ?? 0;

  // Get paginated items
  const items = await db
    .select()
    .from(contentItem)
    .where(eq(contentItem.kind, kind))
    .limit(limit)
    .offset(offset);

  const mappedItems = items.map(item => ({
    id: item.id,
    kind: item.kind,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    wordCount: item.wordCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));

  return {
    items: mappedItems,
    total,
    has_more: offset + items.length < total,
  };
}

/**
 * Loads a complete content item with all its content blocks.
 *
 * Retrieves a content item by kind and slug, including the full hierarchical
 * content structure from the default revision. This includes all sections and
 * blocks, properly ordered by position. Returns null if no matching item is found.
 *
 * The function performs the following:
 * 1. Finds the content item by kind and slug
 * 2. Loads all sections from the default revision
 * 3. Loads all blocks from each section
 * 4. Sorts blocks by position
 * 5. Parses rich payloads from JSON
 *
 * @param db - The Drizzle database instance
 * @param kind - The type of content to load
 * @param slug - The unique slug identifier for the content
 * @returns The full content item with blocks, or null if not found
 *
 * @example
 * ```typescript
 * const chapter = await loadFullContentItem(db, 'chapter', 'chapter-1');
 * if (chapter) {
 *   console.log(`${chapter.title} has ${chapter.blocks.length} blocks`);
 * }
 * ```
 */
export async function loadFullContentItem(
  db: Database,
  kind: ContentKind,
  slug: string
): Promise<FullContentItem | null> {
  const items = await db
    .select()
    .from(contentItem)
    .where(and(eq(contentItem.kind, kind), eq(contentItem.slug, slug)))
    .limit(1);

  if (items.length === 0) {
    return null;
  }

  const item = items[0];

  // Load the default revision's blocks
  const blocks: ContentBlockData[] = [];

  if (item.defaultRevisionId) {
    const sections = await db
      .select()
      .from(contentSection)
      .where(eq(contentSection.revisionId, item.defaultRevisionId));

    for (const section of sections) {
      const sectionBlocks = await db
        .select()
        .from(contentBlock)
        .where(eq(contentBlock.sectionId, section.id));

      for (const block of sectionBlocks) {
        blocks.push({
          id: block.id,
          blockType: block.blockType,
          position: block.position,
          textPayload: block.textPayload,
          richPayload: block.richPayload ? JSON.parse(block.richPayload) : null,
          wordCount: block.wordCount,
        });
      }
    }
  }

  // Sort blocks by position
  blocks.sort((a, b) => a.position - b.position);

  return {
    id: item.id,
    kind: item.kind,
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    wordCount: item.wordCount,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    blocks,
  };
}

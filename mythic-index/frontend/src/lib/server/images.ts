import { eq, and, asc } from 'drizzle-orm';
import type { Database } from './db';
import { image, contentItem, imageAsset, imageLink, imageDerivative } from './db/schema';

/**
 * Legacy image data structure for backwards compatibility.
 *
 * Represents images from the original image storage system before the
 * imageAsset/imageLink pipeline was introduced. Use ContentImage for
 * new development.
 */
export interface ImageData {
  /** Unique identifier for the image */
  id: string;
  /** Cloudflare Images unique identifier */
  cloudflareId: string;
  /** Original filename */
  filename: string;
  /** Accessibility text description */
  altText: string | null;
  /** Image width in pixels */
  width: number | null;
  /** Image height in pixels */
  height: number | null;
}

/**
 * Modern content image representation for display and rendering.
 *
 * Provides all necessary data for displaying images in the frontend,
 * including Cloudflare Images URLs, accessibility attributes, and
 * optional LQIP (Low Quality Image Placeholder) for progressive loading.
 */
export interface ContentImage {
  /** Full URL to the image (Cloudflare Images or fallback) */
  src: string;
  /** Accessibility alt text */
  alt: string;
  /** Role of the image (portrait, banner, inline, etc.) */
  role: string;
  /** Optional caption for display */
  caption: string | null;
  /** Optional scene ID if image is associated with a specific scene */
  sceneId?: string | null;
  /** Image width in pixels for aspect ratio */
  width?: number | null;
  /** Image height in pixels for aspect ratio */
  height?: number | null;
  /** Low-quality image placeholder data URL for progressive loading */
  lqip?: string | null;
}

/**
 * Loads images by content item ID from the legacy image table.
 *
 * This function is maintained for backwards compatibility with content
 * that still uses the old image storage system. New development should
 * use loadContentImagesBySlug instead.
 *
 * @param db - The Drizzle database instance
 * @param contentItemId - The ID of the content item
 * @returns Array of legacy image data objects
 * @deprecated Use loadContentImagesBySlug for new development
 */
export async function loadContentImages(db: Database, contentItemId: string): Promise<ImageData[]> {
  const images = await db.select().from(image).where(eq(image.contentItemId, contentItemId));

  return images.map(img => ({
    id: img.id,
    cloudflareId: img.cloudflareId,
    filename: img.filename,
    altText: img.altText,
    width: img.width,
    height: img.height,
  }));
}

/**
 * Loads images for content by type and slug using the modern image pipeline.
 *
 * This function uses the imageAsset/imageLink schema to retrieve images
 * associated with a content item. Supports filtering by role (e.g., 'portrait',
 * 'banner') and includes LQIP data for progressive loading when available.
 *
 * The function:
 * 1. Finds the content item by type and slug
 * 2. Joins image assets via the imageLink junction table
 * 3. Left joins derivatives for LQIP data
 * 4. Deduplicates results (multiple derivatives may exist per asset)
 * 5. Sorts by display order
 *
 * @param db - The Drizzle database instance
 * @param contentType - The kind of content (chapter, character, location)
 * @param slug - The unique slug identifier for the content
 * @param deliveryBaseUrl - Base URL for Cloudflare Images delivery
 * @param role - Optional role filter (portrait, banner, inline, etc.)
 * @returns Array of content images, or null if content item not found
 *
 * @example
 * ```typescript
 * const portraits = await loadContentImagesBySlug(
 *   db,
 *   'character',
 *   'hero-name',
 *   'https://imagedelivery.net/abc123',
 *   'portrait'
 * );
 * ```
 */
export async function loadContentImagesBySlug(
  db: Database,
  contentType: string,
  slug: string,
  _deliveryBaseUrl: string,
  role?: string
): Promise<ContentImage[] | null> {
  // First, find the content item by type and slug
  const item = await db
    .select()
    .from(contentItem)
    .where(and(eq(contentItem.kind, contentType), eq(contentItem.slug, slug)))
    .get();

  if (!item) return null;

  // Build query for images with LQIP from derivatives
  const baseCondition = eq(imageLink.contentId, item.id);
  const whereCondition = role ? and(baseCondition, eq(imageLink.role, role)) : baseCondition;

  const images = await db
    .select({
      assetId: imageAsset.id,
      cloudflareId: imageAsset.cloudflareImageId,
      baseUrl: imageAsset.cloudflareBaseUrl,
      width: imageAsset.width,
      height: imageAsset.height,
      role: imageLink.role,
      altText: imageLink.altText,
      caption: imageLink.caption,
      sortOrder: imageLink.sortOrder,
      sceneId: imageLink.sceneId,
      lqip: imageDerivative.lqip,
    })
    .from(imageLink)
    .innerJoin(imageAsset, eq(imageLink.assetId, imageAsset.id))
    .leftJoin(imageDerivative, eq(imageDerivative.assetId, imageAsset.id))
    .where(whereCondition)
    .orderBy(asc(imageLink.sortOrder));

  // Deduplicate results (multiple derivatives per asset may cause duplicates)
  // Keep first occurrence of each assetId, but capture any LQIP found
  const deduped = new Map<string, (typeof images)[0]>();
  for (const img of images) {
    const existing = deduped.get(img.assetId);
    if (!existing) {
      deduped.set(img.assetId, img);
    } else if (img.lqip && !existing.lqip) {
      // Update with LQIP if found
      deduped.set(img.assetId, { ...existing, lqip: img.lqip });
    }
  }

  return Array.from(deduped.values()).map(img => ({
    src: img.baseUrl ? `${img.baseUrl}/public` : '',
    alt: img.altText || '',
    role: img.role,
    caption: img.caption,
    sceneId: img.sceneId,
    width: img.width,
    height: img.height,
    lqip: img.lqip,
  }));
}

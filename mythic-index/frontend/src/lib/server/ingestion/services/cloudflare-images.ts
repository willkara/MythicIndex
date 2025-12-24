/**
 * Cloudflare Images Upload Service
 *
 * Handles uploading images to Cloudflare Images via REST API for CLI ingestion.
 * Provides functions for uploading, deleting, and retrieving image details.
 */

import { createHash } from 'crypto';
import { readFile, stat } from 'fs/promises';
import { config as loadEnv } from 'dotenv';

// Load environment variables
loadEnv();

/**
 * Result of a successful Cloudflare Images upload
 */
export interface CloudflareUploadResult {
  id: string; // Cloudflare image ID
  filename: string;
  variants: string[]; // Available variant URLs
  uploaded: string; // ISO timestamp
}

/**
 * Configuration for Cloudflare Images API
 */
export interface CloudflareConfig {
  accountId: string;
  apiToken: string;
}

/**
 * Response structure from Cloudflare Images API
 */
interface CloudflareImagesResponse {
  result: {
    id: string;
    filename: string;
    uploaded: string;
    requireSignedURLs: boolean;
    variants: string[];
  };
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
}

let config: CloudflareConfig | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Initialize Cloudflare Images configuration from environment variables
 *
 * Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN from environment
 * unless a config object is provided.
 *
 * @param cfg - Optional configuration object
 * @throws Error if required environment variables are missing
 */
export function initCloudflareImages(cfg?: CloudflareConfig): void {
  if (cfg) {
    config = cfg;
    return;
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error(
      'Cloudflare Images requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables'
    );
  }

  config = { accountId, apiToken };
}

/**
 * Reset the Cloudflare Images configuration
 */
export function resetCloudflareImages(): void {
  config = null;
}

/**
 * Check if Cloudflare Images is configured
 */
export function isCloudflareImagesAvailable(): boolean {
  if (config) return true;

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;

  return !!(accountId && apiToken);
}

/**
 * Get the current configuration
 */
function getConfig(): CloudflareConfig {
  if (!config) {
    initCloudflareImages();
  }
  if (!config) {
    throw new Error('Cloudflare Images not configured');
  }
  return config;
}

// ============================================================================
// Image Operations
// ============================================================================

/**
 * Upload an image to Cloudflare Images
 *
 * @param filePath - Absolute path to image file
 * @param metadata - Optional metadata to attach to image
 * @returns Upload result with Cloudflare image ID and variants
 * @throws Error if upload fails or file cannot be read
 */
export async function uploadImage(
  filePath: string,
  metadata?: Record<string, string>
): Promise<CloudflareUploadResult> {
  const { accountId, apiToken } = getConfig();

  const fileBuffer = await readFile(filePath);
  const filename = filePath.split('/').pop() || 'image';

  // Create form data for upload
  // Convert Buffer to Uint8Array for Blob compatibility
  const formData = new FormData();
  formData.append('file', new Blob([new Uint8Array(fileBuffer)]), filename);

  // Add metadata if provided
  if (metadata) {
    formData.append('metadata', JSON.stringify(metadata));
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Cloudflare Images upload failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as CloudflareImagesResponse;

  if (!data.success) {
    throw new Error(`Cloudflare Images error: ${data.errors.map(e => e.message).join(', ')}`);
  }

  return {
    id: data.result.id,
    filename: data.result.filename,
    variants: data.result.variants,
    uploaded: data.result.uploaded,
  };
}

/**
 * Delete an image from Cloudflare Images
 *
 * @param imageId - Cloudflare image ID to delete
 * @returns True if deletion was successful
 * @throws Error if deletion fails
 */
export async function deleteImage(imageId: string): Promise<boolean> {
  const { accountId, apiToken } = getConfig();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${imageId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Cloudflare Images delete failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as { success: boolean; errors: Array<{ message: string }> };
  return data.success;
}

/**
 * Get details about an uploaded image
 *
 * @param imageId - Cloudflare image ID
 * @returns Image details or null if not found
 * @throws Error if API request fails
 */
export async function getImageDetails(imageId: string): Promise<CloudflareUploadResult | null> {
  const { accountId, apiToken } = getConfig();

  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1/${imageId}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Cloudflare Images get failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const data = (await response.json()) as CloudflareImagesResponse;

  if (!data.success) {
    return null;
  }

  return {
    id: data.result.id,
    filename: data.result.filename,
    variants: data.result.variants,
    uploaded: data.result.uploaded,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Compute SHA-256 hash of a file for deduplication
 *
 * @param filePath - Path to file
 * @returns Hex-encoded SHA-256 hash
 * @throws Error if file cannot be read
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Get file info (size, mime type)
 *
 * @param filePath - Path to file
 * @returns Object with file size and MIME type
 * @throws Error if file cannot be accessed
 */
export async function getFileInfo(filePath: string): Promise<{
  sizeBytes: number;
  mimeType: string;
}> {
  const fileStat = await stat(filePath);

  const ext = filePath.toLowerCase().split('.').pop();
  const mimeTypes: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  };

  return {
    sizeBytes: fileStat.size,
    mimeType: mimeTypes[ext || ''] || 'application/octet-stream',
  };
}

/**
 * Test the Cloudflare Images connection
 *
 * Lists images (limited to 1) to verify API connectivity.
 *
 * @returns Object with success status and message
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  try {
    const { accountId, apiToken } = getConfig();

    // List images endpoint to test connection
    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/images/v1?per_page=1`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
      },
    });

    if (!response.ok) {
      return {
        success: false,
        message: `API returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = (await response.json()) as { success: boolean };
    if (data.success) {
      return { success: true, message: 'Connected to Cloudflare Images' };
    }
    return { success: false, message: 'Unexpected response from Cloudflare Images' };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Extract base URL from a variant URL
 *
 * Removes the variant name from the end of the URL.
 * Example: "https://imagedelivery.net/abc123/image-id/public" -> "https://imagedelivery.net/abc123/image-id"
 *
 * @param variantUrl - Full variant URL
 * @returns Base URL without variant name
 */
export function extractBaseUrl(variantUrl: string): string {
  const parts = variantUrl.split('/');
  parts.pop(); // Remove variant name
  return parts.join('/');
}

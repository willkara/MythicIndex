/**
 * Image synchronization script for Cloudflare Images.
 *
 * This script scans the story-content directory for images, uploads them
 * to Cloudflare Images (or mocks the upload for PoC), and generates SQL
 * statements for populating the image_asset table.
 *
 * Process:
 * 1. Recursively scans content directories for image files (.png, .jpg, .webp)
 * 2. Computes SHA-256 hash for each image (for deduplication)
 * 3. Uploads to Cloudflare Images API
 * 4. Generates SQL INSERT statements for image_asset table
 *
 * Note: This is a utility script, not part of the runtime application.
 * Execute with: `tsx scripts/sync_images.ts`
 */
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createHash } from 'crypto';

/** Path to the source markdown content directory */
const CONTENT_ROOT = '../MemoryQuill/story-content';

/**
 * Mocks uploading an image to Cloudflare Images API.
 *
 * In production, this would make an actual API call to:
 * https://api.cloudflare.com/client/v4/accounts/<id>/images/v1
 *
 * @param filePath - Path to the image file
 * @param hash - SHA-256 hash of the file content
 * @returns Mock response with image ID and variant URLs
 */
async function mockUploadToCloudflare(filePath: string, hash: string) {
    // In reality, this would be a POST to https://api.cloudflare.com/client/v4/accounts/<id>/images/v1
    // For PoC, we generate a mock URL
    return {
        id: `img-${hash.substring(0, 8)}`,
        variants: [
            `https://imagedelivery.net/demo-account/${hash}/public`,
            `https://imagedelivery.net/demo-account/${hash}/thumbnail`
        ]
    };
}

/**
 * Main image synchronization function.
 *
 * Orchestrates the full image sync process from local files to Cloudflare.
 */
async function main() {
    console.log("Starting Image Synchronization Analysis...");

    const categories = ['characters', 'locations', 'chapters'];
    let totalImages = 0;

    // SQL for updating Image Assets
    let sqlOutput = "-- Image Asset Migration\n";

    for (const cat of categories) {
        const catPath = join(CONTENT_ROOT, cat);
        try {
            const entries = await readdir(catPath, { withFileTypes: true });

            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const itemDir = join(catPath, entry.name);
                    const images = await findImagesInDir(itemDir);

                    for (const img of images) {
                        totalImages++;
                        const fullPath = join(itemDir, img);
                        const fileBuffer = await readFile(fullPath);
                        const hash = createHash('sha256').update(fileBuffer).digest('hex');

                        console.log(`Processing: ${entry.name}/${img} [${hash.substring(0,8)}]`);

                        const upload = await mockUploadToCloudflare(fullPath, hash);

                        // We would upsert this into image_asset table
                        sqlOutput += `INSERT INTO image_asset (id, file_hash, cloudflare_image_id, cloudflare_public_url) VALUES ('${uuidv4()}', '${hash}', '${upload.id}', '${upload.variants[0]}');\n`;
                    }
                }
            }
        } catch (e) {
            // Ignore missing dirs
        }
    }

    console.log(`\nFound ${totalImages} images total.`);
    console.log("Migration SQL Preview (First 500 chars):");
    console.log(sqlOutput.substring(0, 500));
}

/**
 * Finds all image files in a directory.
 *
 * @param dir - Directory path to search
 * @returns Array of image filenames (.png, .jpg, .webp)
 */
async function findImagesInDir(dir: string): Promise<string[]> {
    try {
        const files = await readdir(dir);
        return files.filter(f => f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.webp'));
    } catch {
        return [];
    }
}

/**
 * Generates a random UUID v4.
 *
 * Simple implementation for script usage. In production, use a proper
 * UUID library like `uuid` or `crypto.randomUUID()`.
 *
 * @returns A UUID v4 string
 */
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

main().catch(console.error);

/**
 * Character Image Discovery Tool
 *
 * Scans character image directories, matches images to scenes in image_ideas.yaml,
 * analyzes them with Gemini Vision, and updates imagery.yaml with properly-structured
 * entries that match the batch planner's ID format for correct skip detection.
 */

import { readdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import { join, basename, extname } from 'path';
import pLimit from 'p-limit';
import {
  readImageryYaml,
  writeImageryYaml,
  readImageIdeasYaml,
  getImagesDir,
  getEntityDir,
  type CharacterImagery,
  type ImageInventoryEntry,
  type ImageIdeasData,
  type ImageIdeaScene,
} from '../services/imagery-yaml.js';
import { getCachedCharacters } from '../services/entity-cache.js';
import { analyzeImageEnhanced, type EnhancedAnalysisResult } from '../services/image-analysis.js';
import { filterEntitiesBySlug } from '../services/batch/slug-filter.js';

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  /** Filter to specific character slugs (substring matching) */
  slugFilter?: string[];
  /** Re-analyze already catalogued images */
  reAnalyze?: boolean;
  /** Dry run - preview changes without writing */
  dryRun?: boolean;
  /** Max parallel workers for analysis */
  maxWorkers?: number;
}

/**
 * Scene match result
 */
interface SceneMatch {
  sceneIndex: number;
  sceneTitle: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Discover and analyze character images
 *
 * Scans character directories for images, analyzes them with Gemini Vision,
 * and updates imagery.yaml files with properly-structured entries.
 *
 * @param options - Discovery configuration options
 * @returns Promise that resolves when discovery is complete
 */
export async function discoverAndAnalyzeCharacterImages(
  options: DiscoveryOptions = {}
): Promise<void> {
  const characters = getCachedCharacters();
  const filtered = filterEntitiesBySlug(characters, options.slugFilter);
  const maxWorkers = options.maxWorkers || 10;

  console.log(`\n📸 Character Image Discovery & Analysis`);
  console.log(`Workers: ${maxWorkers} parallel`);
  console.log(`Characters: ${filtered.length}\n`);

  for (const character of filtered) {
    await processCharacter(character.slug, character.name, options, maxWorkers);
  }

  console.log(`\n✨ Discovery complete!\n`);
}

/**
 * Process a single character
 *
 * @param slug - Character slug identifier
 * @param name - Character display name
 * @param options - Discovery configuration options
 * @param maxWorkers - Maximum number of parallel analysis workers
 * @returns Promise that resolves when processing is complete
 */
async function processCharacter(
  slug: string,
  name: string,
  options: DiscoveryOptions,
  maxWorkers: number
): Promise<void> {
  console.log(`\n=== ${name} (${slug}) ===\n`);

  const imagesDir = getImagesDir('character', slug);
  const _entityDir = getEntityDir('character', slug);

  if (!existsSync(imagesDir)) {
    console.log('  ⚠️  No images directory');
    return;
  }

  // 1. Load existing imagery.yaml
  const imageryData = (await readImageryYaml('character', slug)) as CharacterImagery | null;
  const existingByFilename = new Map<string, ImageInventoryEntry>();

  if (imageryData?.image_inventory) {
    for (const entry of imageryData.image_inventory) {
      const filename = entry.provenance?.original_filename || entry.path.split('/').pop();
      if (filename) {
        existingByFilename.set(filename, entry);
      }
    }
  }

  // 2. Load image_ideas.yaml for scene matching
  const imageIdeas = await readImageIdeasYaml(slug);

  // 3. Load character appearance for canon checking
  const appearance = imageryData?.appearance || '';

  // 4. Discover image files
  const files = await readdir(imagesDir);
  const imageFiles = files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

  console.log(`  Found: ${imageFiles.length} images`);
  console.log(`  Catalogued: ${existingByFilename.size}`);

  // 5. Filter images to analyze
  const toAnalyze = imageFiles.filter((f) => {
    if (options.reAnalyze) return true;
    return !existingByFilename.has(f);
  });

  if (toAnalyze.length === 0) {
    console.log(`  ✓ All images already analyzed\n`);
    return;
  }

  console.log(`  To analyze: ${toAnalyze.length}\n`);

  // 6. Parallel analysis with rate limiting
  const limit = pLimit(maxWorkers);
  const analysisPromises = toAnalyze.map((filename, index) =>
    limit(() =>
      analyzeImage(slug, name, filename, imagesDir, imageIdeas, appearance, index, toAnalyze.length)
    )
  );

  const results = await Promise.allSettled(analysisPromises);

  // 7. Collect successful analyses
  const newEntries: ImageInventoryEntry[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      newEntries.push(result.value);
      successCount++;
    } else {
      errorCount++;
      if (result.status === 'rejected') {
        console.error(`  ✗ Analysis error: ${result.reason}`);
      }
    }
  }

  console.log(`\n  ✓ Analyzed: ${successCount}`);
  if (errorCount > 0) {
    console.log(`  ✗ Errors: ${errorCount}`);
  }

  // 8. Update imagery.yaml
  if (!options.dryRun && newEntries.length > 0) {
    const updated: CharacterImagery = imageryData || {
      entity_type: 'character',
      slug,
      appearance,
      custom_style_override: undefined,
      prompts: [],
      image_inventory: [],
    };

    updated.image_inventory.push(...newEntries);

    await writeImageryYaml('character', slug, updated);
    console.log(`  💾 Updated imagery.yaml with ${newEntries.length} entries\n`);
  } else if (options.dryRun && newEntries.length > 0) {
    console.log(`  [DRY RUN] Would add ${newEntries.length} entries\n`);
    // Show sample of what would be added
    if (newEntries.length > 0) {
      console.log(`  Sample entry:`);
      console.log(`    ID: ${newEntries[0].id}`);
      console.log(`    Path: ${newEntries[0].path}`);
      console.log(`    Type: ${newEntries[0].image_type || 'N/A'}`);
    }
  }
}

/**
 * Analyze a single image
 *
 * @param slug - Character slug identifier
 * @param name - Character display name
 * @param filename - Image filename to analyze
 * @param imagesDir - Directory containing images
 * @param imageIdeas - Image ideas data for scene matching
 * @param appearance - Character appearance description
 * @param index - Current image index (for progress display)
 * @param total - Total number of images to analyze
 * @returns Promise resolving to image inventory entry or null if analysis failed
 */
async function analyzeImage(
  slug: string,
  name: string,
  filename: string,
  imagesDir: string,
  imageIdeas: ImageIdeasData | null,
  appearance: string,
  index: number,
  total: number
): Promise<ImageInventoryEntry | null> {
  console.log(`  [${index + 1}/${total}] Analyzing: ${filename}`);

  const imagePath = join(imagesDir, filename);

  try {
    // Match to scene
    const sceneMatch = imageIdeas?.scenes
      ? matchFilenameToScene(filename, imageIdeas.scenes)
      : null;

    if (sceneMatch) {
      console.log(`    → Scene: "${sceneMatch.sceneTitle}" (${sceneMatch.confidence})`);
    }

    // Generate ID (matching batch planner format)
    const id = generateSceneBasedId(slug, filename, sceneMatch);

    // Analyze with Gemini using existing service
    const result: EnhancedAnalysisResult = await analyzeImageEnhanced({
      imagePath,
      characterName: name,
      slug,
      appearance,
      filename,
      enhanced: true, // Use enhanced analysis with rich metadata
    });

    if (!result.success || !result.entry) {
      console.log(`    ✗ Analysis failed: ${result.error || 'Unknown error'}`);
      return null;
    }

    const entry = result.entry;

    // Override ID to match batch planner format
    entry.id = id;

    // Add scene tags if matched
    if (sceneMatch) {
      entry.content = entry.content || {};
      entry.content.tags = [
        ...(entry.content.tags || []),
        `scene:${sceneMatch.sceneTitle}`,
        `scene-index:${sceneMatch.sceneIndex}`,
      ];
    }

    // Rename file based on suggested_filename (skip portrait/profile)
    const lowerFilename = filename.toLowerCase();
    const shouldSkipRename =
      lowerFilename.includes('portrait') || lowerFilename.includes('profile');

    if (!shouldSkipRename && entry.content?.suggested_filename) {
      try {
        const ext = extname(filename);
        const suggestedSlug = entry.content.suggested_filename
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 40);

        // Find unique index for this filename
        let newFilename = `${slug}-${suggestedSlug}-${index.toString().padStart(2, '0')}${ext}`;
        let newPath = join(imagesDir, newFilename);
        let counter = index;

        while (existsSync(newPath) && newPath !== imagePath) {
          counter++;
          newFilename = `${slug}-${suggestedSlug}-${counter.toString().padStart(2, '0')}${ext}`;
          newPath = join(imagesDir, newFilename);
        }

        // Rename the file
        await rename(imagePath, newPath);
        console.log(`    📝 Renamed to: ${newFilename}`);

        // Update entry path (keep original_filename in provenance)
        entry.path = `images/${newFilename}`;
      } catch (renameError) {
        console.log(`    ⚠️  Rename failed: ${renameError}`);
        // Continue with original filename
      }
    }

    console.log(`    ✓ Complete`);

    // Small delay for rate limiting (200ms between calls)
    await new Promise((resolve) => setTimeout(resolve, 200));

    return entry;
  } catch (error) {
    console.log(`    ✗ Error: ${error}`);
    return null;
  }
}

/**
 * Match filename to scene in image_ideas.yaml
 *
 * Uses fuzzy word matching to find the best scene match.
 * Returns null if no confident match found.
 */
function matchFilenameToScene(filename: string, scenes: ImageIdeaScene[]): SceneMatch | null {
  const normalized = filename
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\.(png|jpg|jpeg|webp)$/i, '');

  let bestMatch: SceneMatch | null = null;
  let bestRatio = 0;

  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    const sceneWords = scene.title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2); // Ignore short words like "a", "the"

    if (sceneWords.length === 0) continue;

    const matchedWords = sceneWords.filter((word) => normalized.includes(word));

    const matchRatio = matchedWords.length / sceneWords.length;

    if (matchRatio > bestRatio) {
      bestRatio = matchRatio;
      bestMatch = {
        sceneIndex: i,
        sceneTitle: scene.title,
        confidence:
          matchRatio === 1.0
            ? 'high'
            : matchRatio >= 0.8
              ? 'medium'
              : matchRatio >= 0.6
                ? 'low'
                : ('none' as 'low'), // Type assertion to handle < 0.6
      };
    }
  }

  // Only return if confidence threshold met (>= 60%)
  if (bestRatio >= 0.6 && bestMatch) {
    return bestMatch;
  }

  return null;
}

/**
 * Generate ID matching batch planner format
 *
 * Format: {slug}-{scene-title-slug}-{index:02d}
 * Example: "aldwin-gentleheart-the-healers-hands-00"
 *
 * Falls back to filename-based ID if no scene match.
 */
function generateSceneBasedId(
  slug: string,
  filename: string,
  sceneMatch: SceneMatch | null
): string {
  if (sceneMatch) {
    // Use scene-based ID matching batch planner format
    const sceneSlug = sceneMatch.sceneTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    const index = sceneMatch.sceneIndex.toString().padStart(2, '0');
    return `${slug}-${sceneSlug}-${index}`;
  } else {
    // Fallback to filename-based ID
    const fileSlug = filename
      .replace(/\.(png|jpg|jpeg|webp)$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40);
    return `${slug}-${fileSlug}`;
  }
}

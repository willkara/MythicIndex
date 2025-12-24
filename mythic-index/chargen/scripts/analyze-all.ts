/**
 * Batch Image Analysis Script
 *
 * Analyzes all character images in parallel using Google Gemini Vision API.
 * Generates structured metadata (imagery.yaml) for images that haven't been analyzed yet.
 *
 * Usage:
 *   tsx scripts/analyze-all.ts              # Analyze all characters
 *   tsx scripts/analyze-all.ts <slug>       # Analyze specific character
 *
 * Features:
 * - Parallel processing with configurable concurrency limit
 * - Auto-generates imagery.yaml if missing
 * - Skips already-analyzed images
 * - Progress tracking and error reporting
 */

import { initConfig, getConfig } from '../src/services/config.js';
import { initEntityCache, getCachedCharacters } from '../src/services/entity-cache.js';
import {
  analyzeImage,
  generateImageryYaml,
  discoverImageFiles,
  type ImageInventoryEntry
} from '../src/services/image-analysis.js';
import {
  readImageryYaml,
  writeImageryYaml,
  getImagesDir,
  getEntityDir,
  type CharacterImagery
} from '../src/services/imagery-yaml.js';
import { showSuccess, showInfo, showError, showWarning } from '../src/ui/display.js';
import chalk from 'chalk';
import { join } from 'path';

/** Maximum number of concurrent analysis tasks */
const CONCURRENCY_LIMIT = 10;

/** Optional target character slug from command line arguments */
const TARGET_CHARACTER = process.argv[2];

/**
 * Represents a single image analysis task
 */
interface Task {
  /** Character slug identifier */
  characterSlug: string;
  /** Human-readable character name */
  characterName: string;
  /** Full path to the image file */
  imagePath: string;
  /** Image filename */
  filename: string;
  /** Character appearance description for AI context */
  appearance: string;
}

/**
 * Main entry point for batch image analysis
 * Discovers, analyzes, and saves metadata for all unanalyzed character images
 */
async function main() {
  console.log(chalk.cyan.bold('=== Batch Image Analysis (Headless) ==='));
  
  // 1. Initialize
  console.log('Initializing...');
  await initConfig();
  await initEntityCache();
  
  const characters = getCachedCharacters();
  console.log(`Found ${characters.length} characters.`);

  const charsToProcess = TARGET_CHARACTER 
    ? characters.filter(c => c.slug === TARGET_CHARACTER)
    : characters;

  if (TARGET_CHARACTER && charsToProcess.length === 0) {
    console.error(chalk.red(`Character '${TARGET_CHARACTER}' not found!`));
    process.exit(1);
  }

  // 2. Discovery Phase
  console.log(chalk.blue('\nScanning for unanalyzed images...'));
  
  const tasks: Task[] = [];
  const characterDataCache = new Map<string, CharacterImagery>();

  for (const char of charsToProcess) {
    const imagesDir = getImagesDir('character', char.slug);
    const entityDir = getEntityDir('character', char.slug);
    
    // Get or create imagery data
    let imageryData = await readImageryYaml('character', char.slug) as CharacterImagery;
    
    if (!imageryData) {
      // Auto-generate if missing (headless version)
      const generated = await generateImageryYaml({ 
        characterDir: entityDir, 
        slug: char.slug 
      });
      
      if (generated) {
        imageryData = generated;
      } else {
        console.warn(chalk.yellow(`  Could not generate imagery.yaml for ${char.slug}`));
        continue;
      }
    }
    
    characterDataCache.set(char.slug, imageryData);
    
    // Check images
    const imageFiles = await discoverImageFiles(imagesDir);
    if (imageFiles.length === 0) continue;

    // Filter existing
    const existingFilenames = new Set<string>();
    if (imageryData.image_inventory) {
      for (const entry of imageryData.image_inventory) {
        if (entry.provenance?.original_filename) {
          existingFilenames.add(entry.provenance.original_filename);
        }
      }
    }

    const newImages = imageFiles.filter(f => !existingFilenames.has(f.split('/').pop() || ''));
    
    for (const imgPath of newImages) {
      tasks.push({
        characterSlug: char.slug,
        characterName: char.name,
        imagePath: imgPath,
        filename: imgPath.split('/').pop() || '',
        appearance: imageryData.appearance || ''
      });
    }
  }

  if (tasks.length === 0) {
    console.log(chalk.green('All images are already analyzed!'));
    return;
  }

  console.log(chalk.blue(`Found ${tasks.length} images to analyze.`));
  console.log(chalk.dim(`Processing with concurrency: ${CONCURRENCY_LIMIT}`));
  console.log(chalk.dim('----------------------------------------'));

  // 3. Execution Phase (Parallel)
  let completed = 0;
  let success = 0;
  let failed = 0;
  
  // Helper for simple pool
  const resultsBySlug = new Map<string, ImageInventoryEntry[]>();

  /**
   * Worker function to analyze a single image task
   * @param task The image analysis task to process
   */
  async function worker(task: Task) {
    try {
      const start = Date.now();
      const result = await analyzeImage({
        imagePath: task.imagePath,
        characterName: task.characterName,
        slug: task.characterSlug,
        appearance: task.appearance,
        filename: task.filename
      });
      
      const duration = ((Date.now() - start) / 1000).toFixed(1);

      if (result) {
        if (!resultsBySlug.has(task.characterSlug)) {
          resultsBySlug.set(task.characterSlug, []);
        }
        resultsBySlug.get(task.characterSlug)!.push(result);
        success++;
        console.log(`${chalk.green('✓')} [${task.characterSlug}] ${task.filename} (${duration}s)`);
      } else {
        failed++;
        console.log(`${chalk.red('✗')} [${task.characterSlug}] ${task.filename} (Failed to parse)`);
      }
    } catch (err) {
      failed++;
      console.log(`${chalk.red('✗')} [${task.characterSlug}] ${task.filename} (Error: ${(err as Error).message})`);
    } finally {
      completed++;
    }
  }

  // Execute pool
  const executing = new Set<Promise<void>>();
  
  for (const task of tasks) {
    const p = worker(task).then(() => { executing.delete(p); });
    executing.add(p);
    
    if (executing.size >= CONCURRENCY_LIMIT) {
      await Promise.race(executing);
    }
  }
  
  // Wait for remainder
  await Promise.all(executing);

  // 4. Save Results
  console.log(chalk.dim('\n----------------------------------------'));
  console.log(chalk.blue('Saving results...'));

  for (const [slug, newEntries] of resultsBySlug.entries()) {
    const data = characterDataCache.get(slug);
    if (!data) continue;

    if (!data.image_inventory) {
      data.image_inventory = [];
    }
    
    data.image_inventory.push(...newEntries);
    await writeImageryYaml('character', slug, data);
    console.log(`  Updated ${slug}: +${newEntries.length} entries`);
  }

  console.log(chalk.green.bold('\nBatch Analysis Complete!'));
  console.log(`Total: ${tasks.length} | Success: ${success} | Failed: ${failed}`);
}

main().catch(console.error);

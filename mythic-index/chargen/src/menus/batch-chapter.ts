/**
 * Batch chapter generation menu
 * UI for generating images across multiple chapters
 */

import { select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { getCachedChapters } from '../services/entity-cache.js';
import {
  discoverBatchTargets,
  getBatchTargets,
  generateAllChapterImages,
  formatDuration,
  estimateTime,
  type BatchGenerationOptions,
  type BatchProgress,
} from '../services/batch-generator.js';
import {
  showSection,
  showSectionBox,
  showInfo,
  showSuccess,
  showError,
  showWarning,
  showListItem,
  showStat,
  createProgressBar,
  newLine,
} from '../ui/display.js';
import type { ChapterImageType } from '../types/chapter-imagery.js';

const IMAGE_TYPES: ChapterImageType[] = ['hero', 'anchor', 'mood', 'detail', 'symbol', 'pivot'];

/**
 * Display batch generation progress with progress bar
 */
function displayProgress(progress: BatchProgress): void {
  // Use progress bar for overall image completion
  const progressBar = createProgressBar(progress.completedTargets, progress.totalTargets, 25);

  // Overwrite current line with progress
  process.stdout.write(`\r  ${progressBar}  `);
  process.stdout.write(
    chalk.green(`✓${progress.successCount}`) +
      chalk.dim('/') +
      chalk.red(`✗${progress.errorCount}`) +
      chalk.dim('/') +
      chalk.yellow(`⊘${progress.skippedCount}`) +
      chalk.dim(` [${progress.currentChapter}]`)
  );
}

/**
 * Run the batch chapter generation workflow
 */
export async function runBatchChapterGeneration(): Promise<void> {
  showSectionBox('BATCH CHAPTER GENERATION');

  // Get all chapters with imagery
  const chaptersWithImagery = getCachedChapters().filter((ch) => ch.hasImagery);

  if (chaptersWithImagery.length === 0) {
    showWarning('No chapters with imagery.yaml files found');
    newLine();
    return;
  }

  // Discover all targets
  showInfo('Scanning chapters...');
  const discovery = await discoverBatchTargets({});

  if (discovery.totalTargets === 0) {
    showWarning('No image targets found in any chapter');
    newLine();
    return;
  }

  newLine();
  showInfo(`Found ${discovery.totalChapters} chapters with ${discovery.totalTargets} total images`);
  if (discovery.totalGenerated > 0) {
    showInfo(`${discovery.totalGenerated} images already generated`);
  }
  newLine();

  // Step 1: Select chapters
  const chapterSelection = await select<'all' | 'select'>({
    message: 'Which chapters to process?',
    choices: [
      {
        name: `All chapters (${discovery.totalChapters})`,
        value: 'all',
      },
      {
        name: 'Select specific chapters',
        value: 'select',
      },
    ],
  });

  let selectedChapters: string[] | undefined;

  if (chapterSelection === 'select') {
    const choices = discovery.chapters.map((ch) => ({
      name: `${ch.title} ${chalk.dim(`(${ch.targetCount} images, ${ch.generatedCount} done)`)}`,
      value: ch.slug,
      checked: false,
    }));

    selectedChapters = await checkbox<string>({
      message: 'Select chapters (space to toggle):',
      choices,
    });

    if (selectedChapters.length === 0) {
      showWarning('No chapters selected');
      newLine();
      return;
    }
  }

  // Step 2: Select image types
  const typeSelection = await select<'all' | 'select'>({
    message: 'Which image types to generate?',
    choices: [
      {
        name: 'All types',
        value: 'all',
      },
      {
        name: 'Select specific types',
        value: 'select',
      },
    ],
  });

  let selectedTypes: ChapterImageType[] | undefined;

  if (typeSelection === 'select') {
    selectedTypes = await checkbox<ChapterImageType>({
      message: 'Select image types (space to toggle):',
      choices: IMAGE_TYPES.map((t) => ({
        name: t,
        value: t,
        checked: t === 'hero', // Default select hero
      })),
    });

    if (selectedTypes.length === 0) {
      showWarning('No image types selected');
      newLine();
      return;
    }
  }

  // Step 3: Skip already generated?
  const skipGenerated = await confirm({
    message: 'Skip images that have already been generated?',
    default: true,
  });

  // Build options
  const options: BatchGenerationOptions = {
    chapters: selectedChapters,
    imageTypes: selectedTypes,
    skipGenerated,
    dryRun: false,
  };

  // Preview what will be generated
  showSectionBox('PHASE 1/2: PREVIEW');
  const targets = await getBatchTargets(options);

  if (targets.length === 0) {
    showWarning('No images to generate (all may have been skipped)');
    newLine();
    return;
  }

  // Group by chapter for display
  const byChapter = new Map<string, typeof targets>();
  for (const t of targets) {
    const existing = byChapter.get(t.chapterSlug) || [];
    existing.push(t);
    byChapter.set(t.chapterSlug, existing);
  }

  console.log(chalk.bold('\nImages to generate:\n'));
  for (const [slug, chapterTargets] of byChapter) {
    const title = chapterTargets[0].chapterTitle;
    showListItem(`${title} ${chalk.dim(`(${slug})`)}`, `${chapterTargets.length} image(s)`);
  }

  newLine();
  const estimate = estimateTime(targets.length);
  showInfo(`Total: ${targets.length} images across ${byChapter.size} chapters`);
  showInfo(`Estimated time: ${estimate}`);
  newLine();

  // Confirm
  const proceed = await confirm({
    message: `Proceed with generation?`,
    default: true,
  });

  if (!proceed) {
    showInfo('Generation cancelled');
    newLine();
    return;
  }

  // Execute generation
  showSectionBox('PHASE 2/2: GENERATING IMAGES');
  showInfo('Press Ctrl+C to cancel');
  newLine();

  const result = await generateAllChapterImages(options, displayProgress);

  // Clear the progress line and show results
  console.log();
  newLine();
  showSectionBox('COMPLETE');

  const duration = formatDuration(result.startTime, result.endTime);
  const totalProcessed = result.progress.successCount + result.progress.errorCount + result.progress.skippedCount;
  const throughput = totalProcessed > 0 ? (totalProcessed / (parseFloat(duration) || 1)).toFixed(1) : '0';

  console.log(chalk.bold('Summary:'));
  showStat('Total processed', totalProcessed);
  showStat('Succeeded', chalk.green(String(result.progress.successCount)));
  if (result.progress.errorCount > 0) {
    showStat('Failed', chalk.red(String(result.progress.errorCount)));
  }
  if (result.progress.skippedCount > 0) {
    showStat('Skipped', chalk.yellow(String(result.progress.skippedCount)));
  }
  showStat('Duration', duration);

  // Show errors if any (limit to 5)
  if (result.errors.length > 0) {
    newLine();
    showWarning('Errors encountered:');
    for (const err of result.errors.slice(0, 5)) {
      console.log(chalk.dim(`  • ${err.chapter}/${err.target}: ${err.error}`));
    }
    if (result.errors.length > 5) {
      console.log(chalk.dim(`  ... and ${result.errors.length - 5} more`));
    }
  }

  newLine();

  if (result.success) {
    showSuccess('Batch generation completed successfully!');
  } else {
    showError(`Batch generation completed with ${result.errors.length} error(s)`);
  }

  newLine();
}

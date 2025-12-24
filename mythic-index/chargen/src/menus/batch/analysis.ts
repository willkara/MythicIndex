/**
 * Batch image analysis workflows
 *
 * Handles character image analysis including:
 * - Basic enhanced metadata analysis
 * - Full scaffold & analyze (appearance extraction + image analysis)
 */

import { select, confirm, input } from '@inquirer/prompts';
import chalk from 'chalk';
import {
  showSection,
  showInfo,
  showSuccess,
  showError,
  showWarning,
  showListItem,
  newLine,
  showSectionBox,
  showCostEstimate,
  showStat,
} from '../../ui/display.js';
import type { BatchTask, BatchPlan, BatchConfig } from '../../types/batch.js';
import { executeBatchPipeline } from './generation.js';
import {
  planAnalysisTasks,
  discoverCharactersNeedingAnalysis,
  type AnalysisPlannerOptions,
  planCharacterAnalysisTasks,
  discoverCharactersNeedingFullAnalysis,
  type CharacterAnalysisPlannerOptions,
} from '../../services/batch/planners/index.js';
import { analyzeImageEnhanced } from '../../services/image-analysis.js';
import {
  readImageryYaml,
  writeImageryYaml,
  getImagesDir,
  type CharacterImagery,
  type ImageInventoryEntry,
} from '../../services/imagery-yaml.js';
import { existsSync } from 'fs';
import { getConfig } from '../../services/config.js';
import { getModel } from '../../config/index.js';
import { getApiKey } from './helpers.js';

/**
 * Character image analysis workflow
 */
export async function runAnalysisWorkflow(): Promise<void> {
  showSection('Character Image Analysis');
  showInfo('Generate enhanced metadata for character images');
  newLine();

  // Check API key
  const apiKey = getApiKey();
  if (!apiKey) {
    showError('Google API key not configured. Please set it in settings first.');
    newLine();
    return;
  }

  // Step 1: Select scope
  const scopeChoice = await select<'all' | 'specific'>({
    message: 'Which characters to analyze?',
    choices: [
      {
        name: 'All Characters',
        value: 'all',
        description: 'Analyze images for all characters',
      },
      {
        name: 'Specific Character',
        value: 'specific',
        description: 'Analyze images for a specific character',
      },
    ],
  });

  let slugFilter: string[] | undefined;
  if (scopeChoice === 'specific') {
    const slugInput = await input({
      message: 'Enter character slug:',
    });
    slugFilter = [slugInput.trim()];
  }

  // Step 2: Re-analyze option
  const reAnalyze = await confirm({
    message: 'Re-analyze images that already have enhanced metadata?',
    default: false,
  });

  // Step 3: Discover what needs analysis
  showSection('Discovery');
  showInfo('Scanning character images...');
  newLine();

  const discovery = await discoverCharactersNeedingAnalysis({
    slugFilter,
    skipEnhanced: !reAnalyze,
    reAnalyze,
  });

  if (discovery.totalNeedingAnalysis === 0) {
    showSuccess('All character images already have enhanced metadata!');
    newLine();
    return;
  }

  // Show discovery summary
  showSectionBox('DISCOVERY SUMMARY');
  showStat('Characters with images', discovery.characters.length);
  showStat('Total images needing analysis', discovery.totalNeedingAnalysis);
  newLine();

  // Show character breakdown
  console.log(chalk.bold('Characters:'));
  const maxShow = 10;
  for (let i = 0; i < Math.min(discovery.characters.length, maxShow); i++) {
    const char = discovery.characters[i];
    showListItem(
      char.slug,
      `${char.imagesNeedingAnalysis}/${char.totalImages} images need analysis`
    );
  }
  if (discovery.characters.length > maxShow) {
    console.log(chalk.dim(`  ... and ${discovery.characters.length - maxShow} more`));
  }
  newLine();

  // Step 4: Confirm and execute
  const proceed = await confirm({
    message: `Analyze ${discovery.totalNeedingAnalysis} images?`,
    default: true,
  });

  if (!proceed) {
    showInfo('Analysis cancelled.');
    newLine();
    return;
  }

  // Execute analysis
  await executeAnalysisBatch(slugFilter, reAnalyze, apiKey);
}

/**
 * Execute batch analysis of character images
 */
async function executeAnalysisBatch(
  slugFilter: string[] | undefined,
  reAnalyze: boolean,
  _apiKey: string
): Promise<void> {
  showSection('Executing Analysis');

  const model = getModel('batch_analysis');
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  const options: AnalysisPlannerOptions = {
    slugFilter,
    skipEnhanced: !reAnalyze,
    reAnalyze,
    model,
  };

  // Plan the tasks
  const planResult = await planAnalysisTasks(options);

  if (planResult.tasks.length === 0) {
    showSuccess('No analysis tasks to execute.');
    newLine();
    return;
  }

  console.log(`\nAnalyzing ${planResult.tasks.length} images via batch pipeline...\n`);

  // Generate run ID
  const { generateRunId } = await import('../../services/batch/state.js');
  const runId = generateRunId();

  // Get default config
  const { getDefaultConfig } = await import('./helpers.js');
  const config = getDefaultConfig();

  // Create batch plan from analysis tasks
  const batchPlan: BatchPlan = {
    runId,
    createdAt: new Date().toISOString(),
    scope: {
      entityTypes: ['character'],
      entityFilter: options.slugFilter,
      kinds: ['analyze'],
    },
    config,
    summary: {
      totalTasks: planResult.tasks.length,
      byEntityType: { character: planResult.tasks.length, location: 0, chapter: 0 },
      byKind: { generate: 0, analyze: planResult.tasks.length },
      skippedAlreadyGenerated: planResult.summary.skipped,
    },
    tasks: planResult.tasks,
  };

  // Execute via unified batch pipeline (upload → submit → execute → apply)
  await executeBatchPipeline(batchPlan, config, _apiKey);

  // Show planning errors if any
  if (planResult.summary.errors.length > 0) {
    newLine();
    showWarning('Errors encountered during planning:');
    for (const error of planResult.summary.errors.slice(0, 5)) {
      console.log(chalk.dim(`  ${error}`));
    }
    if (planResult.summary.errors.length > 5) {
      console.log(chalk.dim(`  ... and ${planResult.summary.errors.length - 5} more`));
    }
  }

  newLine();
}

/**
 * Scaffold & Analyze Character Imagery workflow
 *
 * This replicates analyze_character_images.py:
 * 1. Multimodal appearance extraction (profile.md + portrait.png as "gospel truth")
 * 2. Full image analysis using the Archivist prompt template
 * 3. Populated image_inventory with rich metadata
 */
export async function runScaffoldAnalyzeWorkflow(): Promise<void> {
  showSection('Scaffold & Analyze Character Imagery');
  showInfo('Multimodal appearance extraction + full image analysis');
  showInfo('Portrait.png is treated as the "gospel truth" for appearance');
  newLine();

  // Check API key
  const apiKey = getApiKey();
  if (!apiKey) {
    showError('Google API key not configured. Please set it in settings first.');
    newLine();
    return;
  }

  // Step 1: Select scope
  const scopeChoice = await select<'all' | 'specific'>({
    message: 'Which characters to analyze?',
    choices: [
      {
        name: 'All Characters',
        value: 'all',
        description: 'Analyze all characters with missing appearance or images',
      },
      {
        name: 'Specific Characters',
        value: 'specific',
        description: 'Filter by character slug(s)',
      },
    ],
  });

  let slugFilter: string[] | undefined;
  if (scopeChoice === 'specific') {
    const slugInput = await input({
      message: 'Enter character slug(s) (comma-separated):',
    });
    slugFilter = slugInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Step 2: Force re-analyze option
  const forceReanalyze = await confirm({
    message: 'Force re-analyze existing appearance and images?',
    default: false,
  });

  // Step 3: Discover what needs analysis
  showSection('Discovery');
  showInfo('Scanning characters for missing appearance and image metadata...');
  newLine();

  const discovery = await discoverCharactersNeedingFullAnalysis({
    slugFilter,
    skipAnalyzed: !forceReanalyze,
    forceReanalyze,
  });

  const totalTasks = discovery.totalAppearanceTasks + discovery.totalImageTasks;

  if (totalTasks === 0) {
    showSuccess('All characters already have complete imagery.yaml files!');
    newLine();
    return;
  }

  // Show discovery summary
  showSectionBox('DISCOVERY SUMMARY');

  console.log('Characters found:');
  showStat('Total', discovery.characters.length);
  showStat('Need appearance', discovery.totalAppearanceTasks);
  showStat('Images to analyze', discovery.totalImageTasks);
  newLine();

  // Show character breakdown
  console.log('Character breakdown:');
  const maxShow = 10;
  for (let i = 0; i < Math.min(discovery.characters.length, maxShow); i++) {
    const char = discovery.characters[i];
    const portrait = char.hasPortrait ? chalk.green('✓ portrait') : chalk.yellow('⚠ no portrait');
    const appearance = char.needsAppearance ? chalk.yellow('needs appearance') : chalk.green('has appearance');
    const images = char.imagesNeedingAnalysis > 0
      ? chalk.yellow(`${char.imagesNeedingAnalysis}/${char.totalImages} images`)
      : chalk.green(`${char.totalImages} analyzed`);
    console.log(`  ${char.slug}: ${portrait}, ${appearance}, ${images}`);
  }
  if (discovery.characters.length > maxShow) {
    console.log(chalk.dim(`  ... and ${discovery.characters.length - maxShow} more`));
  }
  newLine();

  // Cost estimate
  console.log('Cost Estimate:');
  // Batch pricing: ~$0.067 per task (50% discount)
  const standardCost = totalTasks * 0.134;
  const batchCost = totalTasks * 0.067;
  showCostEstimate(standardCost, batchCost);
  newLine();

  // Step 4: Confirm
  const proceed = await confirm({
    message: `Proceed with ${totalTasks} analysis tasks?`,
    default: true,
  });

  if (!proceed) {
    showInfo('Analysis cancelled.');
    newLine();
    return;
  }

  // Step 5: Execute the analysis
  showSection('Executing Analysis');

  const model = getModel('batch_analysis');

  const options: CharacterAnalysisPlannerOptions = {
    slugFilter,
    skipAnalyzed: !forceReanalyze,
    forceReanalyze,
    model,
  };

  // Plan the tasks
  const planResult = await planCharacterAnalysisTasks(options);

  if (planResult.tasks.length === 0) {
    showSuccess('No analysis tasks to execute.');
    newLine();
    return;
  }

  console.log(`\nProcessing ${planResult.summary.appearanceTasks} appearance + ${planResult.summary.imageTasks} image tasks via batch pipeline...\n`);

  // Generate run ID
  const { generateRunId } = await import('../../services/batch/state.js');
  const runId = generateRunId();

  // Get default config
  const { getDefaultConfig } = await import('./helpers.js');
  const config = getDefaultConfig();

  // Create batch plan from analysis tasks
  const batchPlan: BatchPlan = {
    runId,
    createdAt: new Date().toISOString(),
    scope: {
      entityTypes: ['character'],
      entityFilter: slugFilter,
      kinds: ['analyze'],
    },
    config,
    summary: {
      totalTasks: planResult.tasks.length,
      byEntityType: { character: planResult.tasks.length, location: 0, chapter: 0 },
      byKind: { generate: 0, analyze: planResult.tasks.length },
      skippedAlreadyGenerated: planResult.summary.skipped,
    },
    tasks: planResult.tasks,
  };

  // Execute via unified batch pipeline (upload → submit → execute → apply)
  await executeBatchPipeline(batchPlan, config, apiKey);

  // Show planning errors if any
  if (planResult.summary.errors.length > 0) {
    newLine();
    showWarning('Errors encountered during planning:');
    for (const error of planResult.summary.errors.slice(0, 5)) {
      console.log(chalk.dim(`  ${error}`));
    }
    if (planResult.summary.errors.length > 5) {
      console.log(chalk.dim(`  ... and ${planResult.summary.errors.length - 5} more`));
    }
  }

  newLine();
}

/**
 * Process an appearance extraction task
 */
async function processAppearanceTask(task: BatchTask, progress: string): Promise<void> {
  const { GoogleGenAI } = await import('@google/genai');

  console.log(chalk.dim(`${progress} Extracting appearance for ${task.entitySlug}...`));

  const config = getConfig();
  const googleConfig = config.imageGeneration.providers.google;

  if (!googleConfig?.apiKey) {
    throw new Error('Google API key not configured');
  }

  const client = new GoogleGenAI({ apiKey: googleConfig.apiKey });
  const model = getModel('image_analysis');

  // Build content parts
  type ContentPart = { text: string } | { inlineData: { mimeType: string; data: string } };
  const contentParts: ContentPart[] = [];

  // Add reference images (portrait) first
  for (const ref of task.referenceImages) {
    const imageBuffer = await import('fs/promises').then((fs) => fs.readFile(ref.path));
    const base64Image = imageBuffer.toString('base64');
    contentParts.push({ inlineData: { mimeType: ref.mime, data: base64Image } });
  }

  // Add prompt text
  contentParts.push({ text: task.prompt });

  // Call Gemini API
  const response = await client.models.generateContent({
    model,
    contents: [{ role: 'user', parts: contentParts }],
  });

  const responseText = response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

  if (!responseText) {
    throw new Error('Empty response from Gemini');
  }

  // Load or create imagery.yaml
  let charImagery = (await readImageryYaml('character', task.entitySlug)) as CharacterImagery | null;

  if (!charImagery) {
    charImagery = {
      entity_type: 'character',
      slug: task.entitySlug,
      appearance: '',
      prompts: [],
      image_inventory: [],
    };
  }

  // Update appearance
  charImagery.appearance = responseText;

  // Write back
  await writeImageryYaml('character', task.entitySlug, charImagery);

  // Ensure portrait.png is marked as the reference portrait if it exists
  await ensureReferencePortraitEntry(task.entitySlug);

  console.log(chalk.green(`${progress} ${task.entitySlug} - Appearance extracted ✓`));
}

/**
 * Process an image analysis task
 */
async function processImageAnalysisTask(task: BatchTask, progress: string): Promise<void> {
  const imagePath = task.referenceImages?.[0]?.path;
  if (!imagePath) {
    throw new Error('No image path in task');
  }

  const filename = imagePath.split('/').pop() || 'unknown.png';
  console.log(chalk.dim(`${progress} Analyzing ${task.entitySlug}/${filename}...`));

  // Load existing imagery.yaml to get appearance
  const existingImagery = await readImageryYaml('character', task.entitySlug);
  const charImagery = existingImagery as CharacterImagery | null;

  if (!charImagery) {
    throw new Error('No imagery.yaml found - run appearance extraction first');
  }

  const appearance = charImagery.appearance || '';

  // Run enhanced analysis
  const characterName = (task.targetMetadata?.name as string) || task.entitySlug;
  const analysisResult = await analyzeImageEnhanced({
    imagePath,
    characterName,
    slug: task.entitySlug,
    appearance,
    filename,
    enhanced: true,
  });

  if (!analysisResult.success || !analysisResult.entry) {
    throw new Error(analysisResult.error || 'Analysis failed');
  }

  // Update imagery.yaml
  const newEntry = analysisResult.entry;
  const inventory = charImagery.image_inventory || [];

  // Find existing entry by path
  const normalizedPath = newEntry.path?.replace(/^images\//, '') || filename;
  const existingIndex = inventory.findIndex(
    (e) =>
      e.path === newEntry.path ||
      e.path === `images/${normalizedPath}` ||
      e.path?.replace(/^images\//, '') === normalizedPath
  );

  if (existingIndex >= 0) {
    // Update existing entry, preserving id
    const existingId = inventory[existingIndex].id;
    inventory[existingIndex] = { ...newEntry, id: existingId };
  } else {
    // Add new entry
    inventory.push(newEntry);
  }

  charImagery.image_inventory = inventory;

  // Write back
  await writeImageryYaml('character', task.entitySlug, charImagery);

  console.log(chalk.green(`${progress} ${task.entitySlug}/${filename} - Analyzed ✓`));
}

/**
 * Ensure portrait.png has an explicit entry in imagery.yaml marked as the reference portrait
 *
 * This ensures the canonical reference portrait is properly tracked in the image_inventory
 * with `is_reference_portrait: true`, making it the "gospel truth" for character appearance.
 */
async function ensureReferencePortraitEntry(slug: string): Promise<void> {
  const imagesDir = getImagesDir('character', slug);
  const portraitPath = `${imagesDir}/portrait.png`;

  // Only add entry if portrait.png exists
  if (!existsSync(portraitPath)) {
    return;
  }

  const existingImagery = await readImageryYaml('character', slug);
  const charImagery = existingImagery as CharacterImagery | null;

  if (!charImagery) {
    return;
  }

  const inventory = charImagery.image_inventory || [];

  // Check if already exists (either by path or is_reference_portrait flag)
  const existingIndex = inventory.findIndex(
    (e) =>
      e.path === 'images/portrait.png' ||
      e.is_reference_portrait === true
  );

  // Build the reference portrait entry
  const portraitEntry: ImageInventoryEntry = {
    id: 'portrait',
    path: 'images/portrait.png',
    type: 'imported',
    status: 'approved',
    image_type: 'portrait',
    is_reference_portrait: true,
    content: {
      title: 'Reference Portrait',
      description: 'The canonical reference portrait - source of truth for character appearance.',
      alt_text: `${slug} reference portrait`,
      tags: ['reference', 'portrait', 'canonical'],
    },
    provenance: {
      source: 'reference',
      created_at: new Date().toISOString(),
      original_filename: 'portrait.png',
    },
  };

  if (existingIndex >= 0) {
    // Update existing entry, preserving any additional fields
    inventory[existingIndex] = { ...inventory[existingIndex], ...portraitEntry };
  } else {
    // Add new entry at the beginning (reference portrait should be first)
    inventory.unshift(portraitEntry);
  }

  charImagery.image_inventory = inventory;
  await writeImageryYaml('character', slug, charImagery);
}

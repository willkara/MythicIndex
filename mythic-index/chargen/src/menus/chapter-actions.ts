/**
 * Chapter actions menu
 * Provides target selection, prompt preview, and generation workflow
 */

import { select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { ChapterCacheEntry } from '../types/entity-cache.js';
import {
  showSection,
  showInfo,
  showSuccess,
  showError,
  showWarning,
  showListItem,
  newLine,
} from '../ui/display.js';
import { logStep, logPhase, logCompilationMode, logSectionBreakdown } from '../ui/log.js';
import {
  listTargets,
  compilePromptIR,
  summarizeIR,
  validateIR,
  loadChapterContext,
  readChapterImagery,
} from '../services/prompt-compiler/index.js';
import type { TargetMetadata } from '../types/prompt-ir.js';
import { formatPromptForDisplay } from '../services/prompt-renderer.js';
import { appendRun, createGenerationRun } from '../services/imagery-yaml.js';
import { generateFromIR, prepareIRPrompt } from '../services/images/index.js';

type ChapterAction = 'list' | 'context' | 'preview' | 'generate' | 'back';

interface TargetInfo {
  slug: string;
  name: string;
  type: string;
}

/**
 * Run the chapter actions menu
 */
export async function runChapterActionsMenu(chapter: ChapterCacheEntry): Promise<void> {
  let running = true;

  while (running) {
    showSection(`Chapter: ${chapter.title || chapter.slug}`);
    if (chapter.chapterNumber) {
      showInfo(`Chapter ${chapter.chapterNumber}`);
    }
    showInfo(`Slug: ${chapter.slug}`);
    if (chapter.hasImagery) {
      showInfo(`Has imagery.yaml with ${chapter.imageCount} image targets`);
    } else {
      showWarning('No imagery.yaml file found');
    }
    newLine();

    const action = await select<ChapterAction>({
      message: 'What would you like to do?',
      choices: [
        {
          name: 'List Image Targets',
          value: 'list',
          description: 'Show all images defined for generation',
        },
        {
          name: 'Show Resolved Context',
          value: 'context',
          description: 'Show resolved characters and locations',
        },
        {
          name: 'Preview Compiled Prompts',
          value: 'preview',
          description: 'Compile IR and show final prompts before generation',
        },
        {
          name: 'Generate Images',
          value: 'generate',
          description: 'Select targets and generate images',
        },
        {
          name: chalk.dim('Back'),
          value: 'back',
        },
      ],
    });

    switch (action) {
      case 'list':
        await listChapterTargets(chapter);
        break;
      case 'context':
        await showChapterContext(chapter);
        break;
      case 'preview':
        await previewChapterPrompts(chapter);
        break;
      case 'generate':
        await generateChapterImages(chapter);
        break;
      case 'back':
        running = false;
        break;
    }
  }
}

/**
 * List all image targets for a chapter
 */
async function listChapterTargets(chapter: ChapterCacheEntry): Promise<void> {
  showSection('Image Targets');

  try {
    const { targets } = await listTargets('chapter', chapter.slug);

    if (targets.length === 0) {
      showWarning('No image targets found. Check if imagery.yaml exists and has images.');
      newLine();
      return;
    }

    console.log(chalk.bold('\nAvailable Images:\n'));

    for (const target of targets) {
      const typeColor = getTypeColor(target.type);
      showListItem(target.name, `Type: ${target.type}`, typeColor);
    }

    newLine();
    showInfo(`Total: ${targets.length} image target(s)`);
    newLine();
  } catch (error) {
    showError(`Failed to list targets: ${(error as Error).message}`);
    newLine();
  }
}

/**
 * Show resolved context (characters and locations)
 */
async function showChapterContext(chapter: ChapterCacheEntry): Promise<void> {
  showSection('Resolved Context');

  try {
    const context = await loadChapterContext(chapter.slug, { verbose: true });
    if (!context) {
      showWarning('Could not load chapter context');
      newLine();
      return;
    }

    // Show characters
    console.log(chalk.bold('\nCharacters:\n'));
    if (context.characters.size === 0) {
      console.log(chalk.dim('  (none)'));
    } else {
      for (const [slug, char] of context.characters) {
        console.log(`  ${chalk.cyan('●')} ${chalk.bold(char.name)} ${chalk.dim(`(${slug})`)}`);
        console.log(`    Portraits: ${char.portrait_paths.length}`);
        if (char.scene_variations) {
          const variationPreview = char.scene_variations.substring(0, 80);
          console.log(`    Scene Variations: ${chalk.dim(variationPreview)}...`);
        }
      }
    }

    // Show locations
    console.log(chalk.bold('\nLocations:\n'));
    if (context.locations.size === 0) {
      console.log(chalk.dim('  (none)'));
    } else {
      for (const [slug, loc] of context.locations) {
        const zoneCount = Object.keys(loc.zones).length;
        console.log(`  ${chalk.yellow('●')} ${chalk.bold(loc.name)} ${chalk.dim(`(${slug})`)}`);
        console.log(`    Zones: ${zoneCount}`);
        if (zoneCount > 0) {
          const zoneNames = Object.keys(loc.zones).slice(0, 5).join(', ');
          console.log(`    ${chalk.dim(zoneNames)}`);
        }
      }
    }

    newLine();
  } catch (error) {
    showError(`Failed to load context: ${(error as Error).message}`);
    newLine();
  }
}

/**
 * Preview compiled prompts for selected targets
 */
async function previewChapterPrompts(chapter: ChapterCacheEntry): Promise<void> {
  const targets = await selectTargets(chapter);
  if (targets.length === 0) return;

  showSection('Compiled Prompt Preview');

  for (const target of targets) {
    console.log(chalk.bold.cyan(`\n═══ ${target.name} ═══\n`));

    try {
      const ir = await compilePromptIR('chapter', chapter.slug, target.slug);
      if (!ir) {
        showWarning(`Could not compile IR for ${target.slug}`);
        continue;
      }

      // Validate
      const validation = validateIR(ir);
      if (!validation.valid) {
        showError('Validation errors:');
        validation.errors.forEach((e) => console.log(chalk.red(`  - ${e}`)));
      }
      if (validation.warnings.length > 0) {
        showWarning('Warnings:');
        validation.warnings.forEach((w) => console.log(chalk.yellow(`  - ${w}`)));
      }

      // Show summary
      const summary = summarizeIR(ir);
      console.log(chalk.dim('Summary:'));
      console.log(`  Target: ${summary.target}`);
      console.log(`  Type: ${summary.type}`);
      console.log(`  Mood: ${summary.mood || 'not set'}`);
      console.log(`  Constraints: ${summary.constraintSummary}`);
      console.log(`  References: ${summary.referenceCount} image(s)`);
      console.log(`  Negative terms: ${summary.negativeSummary}`);
      newLine();

      // Render and display
      const prepared = prepareIRPrompt('chapter', ir);
      console.log(formatPromptForDisplay(prepared.rendered));
    } catch (error) {
      showError(`Failed to compile ${target.slug}: ${(error as Error).message}`);
    }
  }

  newLine();
}

/**
 * Generate images for selected targets
 */
async function generateChapterImages(chapter: ChapterCacheEntry): Promise<void> {
  const targets = await selectTargets(chapter);
  if (targets.length === 0) return;

  showSection('Generate Images');
  showInfo(`Selected ${targets.length} target(s) for generation`);
  newLine();

  // Load chapter context with verbose logging
  logPhase('Loading chapter context...');
  await loadChapterContext(chapter.slug, { verbose: true });
  newLine();

  // Read chapter imagery for metadata
  const imagery = await readChapterImagery(chapter.slug);
  const imageSpecMap = new Map((imagery?.images || []).map((spec) => [spec.custom_id, spec]));

  // Compile all IRs first
  const compiledTargets: {
    target: TargetInfo;
    ir: NonNullable<Awaited<ReturnType<typeof compilePromptIR>>>;
    prepared: ReturnType<typeof prepareIRPrompt>;
  }[] = [];

  for (const target of targets) {
    try {
      logPhase(`Compiling prompt for "${target.slug}"...`);
      const ir = await compilePromptIR('chapter', chapter.slug, target.slug);
      if (ir) {
        // Log compilation details
        const hasPromptUsed = ir.positive.subject.some((s) => s.source === 'prompt_used');
        logCompilationMode(hasPromptUsed);

        // Log characters depicted
        const depictedChars = ir.positive.subject
          .filter((s) => s.source === 'character_appearance')
          .map((s) => s.content.split(',')[0])
          .slice(0, 3);
        if (depictedChars.length > 0) {
          logStep(`Characters depicted: ${depictedChars.join(', ')}`);
        }

        // Log location if present
        if (ir.positive.composition.some((s) => s.source === 'location_visual_anchor')) {
          logStep(`Location: ${ir.entity_slug}`);
        }

        // Log section breakdown
        logSectionBreakdown(ir.positive);

        // Log negative prompt count
        if (ir.negative.length > 0) {
          logStep(`Negative prompt: ${ir.negative.length} terms`);
        }

        // Log reference count
        logStep(`References resolved: ${ir.references.filter((r) => r.exists).length} image(s)`);

        const prepared = prepareIRPrompt('chapter', ir);
        compiledTargets.push({ target, ir, prepared });
      } else {
        showWarning(`Skipping ${target.slug}: could not compile IR`);
      }
    } catch (error) {
      showError(`Failed to compile ${target.slug}: ${(error as Error).message}`);
    }
  }

  if (compiledTargets.length === 0) {
    showError('No targets could be compiled');
    newLine();
    return;
  }

  // Show what will be generated
  console.log(chalk.bold('\nTargets to generate:\n'));
  for (const { target, prepared } of compiledTargets) {
    const rendered = prepared.rendered;
    showListItem(
      target.name,
      `${rendered.char_count} chars, ${rendered.references.length} refs (${prepared.scenario})`
    );
  }
  newLine();

  // Confirm
  const proceed = await confirm({
    message: `Generate ${compiledTargets.length} image(s) using Google Gemini?`,
    default: true,
  });

  if (!proceed) {
    showInfo('Generation cancelled');
    newLine();
    return;
  }

  // Generate each target
  let successCount = 0;
  let errorCount = 0;

  for (const { target, ir, prepared } of compiledTargets) {
    console.log(chalk.cyan(`\nGenerating: ${target.name}...`));

    try {
      // Call the generation function
      const result = await generateFromIR('chapter', chapter.slug, ir, prepared);

      if (result.success) {
        showSuccess(`Generated: ${result.fileName}`);

        // Build target metadata from image spec
        const imageSpec = imageSpecMap.get(target.slug);
        const targetMetadata: TargetMetadata = {
          entity_type: 'chapter',
          entity_slug: chapter.slug,
          chapter_number: chapter.chapterNumber,
          chapter_title: chapter.title,
          custom_id: target.slug,
          scene_id: imageSpec?.scene_id,
          source_moment: imageSpec?.source_moment,
          image_type: imageSpec?.image_type || target.type,
          scene_mood: imageSpec?.scene_mood,
          category: imageSpec?.category,
          depicts_characters: imageSpec?.depicts_characters,
          location: imageSpec?.location,
          zone: imageSpec?.zone,
        };

        // Record the run
        const run = createGenerationRun({
          targetId: target.slug,
          fileName: result.fileName!,
          filePath: result.filePath!,
          model: result.model || 'gemini-3-pro-image-preview',
          irHash: prepared.rendered.ir_hash,
          promptUsed: prepared.rendered.prompt,
          negativePromptUsed: prepared.rendered.negative_prompt,
          referenceImages: prepared.rendered.references.map((r) => ({
            asset_id: `ref-${target.slug}`,
            path: r.path,
            role: r.role,
          })),
          constraints: {
            aspect_ratio: ir.constraints.aspect_ratio,
            size: ir.constraints.size,
            orientation: ir.constraints.orientation,
            quality: ir.constraints.quality,
          },
          providerMetadata: result.metadata,
          targetMetadata,
        });

        await appendRun('chapter', chapter.slug, run);
        successCount++;
      } else {
        showError(`Failed: ${result.error}`);
        errorCount++;
      }
    } catch (error) {
      showError(`Error generating ${target.slug}: ${(error as Error).message}`);
      errorCount++;
    }
  }

  newLine();
  showSection('Generation Complete');
  showInfo(`Success: ${successCount}, Errors: ${errorCount}`);
  newLine();
}

/**
 * Select targets for preview or generation
 */
async function selectTargets(chapter: ChapterCacheEntry): Promise<TargetInfo[]> {
  try {
    const { targets } = await listTargets('chapter', chapter.slug);

    if (targets.length === 0) {
      showWarning('No targets found. Check if imagery.yaml exists and has images.');
      newLine();
      return [];
    }

    if (targets.length === 1) {
      // Auto-select single target
      return targets;
    }

    const selected = await checkbox<string>({
      message: 'Select images (space to toggle, enter to confirm):',
      choices: targets.map((t) => ({
        name: `${t.name} ${chalk.dim(`[${t.type}]`)}`,
        value: t.slug,
        checked: t.type === 'hero', // Default select hero images
      })),
    });

    return targets.filter((t) => selected.includes(t.slug));
  } catch (error) {
    showError(`Failed to load targets: ${(error as Error).message}`);
    newLine();
    return [];
  }
}

/**
 * Get color for image type
 */
function getTypeColor(type: string): (text: string) => string {
  const colors: Record<string, (text: string) => string> = {
    hero: chalk.magenta,
    anchor: chalk.red,
    mood: chalk.blue,
    detail: chalk.green,
    symbol: chalk.yellow,
    pivot: chalk.cyan,
    character: chalk.white,
  };
  return colors[type] || chalk.gray;
}

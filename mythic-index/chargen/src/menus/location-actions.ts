/**
 * Location actions menu
 * Provides target selection, prompt preview, and generation workflow
 */

import { select, checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import type { LocationCacheEntry } from '../types/entity-cache.js';
import {
  showSection,
  showInfo,
  showSuccess,
  showError,
  showWarning,
  showListItem,
  newLine,
} from '../ui/display.js';
import { logStep, logPhase, logSectionBreakdown } from '../ui/log.js';
import {
  listTargets,
  compilePromptIR,
  summarizeIR,
  validateIR,
} from '../services/prompt-compiler/index.js';
import { compileLocationOverview } from '../services/prompt-compiler/location-compiler.js';
import { formatPromptForDisplay } from '../services/prompt-renderer.js';
import {
  appendLocationImageInventory,
  createGeneratedImageInventoryEntry,
} from '../services/imagery-yaml.js';
import { readLocationImagery } from '../services/asset-registry.js';
import type { TargetMetadata } from '../types/prompt-ir.js';
import { generateFromIR, prepareIRPrompt } from '../services/images/index.js';

type LocationAction = 'list' | 'preview' | 'generate' | 'back';

interface TargetInfo {
  slug: string;
  name: string;
  type: string;
}

/**
 * Run the location actions menu
 */
export async function runLocationActionsMenu(location: LocationCacheEntry): Promise<void> {
  let running = true;

  while (running) {
    showSection(`Location: ${location.name}`);
    showInfo(`Slug: ${location.slug}`);
    if (location.hasImagery) {
      showInfo(`Has imagery.yaml with ${location.imageCount} existing images`);
    } else {
      showWarning('No imagery.yaml file found');
    }
    newLine();

    const action = await select<LocationAction>({
      message: 'What would you like to do?',
      choices: [
        {
          name: 'List Compilation Targets',
          value: 'list',
          description: 'Show overview and zones available for generation',
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
        await listLocationTargets(location);
        break;
      case 'preview':
        await previewLocationPrompts(location);
        break;
      case 'generate':
        await generateLocationImages(location);
        break;
      case 'back':
        running = false;
        break;
    }
  }
}

/**
 * List all compilation targets for a location
 */
async function listLocationTargets(location: LocationCacheEntry): Promise<void> {
  showSection('Compilation Targets');

  try {
    const { targets } = await listTargets('location', location.slug);

    if (targets.length === 0) {
      showWarning('No targets found. Check if imagery.yaml exists and has overview/zones.');
      newLine();
      return;
    }

    console.log(chalk.bold('\nAvailable Targets:\n'));

    for (const target of targets) {
      const typeColor = target.type === 'establishing' ? chalk.cyan : chalk.yellow;
      showListItem(
        `${target.name} ${chalk.dim(`(${target.slug})`)}`,
        `Type: ${target.type}`,
        typeColor
      );
    }

    newLine();
    showInfo(`Total: ${targets.length} target(s)`);
    newLine();
  } catch (error) {
    showError(`Failed to list targets: ${(error as Error).message}`);
    newLine();
  }
}

/**
 * Preview compiled prompts for selected targets
 */
async function previewLocationPrompts(location: LocationCacheEntry): Promise<void> {
  const targets = await selectTargets(location);
  if (targets.length === 0) return;

  showSection('Compiled Prompt Preview');

  for (const target of targets) {
    console.log(chalk.bold.cyan(`\n═══ ${target.name} (${target.slug}) ═══\n`));

    try {
      const ir = await compilePromptIR('location', location.slug, target.slug);
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
      const prepared = prepareIRPrompt('location', ir);
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
async function generateLocationImages(location: LocationCacheEntry): Promise<void> {
  const targets = await selectTargets(location);
  if (targets.length === 0) return;

  showSection('Generate Images');
  showInfo(`Selected ${targets.length} target(s) for generation`);
  newLine();

  // Load location context with verbose logging
  await compileLocationOverview(location.slug, { verbose: true });
  newLine();

  // Read location imagery for metadata
  const imagery = await readLocationImagery(location.slug);
  const zoneSpecs = imagery?.zones ?? [];
  const zoneSpecMap = new Map(zoneSpecs.map((zone) => [zone.slug, zone]));

  // Compile all IRs first
  const compiledTargets: {
    target: TargetInfo;
    ir: NonNullable<Awaited<ReturnType<typeof compilePromptIR>>>;
    prepared: ReturnType<typeof prepareIRPrompt>;
  }[] = [];

  for (const target of targets) {
    try {
      logPhase(`Compiling prompt for "${target.slug}"...`);
      const ir = await compilePromptIR('location', location.slug, target.slug);
      if (ir) {
        // Log compilation details
        logStep(`Image type: ${ir.image_type}`);

        // Log section breakdown
        logSectionBreakdown(ir.positive);

        // Log negative prompt count
        if (ir.negative.length > 0) {
          logStep(`Negative prompt: ${ir.negative.length} terms`);
        }

        // Log reference count
        logStep(`References resolved: ${ir.references.filter((r) => r.exists).length} image(s)`);

        const prepared = prepareIRPrompt('location', ir);
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

  // Option: disable references to allow style resets / stronger art-direction shifts
  showInfo(
    'Tip: Turn references OFF if you are trying to shift the overall art direction; turn them back ON once you have a good new “anchor” image.'
  );
  const useReferences = await confirm({
    message: 'Use reference images for continuity?',
    default: true,
  });

  const targetsToGenerate = useReferences
    ? compiledTargets
    : compiledTargets.map(({ target, ir, prepared }) => ({
        target,
        ir,
        prepared: { ...prepared, rendered: { ...prepared.rendered, references: [] } },
      }));

  if (!useReferences) {
    showInfo('References disabled for this run.');
    newLine();
  }

  // Confirm
  const proceed = await confirm({
    message: `Generate ${targetsToGenerate.length} image(s) using Google Gemini?`,
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

  for (const { target, ir, prepared } of targetsToGenerate) {
    console.log(chalk.cyan(`\nGenerating: ${target.name}...`));

    try {
      // Call the generation function
      const result = await generateFromIR('location', location.slug, ir, prepared);

      if (result.success) {
        showSuccess(`Generated: ${result.fileName}`);

        // Build target metadata from part spec
        const zoneSpec = zoneSpecMap.get(target.slug);
        const isOverview = target.slug === imagery?.overview?.slug;
        const overviewSpec = imagery?.overview;
        const targetMetadata: TargetMetadata = {
          entity_type: 'location',
          entity_slug: location.slug,
          image_type: isOverview
            ? overviewSpec?.image_type || 'establishing'
            : zoneSpec?.image_type || target.type,
          zone_type: zoneSpec?.zone_type,
          name: zoneSpec?.name || overviewSpec?.title,
          title: zoneSpec?.title || overviewSpec?.title,
          scene_mood: zoneSpec?.scene_mood || overviewSpec?.scene_mood,
          depicts_characters: zoneSpec?.depicts_characters,
        };

        // Record the generated image in imagery.yaml
        const entry = createGeneratedImageInventoryEntry({
          entityType: 'location',
          entitySlug: location.slug,
          targetId: target.slug,
          outputPath: result.filePath!,
          model: result.model || 'gemini-3-pro-image-preview',
          provider: (result.metadata?.provider as string) || 'google',
          promptUsed: prepared.rendered.prompt,
          negativePromptUsed: prepared.rendered.negative_prompt,
          irHash: prepared.rendered.ir_hash,
          constraints: {
            aspect_ratio: ir.constraints.aspect_ratio,
            size: ir.constraints.size,
            orientation: ir.constraints.orientation,
            quality: ir.constraints.quality,
          },
          providerMetadata: (result.metadata || {}) as Record<string, unknown>,
          targetMetadata: targetMetadata as unknown as Record<string, unknown>,
          title: targetMetadata.title || targetMetadata.name,
          imageType: targetMetadata.image_type,
        });

        await appendLocationImageInventory({
          slug: location.slug,
          targetId: target.slug,
          entry,
          createBackup: true,
        });
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
async function selectTargets(location: LocationCacheEntry): Promise<TargetInfo[]> {
  try {
    const { targets } = await listTargets('location', location.slug);

    if (targets.length === 0) {
      showWarning('No targets found. Check if imagery.yaml exists and has overview/zones.');
      newLine();
      return [];
    }

    if (targets.length === 1) {
      // Auto-select single target
      return targets;
    }

    const selected = await checkbox<string>({
      message: 'Select targets (space to toggle, enter to confirm):',
      choices: targets.map((t) => ({
        name: `${t.name} ${chalk.dim(`[${t.type}]`)}`,
        value: t.slug,
        checked: t.type === 'establishing', // Default select overview
      })),
    });

    return targets.filter((t) => selected.includes(t.slug));
  } catch (error) {
    showError(`Failed to load targets: ${(error as Error).message}`);
    newLine();
    return [];
  }
}

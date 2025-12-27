/**
 * Character actions menu - what to do with a selected character
 */

import { select, input, checkbox } from '@inquirer/prompts';
import chalk from 'chalk';
import { join, extname, basename } from 'path';
import { existsSync } from 'fs';
import { readdir, rename } from 'fs/promises';
import type { CharacterInfo } from './character-select.js';
import {
  readImageIdeasYaml,
  getImagesDir,
  getEntityDir,
  readImageryYaml,
  writeImageryYaml,
  type ImageIdeaScene,
  type CharacterImagery,
} from '../services/imagery-yaml.js';
import {
  showSection,
  showSuccess,
  showError,
  showInfo,
  showKeyValue,
  showList,
  newLine,
  showWarning,
} from '../ui/display.js';
import { withSpinner, withProgress } from '../ui/spinner.js';
import { getImageService } from '../services/images/index.js';
import {
  analyzeImage,
  generateImageryYaml,
  discoverImageFiles,
  type ImageInventoryEntry,
} from '../services/image-analysis.js';
import { runProviderSelect } from './provider-select.js';
import { getCharacterReferencePaths, getCharacterReferencePortrait } from '../services/asset-registry.js';

type CharacterAction = 'from-ideas' | 'variation' | 'view-images' | 'analyze-images' | 'back';

/**
 * Run the character actions menu
 */
export async function runCharacterActionsMenu(character: CharacterInfo): Promise<void> {
  let keepGoing = true;

  while (keepGoing) {
    showSection(character.name);

    showKeyValue('Slug', character.slug);
    showKeyValue('Has image ideas', character.hasImageIdeas ? chalk.green('Yes') : chalk.red('No'));
    showKeyValue('Existing images', String(character.imageCount));
    showKeyValue('Has portrait', character.hasPortrait ? chalk.green('Yes') : chalk.red('No'));
    newLine();

    const choices: Array<{ name: string; value: CharacterAction; description?: string }> = [];

    if (character.hasImageIdeas) {
      choices.push({
        name: 'Generate from Image Ideas',
        value: 'from-ideas',
        description: 'Select scenes from image_ideas.yaml to generate',
      });
    }

    choices.push({
      name: 'Generate Portrait Variation',
      value: 'variation',
      description: 'Generate a new image with custom scenario',
    });

    if (character.imageCount > 0) {
      choices.push({
        name: 'Analyze Images',
        value: 'analyze-images',
        description: 'Generate metadata for existing images using AI',
      });

      choices.push({
        name: 'View Generated Images',
        value: 'view-images',
        description: 'List existing images for this character',
      });
    }

    choices.push({
      name: chalk.dim('Back'),
      value: 'back',
    });

    const action = await select<CharacterAction>({
      message: 'What would you like to do?',
      choices,
    });

    switch (action) {
      case 'from-ideas':
        await runImageIdeasGeneration(character);
        break;

      case 'variation':
        await runVariationGeneration(character);
        break;

      case 'analyze-images':
        await runImageAnalysis(character);
        break;

      case 'view-images':
        await viewGeneratedImages(character);
        break;

      case 'back':
        keepGoing = false;
        break;
    }
  }
}

/**
 * Generate images from image_ideas.yaml scenes
 */
async function runImageIdeasGeneration(character: CharacterInfo): Promise<void> {
  const imageIdeas = await readImageIdeasYaml(character.slug);

  if (!imageIdeas || !imageIdeas.scenes || imageIdeas.scenes.length === 0) {
    showWarning('No scenes found in image_ideas.yaml');
    newLine();
    return;
  }

  showSection('Select Scenes to Generate');

  const scenes = imageIdeas.scenes;
  const choices = scenes.map((scene, index) => ({
    name: `[${index}] ${scene.title}`,
    value: index,
    checked: false,
    description: scene.scene || scene.setting || '',
  }));

  // Add "All" option at the top
  choices.unshift({
    name: chalk.bold('Select All'),
    value: -1,
    checked: false,
    description: `Generate all ${scenes.length} scenes`,
  });

  const selectedIndices = await checkbox({
    message: 'Select scenes to generate:',
    choices,
  });

  // Handle "Select All"
  let scenesToGenerate: Array<{ index: number; scene: ImageIdeaScene }>;
  if (selectedIndices.includes(-1)) {
    scenesToGenerate = scenes.map((scene, index) => ({ index, scene }));
  } else {
    scenesToGenerate = selectedIndices
      .filter((i) => i >= 0)
      .map((i) => ({ index: i, scene: scenes[i] }));
  }

  if (scenesToGenerate.length === 0) {
    showWarning('No scenes selected');
    newLine();
    return;
  }

  // Provider selection
  const provider = await runProviderSelect();
  if (!provider) return;

  // Get reference images (reference portrait if exists)
  const referenceImages: string[] = [];
  const portraitPath = getCharacterReferencePortrait(character.slug);
  if (portraitPath) {
    referenceImages.push(portraitPath);
    showInfo(`Using reference portrait for character consistency`);
  }

  // Get output directory for generated images
  const imagesDir = getImagesDir('character', character.slug);

  newLine();
  console.log(chalk.cyan(`Generating ${scenesToGenerate.length} images for ${character.name}...`));
  newLine();

  const imageService = getImageService();

  // Build visual consistency notes from image_ideas
  const visualConsistency = imageIdeas.visual_consistency?.join('. ') || '';

  // Pre-validate companion characters for multi-character scenes
  const scenesWithMissingCompanions: string[] = [];
  for (const { scene } of scenesToGenerate) {
    if (scene.depicts_characters?.length) {
      for (const companionSlug of scene.depicts_characters) {
        const companionPaths = getCharacterReferencePaths(companionSlug);
        if (companionPaths.length === 0) {
          scenesWithMissingCompanions.push(`"${scene.title}" requires ${companionSlug} portrait`);
        }
      }
    }
  }

  if (scenesWithMissingCompanions.length > 0) {
    showError('Cannot generate scenes - companion portraits missing:');
    for (const msg of scenesWithMissingCompanions) {
      console.log(chalk.red(`  - ${msg}`));
    }
    newLine();
    return;
  }

  // Generate each scene
  await withProgress(
    scenesToGenerate,
    async ({ index, scene }) => {
      // Build the prompt from scene data
      const promptParts: string[] = [];

      if (scene.scene) promptParts.push(scene.scene);
      if (scene.pose) promptParts.push(`Pose: ${scene.pose}`);
      if (scene.setting) promptParts.push(`Setting: ${scene.setting}`);
      if (scene.mood) promptParts.push(`Mood: ${scene.mood}`);
      if (visualConsistency) promptParts.push(`Character details (${character.name}): ${visualConsistency}`);

      // Collect reference images for this scene (start with primary character)
      const sceneReferenceImages = [...referenceImages];

      // Handle multi-character scenes with depicts_characters
      if (scene.depicts_characters?.length) {
        for (const companionSlug of scene.depicts_characters) {
          // Add companion portrait to reference images
          const companionPaths = getCharacterReferencePaths(companionSlug);
          sceneReferenceImages.push(...companionPaths);

          // Load companion's visual_consistency for the prompt
          const companionIdeas = await readImageIdeasYaml(companionSlug);
          if (companionIdeas?.visual_consistency) {
            const companionName = companionIdeas.character?.name || companionSlug;
            const companionDetails = companionIdeas.visual_consistency.join('. ');
            promptParts.push(`Character details (${companionName}): ${companionDetails}`);
          }
        }
      }

      const prompt = promptParts.join('. ');
      const outputName = `${character.slug}-${scene.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${String(index).padStart(2, '0')}`;

      if (sceneReferenceImages.length > 0 && provider === 'google') {
        // Use reference-based generation for character consistency
        return imageService.generateWithReferences(
          sceneReferenceImages,
          prompt,
          { provider },
          outputName,
          imagesDir
        );
      } else {
        // Fall back to standard generation
        return imageService.generateFromPrompt(
          `${character.name}: ${prompt}`,
          outputName,
          { provider },
          'character',
          imagesDir
        );
      }
    },
    ({ scene }) => scene.title,
    ({ scene }, result) => `${scene.title} -> ${chalk.dim(result.path.split('/').pop())}`
  );

  newLine();
  showSuccess(`Generated ${scenesToGenerate.length} images`);
  showInfo(`Images saved to: ${imagesDir}`);
  newLine();
}

/**
 * Generate a custom variation
 */
async function runVariationGeneration(character: CharacterInfo): Promise<void> {
  showSection('Generate Portrait Variation');

  const scenario = await input({
    message: 'Describe the scenario/pose for this variation:',
    default: 'A dramatic portrait with side lighting',
  });

  if (!scenario.trim()) {
    showWarning('No scenario provided');
    return;
  }

  const provider = await runProviderSelect();
  if (!provider) return;

  const referenceImages: string[] = [];
  const portraitPath = getCharacterReferencePortrait(character.slug);

  if (portraitPath) {
    referenceImages.push(portraitPath);
    showInfo(`Using reference portrait`);
  }

  // Get output directory for generated images
  const imagesDir = getImagesDir('character', character.slug);

  newLine();

  const imageService = getImageService();
  const outputName = `${character.slug}-variation`;

  try {
    const result = await withSpinner(
      `Generating variation for ${character.name}...`,
      async () => {
        if (referenceImages.length > 0 && provider === 'google') {
          return imageService.generateWithReferences(
            referenceImages,
            scenario,
            { provider },
            outputName,
            imagesDir
          );
        } else {
          return imageService.generateFromPrompt(
            `${character.name}: ${scenario}`,
            outputName,
            { provider },
            'character',
            imagesDir
          );
        }
      },
      (result) => `Generated: ${result.path.split('/').pop()}`
    );

    newLine();
    showSuccess(`Image saved to: ${result.path}`);
  } catch (error) {
    showError(`Failed to generate: ${(error as Error).message}`);
  }

  newLine();
}

/**
 * Analyze existing images and generate metadata
 */
async function runImageAnalysis(character: CharacterInfo): Promise<void> {
  showSection('Analyze Images');

  const entityDir = getEntityDir('character', character.slug);
  const imagesDir = getImagesDir('character', character.slug);

  // Step 1: Load or generate imagery.yaml
  const imageryDataRaw = await readImageryYaml('character', character.slug);
  let imageryData = imageryDataRaw as CharacterImagery | null;

  if (!imageryData) {
    showInfo('No imagery.yaml found. Generating from profile.md...');
    newLine();

    imageryData = await withSpinner('Analyzing profile and portrait image...', () =>
      generateImageryYaml({ characterDir: entityDir, slug: character.slug })
    );

    if (!imageryData) {
      showError('Failed to generate imagery.yaml');
      return;
    }

    await writeImageryYaml('character', character.slug, imageryData);
    showSuccess('Created imagery.yaml with appearance description');
    newLine();
  }

  const appearance = imageryData.appearance || '';

  // Step 2: Discover images
  const imageFiles = await discoverImageFiles(imagesDir);

  if (imageFiles.length === 0) {
    showWarning('No images found in images/ directory');
    return;
  }

  showInfo(`Found ${imageFiles.length} image(s)`);
  newLine();

  // Step 3: Check existing inventory
  const existingFilenames = new Set<string>();
  if (imageryData.image_inventory) {
    for (const entry of imageryData.image_inventory) {
      if (entry.provenance?.original_filename) {
        existingFilenames.add(entry.provenance.original_filename);
      }
    }
  }

  const newImages = imageFiles.filter((f) => !existingFilenames.has(f.split('/').pop() || ''));

  if (newImages.length === 0) {
    showSuccess('All images already analyzed!');
    showInfo(`${existingFilenames.size} images in inventory`);
    newLine();
    return;
  }

  showInfo(`${existingFilenames.size} already analyzed, ${newImages.length} new`);
  newLine();

  // Step 4: Confirm analysis
  const confirm = await select({
    message: `Analyze ${newImages.length} new image(s)?`,
    choices: [
      { name: 'Yes', value: true },
      { name: 'No', value: false },
    ],
  });

  if (!confirm) {
    newLine();
    return;
  }

  // Step 5: Analyze images sequentially with progress
  const results = await withProgress(
    newImages,
    async (imagePath) => {
      const result = await analyzeImage({
        imagePath,
        characterName: character.name,
        slug: character.slug,
        appearance,
        filename: imagePath.split('/').pop() || '',
      });

      if (!result) {
        return null;
      }

      const filename = basename(imagePath);
      if (filename.toLowerCase() === 'portrait.png') {
        return result;
      }

      const suggested = result.content?.suggested_filename;
      if (!suggested) {
        return result;
      }

      const firstName = character.name.trim().split(/\s+/)[0] || character.slug;
      const firstNameSlug = slugifyToken(firstName);
      const suggestedSlug = slugifyToken(suggested);
      if (!firstNameSlug || !suggestedSlug) {
        return result;
      }

      const ext = extname(imagePath) || '.png';
      const newFileName = buildShortNameFilename(
        firstNameSlug,
        suggestedSlug,
        ext,
        imagesDir,
        imagePath
      );

      if (!newFileName || newFileName.toLowerCase() === filename.toLowerCase()) {
        return result;
      }

      try {
        await rename(imagePath, join(imagesDir, newFileName));
        result.path = `images/${newFileName}`;
        result.provenance = result.provenance || {};
        result.provenance.original_filename = newFileName;
      } catch (error) {
        showWarning(`Rename failed for ${filename}: ${(error as Error).message}`);
      }

      return result;
    },
    (imagePath) => `Analyzing ${imagePath.split('/').pop()}`,
    (imagePath, result) =>
      result ? `✓ ${imagePath.split('/').pop()}` : `✗ ${imagePath.split('/').pop()}`
  );

  // Step 6: Add successful results to inventory
  const validResults = results.filter((r): r is ImageInventoryEntry => r !== null);

  if (!imageryData.image_inventory) {
    imageryData.image_inventory = [];
  }

  imageryData.image_inventory.push(...validResults);

  // Step 7: Save updated imagery.yaml
  await writeImageryYaml('character', character.slug, imageryData);

  newLine();
  showSuccess(`Added ${validResults.length} new entries to imagery.yaml`);
  showInfo(`Total inventory: ${imageryData.image_inventory.length} images`);
  newLine();
}

function slugifyToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildShortNameFilename(
  firstNameSlug: string,
  suggestedSlug: string,
  ext: string,
  imagesDir: string,
  currentPath: string
): string | null {
  if (!firstNameSlug || !suggestedSlug) {
    return null;
  }

  let index = 1;
  while (index < 100) {
    const suffix = String(index).padStart(2, '0');
    const candidate = `${firstNameSlug}-${suggestedSlug}-${suffix}${ext}`;
    const candidatePath = join(imagesDir, candidate);
    if (!existsSync(candidatePath) || candidatePath === currentPath) {
      return candidate;
    }
    index += 1;
  }

  return null;
}

/**
 * View existing generated images
 */
async function viewGeneratedImages(character: CharacterInfo): Promise<void> {
  showSection('Generated Images');

  const imagesDir = getImagesDir('character', character.slug);

  try {
    const files = await readdir(imagesDir);
    const images = files.filter((f) => /\.(png|jpg|jpeg|webp)$/i.test(f));

    if (images.length === 0) {
      showInfo('No images found');
    } else {
      showInfo(`Found ${images.length} images in ${imagesDir}`);
      newLine();
      showList(images.sort());
    }
  } catch (error) {
    showError(`Failed to list images: ${(error as Error).message}`);
  }

  newLine();
}

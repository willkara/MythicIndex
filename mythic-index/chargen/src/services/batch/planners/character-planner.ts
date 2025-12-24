/**
 * Character Batch Planner
 *
 * Discovers character imagery targets and generates batch tasks.
 * Characters use image_ideas.yaml (scene-based prompts) rather than
 * the IR compilation system used by locations and chapters.
 */

import { existsSync } from 'fs';
import type { BatchTask, BatchReferenceImage, BatchTaskConfig } from '../../../types/batch.js';
import { getCachedCharacters } from '../../entity-cache.js';
import {
  readImageIdeasYaml,
  readImageryYaml,
  getImagesDir,
  type CharacterImagery as _CharacterImagery,
  type ImageIdeasData as _ImageIdeasData,
  type ImageIdeaScene,
} from '../../imagery-yaml.js';
import { getCharacterReferencePortrait } from '../../asset-registry.js';
import { generateTaskKey, computeFileHash, type TaskKeyComponents } from '../task-key.js';
import { MASTER_STYLE } from '../../images/constants.js';
import { createHash } from 'crypto';
import { filterEntitiesBySlug } from '../slug-filter.js';

/** Options for character planning */
export interface CharacterPlannerOptions {
  /** Filter to specific character slugs */
  slugFilter?: string[];
  /** Skip already generated scenes */
  skipGenerated?: boolean;
  /** Model to use */
  model: string;
}

/** Planning result for a character */
export interface CharacterPlanResult {
  slug: string;
  name: string;
  tasks: BatchTask[];
  skipped: number;
  errors: string[];
}

/**
 * Plan batch tasks for all characters
 */
export async function planCharacterTasks(options: CharacterPlannerOptions): Promise<{
  tasks: BatchTask[];
  summary: {
    charactersScanned: number;
    totalTasks: number;
    skipped: number;
    errors: string[];
  };
}> {
  const characters = getCachedCharacters();
  const allTasks: BatchTask[] = [];
  let totalSkipped = 0;
  const allErrors: string[] = [];

  // Filter characters if specified
  const filteredCharacters = filterEntitiesBySlug(characters, options.slugFilter);

  // Only process characters with image_ideas.yaml
  const charactersWithIdeas = filteredCharacters.filter((ch) => ch.hasImageIdeas);

  for (const character of charactersWithIdeas) {
    try {
      const result = await planSingleCharacter(character.slug, character.name, options);
      allTasks.push(...result.tasks);
      totalSkipped += result.skipped;
      allErrors.push(...result.errors.map((e) => `[${character.slug}] ${e}`));
    } catch (error) {
      allErrors.push(`[${character.slug}] Failed to plan: ${error}`);
    }
  }

  return {
    tasks: allTasks,
    summary: {
      charactersScanned: charactersWithIdeas.length,
      totalTasks: allTasks.length,
      skipped: totalSkipped,
      errors: allErrors,
    },
  };
}

/**
 * Plan batch tasks for a single character
 */
async function planSingleCharacter(
  slug: string,
  name: string,
  options: CharacterPlannerOptions
): Promise<CharacterPlanResult> {
  const tasks: BatchTask[] = [];
  const errors: string[] = [];
  let skipped = 0;

  // Load image ideas
  const imageIdeas = await readImageIdeasYaml(slug);
  if (!imageIdeas || !imageIdeas.scenes || imageIdeas.scenes.length === 0) {
    return { slug, name, tasks, skipped, errors: ['No image ideas found'] };
  }

  // Load existing imagery.yaml to check for already-generated images
  const imageryData = await readImageryYaml('character', slug);
  const existingImages = new Set<string>();

  if (imageryData && 'entity_type' in imageryData && imageryData.entity_type === 'character') {
    for (const img of imageryData.image_inventory) {
      // Use id to track which scenes have been generated
      // Note: id in image_inventory vs custom_id in old generated_images
      if (img.id) {
        existingImages.add(img.id);
      }
    }
  }

  // Get paths
  const outputDir = getImagesDir('character', slug);

  // Check for portrait reference using centralized lookup
  const portraitPath = getCharacterReferencePortrait(slug);
  const hasPortrait = portraitPath !== null;

  // Build appearance description from image ideas
  const appearance = imageIdeas.character?.summary || '';
  const visualConsistency = imageIdeas.visual_consistency || [];

  for (let i = 0; i < imageIdeas.scenes.length; i++) {
    const scene = imageIdeas.scenes[i];
    const sceneId = generateSceneId(slug, scene, i);

    try {
      // Check if already generated
      if (options.skipGenerated && existingImages.has(sceneId)) {
        skipped++;
        continue;
      }

      // Build the prompt
      // When portrait reference exists, skip appearance text - let the reference define the character's look
      // Only include appearance/visualConsistency as fallback when no portrait is available
      const prompt = buildCharacterPrompt(
        name,
        hasPortrait ? '' : appearance,
        hasPortrait ? [] : visualConsistency,
        scene
      );
      const negativePrompt = buildNegativePrompt();

      // Build reference images (portrait if available)
      const referenceImages: BatchReferenceImage[] = [];
      if (portraitPath) {
        try {
          const sha256 = await computeFileHash(portraitPath);
          referenceImages.push({
            path: portraitPath,
            mime: 'image/png',
            sha256,
            role: 'portrait',
          });
        } catch {
          // Skip if can't read portrait
        }
      }

      // Build task config
      const config: BatchTaskConfig = {
        aspectRatio: '3:4', // Portrait orientation for characters
        size: '1024x1536',
        orientation: 'portrait',
        quality: 'high',
      };

      // Generate task key
      const keyComponents: TaskKeyComponents = {
        entityType: 'character',
        entitySlug: slug,
        targetId: sceneId,
        prompt,
        negativePrompt,
        referenceHashes: referenceImages.map((r) => r.sha256),
        model: options.model,
        config,
      };

      const taskKey = generateTaskKey(keyComponents);

      // Generate output filename
      const timestamp = Date.now();
      const dateStr = new Date().toISOString().split('T')[0];
      const safeSceneTitle = scene.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .slice(0, 30);
      const outputFileName = `${slug}-${safeSceneTitle}-${timestamp}-${dateStr}`;

      // Compute ir_hash (simplified for characters since they don't use IR)
      const irHash = createHash('sha256')
        .update(JSON.stringify({ prompt, negativePrompt, config }))
        .digest('hex')
        .slice(0, 16);

      // Create task
      const task: BatchTask = {
        key: taskKey,
        kind: 'generate',
        entityType: 'character',
        entitySlug: slug,
        targetId: sceneId,
        prompt,
        negativePrompt,
        referenceImages,
        outputDir,
        outputFileName,
        model: options.model,
        config,
        irHash,
        targetMetadata: {
          entity_type: 'character',
          entity_slug: slug,
          name: name,
          scene_title: scene.title,
          scene_index: i,
          tags: scene.tags || [],
        },
      };

      tasks.push(task);
    } catch (error) {
      errors.push(`Scene "${scene.title}": ${error}`);
    }
  }

  return { slug, name, tasks, skipped, errors };
}

/**
 * Generate a unique scene ID
 */
function generateSceneId(slug: string, scene: ImageIdeaScene, index: number): string {
  const safeTitle = scene.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40);
  return `${slug}-${safeTitle}-${index.toString().padStart(2, '0')}`;
}

/**
 * Build a character prompt from components
 */
function buildCharacterPrompt(
  name: string,
  appearance: string,
  visualConsistency: string[],
  scene: ImageIdeaScene
): string {
  const parts: string[] = [];

  // Character identity
  parts.push(`${name}`);

  // Appearance if available
  if (appearance) {
    parts.push(appearance);
  }

  // Visual consistency markers
  if (visualConsistency.length > 0) {
    parts.push(visualConsistency.join(', '));
  }

  // Scene details
  if (scene.scene) {
    parts.push(scene.scene);
  }

  if (scene.pose) {
    parts.push(scene.pose);
  }

  if (scene.setting) {
    parts.push(scene.setting);
  }

  if (scene.mood) {
    parts.push(`${scene.mood} mood`);
  }

  // Add master style
  parts.push(MASTER_STYLE.universalSuffix);
  parts.push(MASTER_STYLE.scenarios.character);

  // Add artist references
  if (MASTER_STYLE.useArtistReferences && MASTER_STYLE.artistReferences.length > 0) {
    parts.push(`in the style of ${MASTER_STYLE.artistReferences.join(', ')}`);
  }

  return parts.join(', ');
}

/**
 * Build the negative prompt
 */
function buildNegativePrompt(): string {
  return [
    'cartoon',
    'anime',
    'manga',
    'cel-shaded',
    'plastic',
    'glossy',
    '3D render',
    'CGI',
    'video game screenshot',
    'neon colors',
    'airbrushed',
    'smooth textures',
    'stock photo',
    'digital art gloss',
    'AI artifacts',
    'blurry',
    'low quality',
    'watermark',
    'text',
  ].join(', ');
}

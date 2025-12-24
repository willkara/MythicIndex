/**
 * Image Ideas YAML Validation Script
 *
 * Validates all character image-ideas.yaml files against the formal schema.
 * Also checks for multi-character scenes that need depicts_characters.
 *
 * Usage:
 *   npx tsx scripts/validate-image-ideas.ts
 *
 * Actions:
 * - Loads all image-ideas.yaml files
 * - Validates structure against Zod schema
 * - Checks depicts_characters slugs exist as character directories
 * - Finds two-character scenes missing depicts_characters
 * - Outputs validation report
 */

import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { parse as parseYaml } from 'yaml';
import { existsSync } from 'fs';
import { z } from 'zod';
import chalk from 'chalk';

// Base directory for story content
// Script is at: chargen/scripts/validate-image-ideas.ts
// Content is at: MemoryQuill/story-content/characters
const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const CHARGEN_ROOT = join(SCRIPT_DIR, '..');
const STORY_CONTENT_BASE = join(CHARGEN_ROOT, '..', 'MemoryQuill', 'story-content');

const CHARACTERS_DIR = join(STORY_CONTENT_BASE, 'characters');

// Debug: print path at startup
console.log(`Script dir: ${SCRIPT_DIR}`);
console.log(`Story content: ${STORY_CONTENT_BASE}`);

// ============================================================================
// Zod Schema (matches JSON Schema)
// ============================================================================

const SceneSchema = z.object({
  title: z.string().min(1).max(100),
  scene: z.string().optional(),
  pose: z.string().optional(),
  setting: z.string().optional(),
  mood: z.string().optional(),
  depicts_characters: z.array(z.string().regex(/^[a-z0-9-]+$/)).optional(),
  tags: z.array(z.string().min(1)).optional(),
});

const ImageIdeasSchema = z.object({
  character: z.object({
    name: z.string().min(1),
    summary: z.string().optional(),
  }),
  visual_consistency: z.array(z.string().min(1)).optional(),
  scenes: z.array(SceneSchema).min(1),
});

type ImageIdeas = z.infer<typeof ImageIdeasSchema>;
type Scene = z.infer<typeof SceneSchema>;

// ============================================================================
// Validation Results
// ============================================================================

interface ValidationResult {
  slug: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
  twoCharacterScenes: {
    title: string;
    hasDepictsCharacters: boolean;
    suggestedCharacters?: string[];
  }[];
}

// ============================================================================
// Character Name Detection
// ============================================================================

/** Map of character names/aliases to slugs */
let characterNameMap: Map<string, string> = new Map();

async function buildCharacterNameMap(): Promise<void> {
  const dirs = await readdir(CHARACTERS_DIR);

  for (const dir of dirs) {
    if (dir.startsWith('.')) continue;

    const ideasPath = join(CHARACTERS_DIR, dir, 'image-ideas.yaml');
    try {
      const content = await readFile(ideasPath, 'utf-8');
      const data = parseYaml(content);

      if (data?.character?.name) {
        const name = data.character.name as string;
        // Add full name
        characterNameMap.set(name.toLowerCase(), dir);

        // Extract parts (handle quotes and parentheses)
        const parts = name
          .replace(/["']/g, '')
          .split(/[\s,]+/)
          .filter(p => p.length > 2 && !p.startsWith('('));

        for (const part of parts) {
          const lowerPart = part.toLowerCase();
          // Don't override existing mappings with short parts
          if (!characterNameMap.has(lowerPart)) {
            characterNameMap.set(lowerPart, dir);
          }
        }
      }
    } catch {
      // Skip files that can't be read
    }
  }
}

function findMentionedCharacters(text: string, excludeSlug: string): string[] {
  const mentioned: Set<string> = new Set();
  const lowerText = text.toLowerCase();

  for (const [name, slug] of characterNameMap.entries()) {
    if (slug === excludeSlug) continue;
    if (lowerText.includes(name)) {
      mentioned.add(slug);
    }
  }

  return Array.from(mentioned);
}

// ============================================================================
// Validation Logic
// ============================================================================

async function validateFile(slug: string): Promise<ValidationResult> {
  const result: ValidationResult = {
    slug,
    valid: true,
    errors: [],
    warnings: [],
    twoCharacterScenes: [],
  };

  const yamlPath = join(CHARACTERS_DIR, slug, 'image-ideas.yaml');

  // Check file exists
  if (!existsSync(yamlPath)) {
    result.valid = false;
    result.errors.push('File does not exist');
    return result;
  }

  // Read and parse YAML
  let data: unknown;
  try {
    const content = await readFile(yamlPath, 'utf-8');
    data = parseYaml(content);
  } catch (err) {
    result.valid = false;
    result.errors.push(`YAML parse error: ${(err as Error).message}`);
    return result;
  }

  // Validate against schema
  const parseResult = ImageIdeasSchema.safeParse(data);
  if (!parseResult.success) {
    result.valid = false;
    for (const issue of parseResult.error.issues) {
      result.errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return result;
  }

  const imageIdeas = parseResult.data;

  // Check depicts_characters slugs exist
  for (const scene of imageIdeas.scenes) {
    if (scene.depicts_characters) {
      for (const charSlug of scene.depicts_characters) {
        const charDir = join(CHARACTERS_DIR, charSlug);
        if (!existsSync(charDir)) {
          result.warnings.push(
            `Scene "${scene.title}": depicts_characters references unknown slug "${charSlug}"`
          );
        } else {
          // Check if companion has portrait
          const portraitPath = join(charDir, 'images', 'portrait.png');
          if (!existsSync(portraitPath)) {
            result.warnings.push(
              `Scene "${scene.title}": companion "${charSlug}" has no portrait.png`
            );
          }
        }
      }
    }
  }

  // Find two-character scenes
  for (const scene of imageIdeas.scenes) {
    const hasTwoCharTag = scene.tags?.includes('two-character');

    if (hasTwoCharTag) {
      const sceneText = [scene.title, scene.scene, scene.pose].filter(Boolean).join(' ');
      const suggested = findMentionedCharacters(sceneText, slug);

      result.twoCharacterScenes.push({
        title: scene.title,
        hasDepictsCharacters: Boolean(scene.depicts_characters?.length),
        suggestedCharacters: suggested.length > 0 ? suggested : undefined,
      });
    }
  }

  return result;
}

async function getAllCharacterSlugs(): Promise<string[]> {
  const entries = await readdir(CHARACTERS_DIR);
  const slugs: string[] = [];

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;

    const entryPath = join(CHARACTERS_DIR, entry);
    const entryStat = await stat(entryPath);

    if (entryStat.isDirectory()) {
      const ideasPath = join(entryPath, 'image-ideas.yaml');
      if (existsSync(ideasPath)) {
        slugs.push(entry);
      }
    }
  }

  return slugs.sort();
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(chalk.bold('\n📋 Image Ideas YAML Validation\n'));
  console.log(`Scanning: ${CHARACTERS_DIR}\n`);

  // Build name map for character detection
  console.log('Building character name map...');
  await buildCharacterNameMap();
  console.log(`  Found ${characterNameMap.size} name mappings\n`);

  // Get all character slugs with image-ideas.yaml
  const slugs = await getAllCharacterSlugs();
  console.log(`Found ${slugs.length} characters with image-ideas.yaml\n`);

  // Validate each file
  const results: ValidationResult[] = [];
  for (const slug of slugs) {
    const result = await validateFile(slug);
    results.push(result);
  }

  // Summary statistics
  const validCount = results.filter(r => r.valid).length;
  const invalidCount = results.filter(r => !r.valid).length;
  const withWarnings = results.filter(r => r.warnings.length > 0).length;
  const twoCharScenes = results.flatMap(r => r.twoCharacterScenes);
  const missingDepicts = twoCharScenes.filter(s => !s.hasDepictsCharacters);

  // Print results
  console.log(chalk.bold('='.repeat(60)));
  console.log(chalk.bold('VALIDATION RESULTS'));
  console.log(chalk.bold('='.repeat(60)));

  // Errors
  const errorResults = results.filter(r => !r.valid);
  if (errorResults.length > 0) {
    console.log(chalk.red.bold(`\n❌ ERRORS (${errorResults.length} files):\n`));
    for (const r of errorResults) {
      console.log(chalk.red(`  ${r.slug}:`));
      for (const err of r.errors) {
        console.log(chalk.red(`    - ${err}`));
      }
    }
  }

  // Warnings
  const warningResults = results.filter(r => r.warnings.length > 0);
  if (warningResults.length > 0) {
    console.log(chalk.yellow.bold(`\n⚠️  WARNINGS (${warningResults.length} files):\n`));
    for (const r of warningResults) {
      console.log(chalk.yellow(`  ${r.slug}:`));
      for (const warn of r.warnings) {
        console.log(chalk.yellow(`    - ${warn}`));
      }
    }
  }

  // Two-character scenes missing depicts_characters
  if (missingDepicts.length > 0) {
    console.log(chalk.cyan.bold(`\n🔗 TWO-CHARACTER SCENES MISSING depicts_characters (${missingDepicts.length}):\n`));

    // Group by character
    const byCharacter = new Map<string, typeof missingDepicts>();
    for (const result of results) {
      const missing = result.twoCharacterScenes.filter(s => !s.hasDepictsCharacters);
      if (missing.length > 0) {
        byCharacter.set(result.slug, missing);
      }
    }

    for (const [slug, scenes] of byCharacter) {
      console.log(chalk.cyan(`  ${slug}:`));
      for (const scene of scenes) {
        const suggested = scene.suggestedCharacters?.join(', ') || '(no suggestions)';
        console.log(chalk.cyan(`    - "${scene.title}" → suggested: ${suggested}`));
      }
    }
  }

  // Summary
  console.log(chalk.bold('\n' + '='.repeat(60)));
  console.log(chalk.bold('SUMMARY'));
  console.log(chalk.bold('='.repeat(60)));
  console.log(`  Total files:              ${results.length}`);
  console.log(`  ${chalk.green('Valid:')}                   ${validCount}`);
  console.log(`  ${chalk.red('Invalid:')}                 ${invalidCount}`);
  console.log(`  ${chalk.yellow('With warnings:')}          ${withWarnings}`);
  console.log(`  Two-character scenes:     ${twoCharScenes.length}`);
  console.log(`  ${chalk.cyan('Missing depicts_characters:')} ${missingDepicts.length}`);
  console.log();

  // Exit with error code if there were validation failures
  if (invalidCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});

/**
 * Fix Visual Consistency YAML Format
 *
 * Fixes image-ideas.yaml files where visual_consistency entries like
 * `Skin: Dark burgundy` are parsed as objects instead of strings.
 *
 * Converts: { Skin: "Dark burgundy" } -> "Skin: Dark burgundy"
 *
 * Usage:
 *   npx tsx scripts/fix-visual-consistency.ts
 */

import { readFile, writeFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { existsSync } from 'fs';
import chalk from 'chalk';

const SCRIPT_DIR = dirname(new URL(import.meta.url).pathname);
const CHARGEN_ROOT = join(SCRIPT_DIR, '..');
const CHARACTERS_DIR = join(CHARGEN_ROOT, '..', 'MemoryQuill', 'story-content', 'characters');

interface FixResult {
  slug: string;
  fixed: boolean;
  itemsFixed: number;
  error?: string;
}

function normalizeVisualConsistencyItem(item: unknown): string {
  if (typeof item === 'string') {
    return item;
  }

  if (typeof item === 'object' && item !== null) {
    // Convert { Key: "Value" } back to "Key: Value"
    const entries = Object.entries(item);
    if (entries.length === 1) {
      const [key, value] = entries[0];
      return `${key}: ${value}`;
    }
    // Multiple keys - just stringify
    return JSON.stringify(item);
  }

  return String(item);
}

async function fixFile(slug: string): Promise<FixResult> {
  const yamlPath = join(CHARACTERS_DIR, slug, 'image-ideas.yaml');

  if (!existsSync(yamlPath)) {
    return { slug, fixed: false, itemsFixed: 0, error: 'File not found' };
  }

  try {
    const content = await readFile(yamlPath, 'utf-8');
    const data = parseYaml(content);

    if (!data?.visual_consistency || !Array.isArray(data.visual_consistency)) {
      return { slug, fixed: false, itemsFixed: 0 };
    }

    let itemsFixed = 0;
    const normalizedItems: string[] = [];

    for (const item of data.visual_consistency) {
      const normalized = normalizeVisualConsistencyItem(item);
      normalizedItems.push(normalized);

      if (typeof item !== 'string') {
        itemsFixed++;
      }
    }

    if (itemsFixed === 0) {
      return { slug, fixed: false, itemsFixed: 0 };
    }

    // Update the data
    data.visual_consistency = normalizedItems;

    // Write back with proper formatting
    const newContent = stringifyYaml(data, {
      lineWidth: 0,
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    });

    await writeFile(yamlPath, newContent, 'utf-8');

    return { slug, fixed: true, itemsFixed };
  } catch (err) {
    return { slug, fixed: false, itemsFixed: 0, error: (err as Error).message };
  }
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

async function main() {
  console.log(chalk.bold('\n🔧 Fix Visual Consistency Format\n'));
  console.log(`Scanning: ${CHARACTERS_DIR}\n`);

  const slugs = await getAllCharacterSlugs();
  console.log(`Found ${slugs.length} characters with image-ideas.yaml\n`);

  const results: FixResult[] = [];

  for (const slug of slugs) {
    const result = await fixFile(slug);
    results.push(result);

    if (result.fixed) {
      console.log(chalk.green(`  ✓ ${slug}: fixed ${result.itemsFixed} items`));
    } else if (result.error) {
      console.log(chalk.red(`  ✗ ${slug}: ${result.error}`));
    }
  }

  const fixedCount = results.filter(r => r.fixed).length;
  const totalItemsFixed = results.reduce((sum, r) => sum + r.itemsFixed, 0);

  console.log(chalk.bold('\n' + '='.repeat(50)));
  console.log(chalk.bold('SUMMARY'));
  console.log(chalk.bold('='.repeat(50)));
  console.log(`  Files fixed:    ${fixedCount}`);
  console.log(`  Items fixed:    ${totalItemsFixed}`);
  console.log();
}

main().catch((err) => {
  console.error(chalk.red('Fatal error:'), err);
  process.exit(1);
});

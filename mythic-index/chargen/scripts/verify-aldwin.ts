/**
 * Aldwin Gentleheart Image Verification Script
 *
 * Verifies that all images in the Aldwin Gentleheart character directory
 * are properly referenced in imagery.yaml and vice versa.
 *
 * Usage:
 *   tsx scripts/verify-aldwin.ts
 *
 * Checks:
 * - All image files on disk are referenced in imagery.yaml
 * - All imagery.yaml entries have corresponding files on disk
 * - Reports any discrepancies for manual review
 */

import { readFile, readdir } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';

/** Character directory path */
const CHAR_DIR = 'mythic-index/MemoryQuill/story-content/characters/aldwin-gentleheart';

/** Images subdirectory path */
const IMAGES_DIR = join(CHAR_DIR, 'images');

/** Imagery YAML file path */
const YAML_PATH = join(CHAR_DIR, 'imagery.yaml');

/**
 * Verifies that image files and imagery.yaml are in sync
 * Reports any missing or unreferenced images
 */
async function verify() {
  console.log('Verifying Aldwin Gentleheart images...');

  // Get files on disk
  const files = await readdir(IMAGES_DIR);
  const imageFiles = new Set(files.filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f)));

  // Get entries in YAML
  const content = await readFile(YAML_PATH, 'utf-8');
  const data = parseYaml(content);
  
  const yamlFiles = new Set<string>();
  if (data && data.image_inventory) {
    for (const entry of data.image_inventory) {
      if (entry.provenance?.original_filename) {
        yamlFiles.add(entry.provenance.original_filename);
      }
    }
  }

  // Check for discrepancies
  console.log(`\nFound ${imageFiles.size} images on disk.`);
  console.log(`Found ${yamlFiles.size} entries in imagery.yaml.`);

  const unreferenced = [...imageFiles].filter(f => !yamlFiles.has(f));
  const missing = [...yamlFiles].filter(f => !imageFiles.has(f));

  if (unreferenced.length > 0) {
    console.log('\n❌ Images on disk NOT in YAML:');
    unreferenced.forEach(f => console.log(` - ${f}`));
  } else {
    console.log('\n✅ All disk images are referenced in YAML.');
  }

  if (missing.length > 0) {
    console.log('\n❌ YAML entries missing files on disk:');
    missing.forEach(f => console.log(` - ${f}`));
  } else {
    console.log('\n✅ All YAML entries have corresponding files.');
  }
}

verify().catch(console.error);

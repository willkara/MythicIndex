/**
 * Imagery YAML Cleanup Script
 *
 * Removes unwanted entries (e.g., mask.png) from all character imagery.yaml files.
 * Scans all character directories and filters out specified entries from image inventories.
 *
 * Usage:
 *   tsx scripts/cleanup-yaml.ts
 *
 * Actions:
 * - Scans all character directories for imagery.yaml files
 * - Removes mask.png entries from image_inventory
 * - Preserves YAML formatting and structure
 * - Reports number of entries removed per character
 */

import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { readdir, stat } from 'fs/promises';

/** Base directory containing all character subdirectories */
const BASE_DIR = 'mythic-index/MemoryQuill/story-content/characters';

/**
 * Main cleanup function
 * Processes all character imagery.yaml files and removes unwanted entries
 */
async function main() {
  console.log('Scanning for imagery.yaml files to clean up...');
  
  const characterDirs = await readdir(BASE_DIR);
  
  for (const dir of characterDirs) {
    const yamlPath = join(BASE_DIR, dir, 'imagery.yaml');
    
    try {
      // Check if file exists
      await stat(yamlPath);
      
      const content = await readFile(yamlPath, 'utf-8');
      const data = parseYaml(content);
      
      if (data && data.image_inventory) {
        const originalCount = data.image_inventory.length;
        
        // Filter out mask.png entries
        data.image_inventory = data.image_inventory.filter((entry: any) => {
          return entry.provenance?.original_filename !== 'mask.png';
        });
        
        const newCount = data.image_inventory.length;
        
        if (newCount < originalCount) {
          console.log(`Cleaning ${dir}: Removed ${originalCount - newCount} mask.png entries.`);
          
          const newContent = stringifyYaml(data, {
            lineWidth: 0,
            defaultStringType: 'QUOTE_DOUBLE',
            defaultKeyType: 'PLAIN',
          });
          
          await writeFile(yamlPath, newContent, 'utf-8');
        }
      }
    } catch (err) {
      // Ignore errors (file missing, etc)
    }
  }
  console.log('Cleanup complete.');
}

main().catch(console.error);

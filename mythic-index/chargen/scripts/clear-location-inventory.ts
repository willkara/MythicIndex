import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, resolve } from 'path';
import { parse, stringify } from 'yaml';
import { existsSync } from 'fs';

const LOCATIONS_DIR = resolve('../MemoryQuill/story-content/locations');

async function main() {
  console.log('Scanning locations to clear image_inventory...');
  
  if (!existsSync(LOCATIONS_DIR)) {
    console.error(`Directory not found: ${LOCATIONS_DIR}`);
    process.exit(1);
  }

  const dirs = await readdir(LOCATIONS_DIR);
  let processed = 0;
  let skipped = 0;

  for (const dir of dirs) {
    if (dir.startsWith('.')) continue; // Skip hidden
    
    const dirPath = join(LOCATIONS_DIR, dir);
    const stats = await stat(dirPath);
    if (!stats.isDirectory()) continue;

    const yamlPath = join(dirPath, 'imagery.yaml');
    
    if (existsSync(yamlPath)) {
      try {
        const content = await readFile(yamlPath, 'utf-8');
        const data = parse(content);

        if (data && data.image_inventory && Array.isArray(data.image_inventory) && data.image_inventory.length > 0) {
          console.log(`Clearing inventory for: ${dir} (${data.image_inventory.length} items)`);
          
          data.image_inventory = [];
          
          // Use specific options to match project style
          const newContent = stringify(data, {
            lineWidth: 0,
            defaultStringType: 'QUOTE_DOUBLE',
            defaultKeyType: 'PLAIN',
          });

          await writeFile(yamlPath, newContent, 'utf-8');
          processed++;
        } else {
          skipped++;
        }
      } catch (err) {
        console.error(`Error processing ${dir}:`, err);
      }
    } else {
        skipped++;
    }
  }

  console.log('\n--------------------------------');
  console.log(`Complete.`);
  console.log(`Cleared: ${processed}`);
  console.log(`Skipped (empty or missing): ${skipped}`);
}

main().catch(console.error);

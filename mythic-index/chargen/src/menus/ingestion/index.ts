/**
 * Top-level ingestion menu for chargen CLI
 */

import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { runIngestAllMenu } from './ingest-all.js';
import { runContentOnlyMenu } from './content-only.js';
import { runIngestCharactersMenu } from './ingest-characters.js';
import { runIngestLocationsMenu } from './ingest-locations.js';
import { runIngestChaptersMenu } from './ingest-chapters.js';
import { runImageryOnlyMenu } from './imagery-only.js';
import { runStatusMenu } from './status.js';

type IngestionMenuChoice =
  | 'all'
  | 'content-only'
  | 'characters'
  | 'locations'
  | 'chapters'
  | 'imagery-only'
  | 'status'
  | 'back';

/**
 * Run the content ingestion menu
 */
export async function runIngestionMenu(): Promise<void> {
  let running = true;

  while (running) {
    const choice = await select<IngestionMenuChoice>({
      message: 'Content Ingestion',
      choices: [
        {
          name: 'Ingest All Content + Imagery',
          value: 'all',
          description: 'Full ingestion: characters, locations, chapters with all images',
        },
        {
          name: 'Ingest Content Only (no imagery)',
          value: 'content-only',
          description: 'Ingest text content only, skip all image uploads',
        },
        {
          name: 'Ingest Characters',
          value: 'characters',
          description: 'Ingest character profiles, relationships, and imagery',
        },
        {
          name: 'Ingest Locations',
          value: 'locations',
          description: 'Ingest location overviews and imagery',
        },
        {
          name: 'Ingest Chapters',
          value: 'chapters',
          description: 'Ingest chapter content, scenes, and imagery',
        },
        {
          name: 'Imagery Only',
          value: 'imagery-only',
          description: 'Re-upload images without re-ingesting content',
        },
        {
          name: 'Database Status',
          value: 'status',
          description: 'View table counts, test connection, or reset database',
        },
        {
          name: chalk.dim('Back'),
          value: 'back',
        },
      ],
    });

    switch (choice) {
      case 'all':
        await runIngestAllMenu();
        break;

      case 'content-only':
        await runContentOnlyMenu();
        break;

      case 'characters':
        await runIngestCharactersMenu();
        break;

      case 'locations':
        await runIngestLocationsMenu();
        break;

      case 'chapters':
        await runIngestChaptersMenu();
        break;

      case 'imagery-only':
        await runImageryOnlyMenu();
        break;

      case 'status':
        await runStatusMenu();
        break;

      case 'back':
        running = false;
        break;
    }
  }
}

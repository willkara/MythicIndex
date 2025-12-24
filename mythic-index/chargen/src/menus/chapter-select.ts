/**
 * Chapter selection menu with fuzzy search
 */

import { search } from '@inquirer/prompts';
import chalk from 'chalk';
import { getCachedChapters } from '../services/entity-cache.js';
import type { ChapterCacheEntry } from '../types/entity-cache.js';
import { showSection, showInfo, showWarning, newLine } from '../ui/display.js';
import { runChapterActionsMenu } from './chapter-actions.js';

/**
 * Format chapter choice for display
 */
function formatChapterChoice(chapter: ChapterCacheEntry): string {
  const parts: string[] = [];

  // Chapter number and title
  if (chapter.chapterNumber) {
    parts.push(chalk.cyan(`Ch${chapter.chapterNumber}:`));
  }
  parts.push(chapter.title || chapter.slug);

  return parts.join(' ');
}

/**
 * Run the chapter selection menu
 */
export async function runChapterMenu(): Promise<void> {
  showSection('Select Chapter');

  // Use cached data
  const chapters = getCachedChapters();

  if (chapters.length === 0) {
    showWarning('No chapters found in story-content/chapters/');
    newLine();
    return;
  }

  showInfo(`Found ${chapters.length} chapters`);
  newLine();

  const slug = await search<string>({
    message: 'Search for a chapter (type to filter):',
    source: async (input) => {
      const term = (input || '').toLowerCase();

      // Filter and sort by chapter number
      const filtered = chapters
        .filter(
          (ch) =>
            (ch.title || '').toLowerCase().includes(term) ||
            ch.slug.toLowerCase().includes(term) ||
            (ch.chapterNumber?.toString() || '').includes(term)
        )
        .sort((a, b) => (a.chapterNumber || 999) - (b.chapterNumber || 999));

      return filtered.map((ch) => ({
        name: formatChapterChoice(ch),
        value: ch.slug,
        description: ch.hasImagery
          ? `Has imagery.yaml - ${ch.imageCount} images defined`
          : 'No imagery.yaml file',
      }));
    },
  });

  if (!slug) {
    return;
  }

  const chapter = chapters.find((c) => c.slug === slug);
  if (chapter) {
    await runChapterActionsMenu(chapter);
  }
}

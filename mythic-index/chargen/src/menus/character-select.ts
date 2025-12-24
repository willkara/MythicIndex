/**
 * Character selection menu with fuzzy search
 */

import { search } from '@inquirer/prompts';
import { getCachedCharacters } from '../services/entity-cache.js';
import type { CharacterCacheEntry } from '../types/entity-cache.js';
import { showSection, showInfo, showWarning, newLine } from '../ui/display.js';
import { runCharacterActionsMenu } from './character-actions.js';

// Re-export for backward compatibility with character-actions.ts
export type CharacterInfo = CharacterCacheEntry;

/**
 * Format character choice for display
 */
function formatCharacterChoice(char: CharacterCacheEntry): string {
  return char.name;
}

/**
 * Run the character selection menu
 */
export async function runCharacterMenu(): Promise<void> {
  showSection('Select Character');

  // Use cached data instead of re-scanning
  const characters = getCachedCharacters();

  if (characters.length === 0) {
    showWarning('No characters found in story-content/characters/');
    newLine();
    return;
  }

  showInfo(`Found ${characters.length} characters`);
  newLine();

  const slug = await search<string>({
    message: 'Search for a character (type to filter):',
    source: async (input) => {
      const term = (input || '').toLowerCase();

      const filtered = characters.filter(
        (char) => char.name.toLowerCase().includes(term) || char.slug.toLowerCase().includes(term)
      );

      return filtered.map((char) => ({
        name: formatCharacterChoice(char),
        value: char.slug,
        description:
          char.summary ||
          (char.hasImageIdeas ? 'Has image ideas ready for generation' : 'No image ideas file'),
      }));
    },
  });

  if (!slug) {
    return;
  }

  const character = characters.find((c) => c.slug === slug);
  if (character) {
    await runCharacterActionsMenu(character);
  }
}

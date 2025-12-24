/**
 * Location selection menu with fuzzy search
 */

import { search } from '@inquirer/prompts';
import { getCachedLocations } from '../services/entity-cache.js';
import type { LocationCacheEntry } from '../types/entity-cache.js';
import { showSection, showInfo, showWarning, newLine } from '../ui/display.js';
import { runLocationActionsMenu } from './location-actions.js';

/**
 * Format location choice for display
 */
function formatLocationChoice(location: LocationCacheEntry): string {
  return location.name;
}

/**
 * Run the location selection menu
 */
export async function runLocationMenu(): Promise<void> {
  showSection('Select Location');

  // Use cached data instead of re-scanning
  const locations = getCachedLocations();

  if (locations.length === 0) {
    showWarning('No locations found in story-content/locations/');
    newLine();
    return;
  }

  showInfo(`Found ${locations.length} locations`);
  newLine();

  const slug = await search<string>({
    message: 'Search for a location (type to filter):',
    source: async (input) => {
      const term = (input || '').toLowerCase();

      const filtered = locations.filter(
        (loc) => loc.name.toLowerCase().includes(term) || loc.slug.toLowerCase().includes(term)
      );

      return filtered.map((loc) => ({
        name: formatLocationChoice(loc),
        value: loc.slug,
        description: loc.hasImagery
          ? `Has imagery.yaml - ${loc.imageCount} images generated`
          : 'No imagery.yaml file',
      }));
    },
  });

  if (!slug) {
    return;
  }

  const location = locations.find((l) => l.slug === slug);
  if (location) {
    await runLocationActionsMenu(location);
  }
}

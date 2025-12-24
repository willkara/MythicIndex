/**
 * Exploration and brainstorming tools
 * Deep dives, context loading, and creative exploration
 */

import { z } from 'zod';
import { getStorage } from '../services/storage.js';
import { getConfig } from '../services/config.js';
import { getRemote } from '../services/remote.js';
import type { Character, Location, Chapter } from '../types/index.js';

// Tool schemas
export const exploreCharacterSchema = z.object({
  name: z.string().describe('Character name to explore'),
});

export const exploreLocationSchema = z.object({
  name: z.string().describe('Location name to explore'),
});

export const getWritingContextSchema = z.object({
  characters: z.array(z.string()).optional().describe('Character names to load'),
  locations: z.array(z.string()).optional().describe('Location names to load'),
  chapter: z.string().optional().describe('Chapter slug to get context for'),
  description: z.string().optional().describe('Scene description to extract context from'),
});

export const getRecapSchema = z.object({
  beforeChapter: z.union([z.string(), z.number()]).describe('Chapter slug or number to get recap before'),
  focusCharacter: z.string().optional().describe('Focus recap on specific character'),
  maxChapters: z.number().optional().default(3).describe('How many previous chapters to summarize'),
});

export const brainstormSchema = z.object({
  topic: z.string().describe('What to brainstorm about'),
  type: z.enum(['character', 'location', 'scene', 'plot', 'dialogue', 'general']).optional(),
  relatedTo: z.array(z.string()).optional().describe('Related characters/locations to consider'),
});

// Tool implementations

export function exploreCharacter(input: z.infer<typeof exploreCharacterSchema>): {
  profile: Character | null;
  relationships: Array<{ name: string; type: string; description?: string }>;
  appearances: string[];
  summary: string;
} {
  const config = getConfig();
  const storage = getStorage();

  const character = storage.getCharacter(config.workspace.id, input.name);
  if (!character) {
    return {
      profile: null,
      relationships: [],
      appearances: [],
      summary: `Character "${input.name}" not found.`,
    };
  }

  // Get relationships
  const relationships = (character.relationships || []).map(r => ({
    name: r.targetName,
    type: r.type,
    description: r.description,
  }));

  // Find chapters featuring this character
  const chapters = storage.listChapters(config.workspace.id, {});
  const appearances = chapters
    .filter(ch => ch.featuredCharacters?.includes(character.name) || ch.povCharacter === character.name)
    .map(ch => `Chapter ${ch.number}: ${ch.title}`);

  // Build summary
  const summaryParts: string[] = [];
  summaryParts.push(`# Deep Dive: ${character.name}\n`);

  if (character.role) summaryParts.push(`**Role:** ${character.role}`);
  if (character.status) summaryParts.push(`**Status:** ${character.status}`);
  if (character.faction) summaryParts.push(`**Faction:** ${character.faction}`);
  if (character.occupation) summaryParts.push(`**Occupation:** ${character.occupation}`);

  if (character.appearance) {
    summaryParts.push('\n## Appearance');
    const app = character.appearance;
    const details: string[] = [];
    if (app.age) details.push(`${app.age} years old`);
    if (app.height) details.push(app.height);
    if (app.build) details.push(`${app.build} build`);
    if (app.hair) details.push(`${app.hair} hair`);
    if (app.eyes) details.push(`${app.eyes} eyes`);
    if (details.length) summaryParts.push(details.join(', '));
    if (app.distinguishingFeatures?.length) {
      summaryParts.push(`**Distinguishing features:** ${app.distinguishingFeatures.join(', ')}`);
    }
    if (app.clothing) summaryParts.push(`**Typical clothing:** ${app.clothing}`);
  }

  if (character.personality) {
    summaryParts.push(`\n## Personality\n${character.personality}`);
  }

  if (character.background) {
    summaryParts.push(`\n## Background\n${character.background}`);
  }

  if (character.motivations?.length) {
    summaryParts.push('\n## Motivations');
    character.motivations.forEach(m => summaryParts.push(`- ${m}`));
  }

  if (character.fears?.length) {
    summaryParts.push('\n## Fears');
    character.fears.forEach(f => summaryParts.push(`- ${f}`));
  }

  if (character.secrets?.length) {
    summaryParts.push('\n## Secrets');
    character.secrets.forEach(s => summaryParts.push(`- ${s}`));
  }

  if (character.speechPatterns) {
    summaryParts.push('\n## Speech & Voice');
    if (character.speechPatterns.vocabulary) {
      summaryParts.push(`**Vocabulary:** ${character.speechPatterns.vocabulary}`);
    }
    if (character.speechPatterns.quirks?.length) {
      summaryParts.push(`**Quirks:** ${character.speechPatterns.quirks.join(', ')}`);
    }
    if (character.speechPatterns.catchphrases?.length) {
      summaryParts.push(`**Catchphrases:** "${character.speechPatterns.catchphrases.join('", "')}"`);
    }
  }

  if (relationships.length) {
    summaryParts.push('\n## Relationships');
    relationships.forEach(r => {
      summaryParts.push(`- **${r.name}** (${r.type})${r.description ? `: ${r.description}` : ''}`);
    });
  }

  if (appearances.length) {
    summaryParts.push('\n## Appearances');
    appearances.forEach(a => summaryParts.push(`- ${a}`));
  }

  if (character.portraitUrl) {
    summaryParts.push(`\n## Portrait\n${character.portraitUrl}`);
  }

  return {
    profile: character,
    relationships,
    appearances,
    summary: summaryParts.join('\n'),
  };
}

export function exploreLocation(input: z.infer<typeof exploreLocationSchema>): {
  location: Location | null;
  subLocations: Location[];
  characters: string[];
  chapters: string[];
  summary: string;
} {
  const config = getConfig();
  const storage = getStorage();

  const location = storage.getLocation(config.workspace.id, input.name);
  if (!location) {
    return {
      location: null,
      subLocations: [],
      characters: [],
      chapters: [],
      summary: `Location "${input.name}" not found.`,
    };
  }

  // Find sub-locations
  const allLocations = storage.listLocations(config.workspace.id, {});
  const subLocations = allLocations.filter(l => l.parentLocationId === location.id);

  // Find chapters featuring this location
  const chapters = storage.listChapters(config.workspace.id, {});
  const featuredChapters = chapters
    .filter(ch => ch.featuredLocations?.includes(location.name))
    .map(ch => `Chapter ${ch.number}: ${ch.title}`);

  // Build summary
  const summaryParts: string[] = [];
  summaryParts.push(`# Deep Dive: ${location.name}\n`);

  if (location.type) summaryParts.push(`**Type:** ${location.type}`);
  if (location.parentLocationName) summaryParts.push(`**Part of:** ${location.parentLocationName}`);
  if (location.region) summaryParts.push(`**Region:** ${location.region}`);

  if (location.description) {
    summaryParts.push(`\n## Description\n${location.description}`);
  }

  if (location.atmosphere) {
    summaryParts.push(`\n## Atmosphere\n${location.atmosphere}`);
  }

  if (location.history) {
    summaryParts.push(`\n## History\n${location.history}`);
  }

  if (location.features?.length) {
    summaryParts.push('\n## Notable Features');
    location.features.forEach(f => summaryParts.push(`- ${f}`));
  }

  if (location.inhabitants?.length) {
    summaryParts.push('\n## Inhabitants');
    location.inhabitants.forEach(i => summaryParts.push(`- ${i}`));
  }

  if (subLocations.length) {
    summaryParts.push('\n## Sub-Locations');
    subLocations.forEach(l => summaryParts.push(`- **${l.name}** (${l.type || 'unspecified'})`));
  }

  if (featuredChapters.length) {
    summaryParts.push('\n## Featured In');
    featuredChapters.forEach(c => summaryParts.push(`- ${c}`));
  }

  if (location.imageUrl) {
    summaryParts.push(`\n## Image\n${location.imageUrl}`);
  }

  return {
    location,
    subLocations,
    characters: location.inhabitants || [],
    chapters: featuredChapters,
    summary: summaryParts.join('\n'),
  };
}

export function getWritingContext(input: z.infer<typeof getWritingContextSchema>): {
  characters: Array<{ name: string; summary: string }>;
  locations: Array<{ name: string; summary: string }>;
  chapter?: { title: string; summary: string; lastContent: string };
  context: string;
} {
  const config = getConfig();
  const storage = getStorage();

  const result = {
    characters: [] as Array<{ name: string; summary: string }>,
    locations: [] as Array<{ name: string; summary: string }>,
    chapter: undefined as { title: string; summary: string; lastContent: string } | undefined,
    context: '',
  };

  // Load characters
  const charNames = input.characters || [];
  for (const name of charNames) {
    const char = storage.getCharacter(config.workspace.id, name);
    if (char) {
      const summary = [
        char.role ? `${char.role}` : '',
        char.personality ? char.personality.slice(0, 100) + '...' : '',
        char.appearance ? `Looks: ${[char.appearance.hair, char.appearance.eyes, char.appearance.build].filter(Boolean).join(', ')}` : '',
      ].filter(Boolean).join('. ');

      result.characters.push({ name: char.name, summary });
    }
  }

  // Load locations
  const locNames = input.locations || [];
  for (const name of locNames) {
    const loc = storage.getLocation(config.workspace.id, name);
    if (loc) {
      const summary = [
        loc.type || '',
        loc.atmosphere ? `Atmosphere: ${loc.atmosphere}` : '',
        loc.description ? loc.description.slice(0, 100) + '...' : '',
      ].filter(Boolean).join('. ');

      result.locations.push({ name: loc.name, summary });
    }
  }

  // Load chapter context
  if (input.chapter) {
    const chapter = storage.getChapter(config.workspace.id, input.chapter);
    if (chapter) {
      const lastContent = chapter.content
        ? chapter.content.slice(-500).trim()
        : '(no content yet)';

      result.chapter = {
        title: chapter.title,
        summary: chapter.summary || '(no summary)',
        lastContent: `...${lastContent}`,
      };
    }
  }

  // Build context string
  const contextParts: string[] = ['# Writing Context\n'];

  if (result.characters.length) {
    contextParts.push('## Characters');
    result.characters.forEach(c => {
      contextParts.push(`### ${c.name}`);
      contextParts.push(c.summary);
    });
  }

  if (result.locations.length) {
    contextParts.push('\n## Locations');
    result.locations.forEach(l => {
      contextParts.push(`### ${l.name}`);
      contextParts.push(l.summary);
    });
  }

  if (result.chapter) {
    contextParts.push('\n## Current Chapter');
    contextParts.push(`**${result.chapter.title}**`);
    contextParts.push(`Summary: ${result.chapter.summary}`);
    contextParts.push(`\nLast content:\n${result.chapter.lastContent}`);
  }

  result.context = contextParts.join('\n');

  return result;
}

export async function getRecap(input: z.infer<typeof getRecapSchema>): Promise<{
  recap: string;
  chapters: Array<{ number: number; title: string; summary: string }>;
}> {
  const config = getConfig();
  const storage = getStorage();

  // Get target chapter
  const targetChapter = storage.getChapter(config.workspace.id, input.beforeChapter);
  if (!targetChapter) {
    return {
      recap: `Chapter "${input.beforeChapter}" not found.`,
      chapters: [],
    };
  }

  const targetNumber = targetChapter.number || 1;

  // Get previous chapters
  const allChapters = storage.listChapters(config.workspace.id, {});
  const previousChapters = allChapters
    .filter(ch => ch.number && ch.number < targetNumber)
    .sort((a, b) => (b.number || 0) - (a.number || 0))
    .slice(0, input.maxChapters);

  // Build recap
  const recapParts: string[] = [`# Previously (before Chapter ${targetNumber}: ${targetChapter.title})\n`];

  const chapterSummaries: Array<{ number: number; title: string; summary: string }> = [];

  for (const ch of previousChapters.reverse()) {
    let summary = ch.summary || '(no summary available)';

    // If focusing on a character, try to extract relevant info
    if (input.focusCharacter) {
      const isRelevant = ch.featuredCharacters?.includes(input.focusCharacter) ||
        ch.povCharacter === input.focusCharacter;
      if (!isRelevant) {
        summary = `(${input.focusCharacter} not featured)`;
      }
    }

    chapterSummaries.push({
      number: ch.number || 0,
      title: ch.title,
      summary,
    });

    recapParts.push(`## Chapter ${ch.number}: ${ch.title}`);
    recapParts.push(summary);
    recapParts.push('');
  }

  return {
    recap: recapParts.join('\n'),
    chapters: chapterSummaries,
  };
}

export function brainstorm(input: z.infer<typeof brainstormSchema>): {
  topic: string;
  relatedContext: string;
  prompt: string;
} {
  const config = getConfig();
  const storage = getStorage();

  // Gather related context
  const contextParts: string[] = [];

  if (input.relatedTo?.length) {
    for (const name of input.relatedTo) {
      // Try as character
      const char = storage.getCharacter(config.workspace.id, name);
      if (char) {
        contextParts.push(`**${char.name}** (character): ${char.personality || char.background || 'No details'}`);
        continue;
      }

      // Try as location
      const loc = storage.getLocation(config.workspace.id, name);
      if (loc) {
        contextParts.push(`**${loc.name}** (location): ${loc.description || loc.atmosphere || 'No details'}`);
      }
    }
  }

  // Build brainstorm prompt based on type
  let prompt = '';
  switch (input.type) {
    case 'character':
      prompt = `Brainstorming character ideas for: ${input.topic}\n\nConsider: backstory, motivations, flaws, relationships, arc potential`;
      break;
    case 'location':
      prompt = `Brainstorming location ideas for: ${input.topic}\n\nConsider: atmosphere, history, notable features, how it serves the story`;
      break;
    case 'scene':
      prompt = `Brainstorming scene ideas for: ${input.topic}\n\nConsider: conflict, character goals, setting, tension, what changes`;
      break;
    case 'plot':
      prompt = `Brainstorming plot ideas for: ${input.topic}\n\nConsider: stakes, obstacles, character growth, themes, twists`;
      break;
    case 'dialogue':
      prompt = `Brainstorming dialogue ideas for: ${input.topic}\n\nConsider: subtext, character voice, conflict, revelation`;
      break;
    default:
      prompt = `Brainstorming ideas for: ${input.topic}`;
  }

  if (contextParts.length) {
    prompt += `\n\n## Related Context\n${contextParts.join('\n')}`;
  }

  return {
    topic: input.topic,
    relatedContext: contextParts.join('\n') || '(none)',
    prompt,
  };
}

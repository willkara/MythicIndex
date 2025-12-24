#!/usr/bin/env node
/**
 * Mythic Index MCP Server
 *
 * A local-first creative writing assistant that connects to your
 * Mythic Index Cloudflare D1 database for managing stories, characters,
 * locations, and generating images.
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { initConfig, getConfig } from './services/config.js';
import { initRemote } from './services/remote.js';
import { initD1, isD1Available } from './services/d1.js';
import { initImageService } from './services/images.js';
import { initLogger, getLogger, logToolInvocation } from './services/logger.js';
import { initStorage } from './services/storage.js';
import { setMcpServer } from './services/mcp-context.js';

// Import tools
import * as characterTools from './tools/characters.js';
import * as chapterTools from './tools/chapters.js';
import * as imageTools from './tools/images.js';
import * as searchTools from './tools/search.js';
import * as locationTools from './tools/locations.js';
import * as exploreTools from './tools/explore.js';
import * as imageryGenTools from './tools/imagery-generation.js';

async function main() {
  // Initialize logger first
  await initLogger();
  const logger = getLogger();

  // Initialize services
  await initConfig();
  const config = getConfig();

  // Initialize local storage (offline-first cache)
  await initStorage(config.paths.cacheDb);
  logger.info('Local storage initialized', { dbPath: config.paths.cacheDb });

  initRemote();

  // Initialize D1 if available (direct database access)
  if (isD1Available()) {
    try {
      initD1();
      logger.info('D1 direct database access enabled', { module: 'server' });
    } catch (e) {
      logger.error('D1 initialization failed', e as Error, { module: 'server' });
    }
  }

  try {
    initImageService();
  } catch (e) {
    // Image service is optional - may not have API keys configured
    logger.warn('Image service not available', { module: 'server', reason: (e as Error).message });
  }

  // Create MCP server
  const server = new McpServer({
    name: 'mythicindex',
    version: '0.1.0',
  });

  // Register server for elicitation support
  setMcpServer(server);

  // ============ Character Tools ============

  server.tool(
    'get_character',
    "Look up a character's profile - appearance, personality, background, and traits",
    characterTools.getCharacterSchema.shape,
    async (args) => logToolInvocation('get_character', args, async () => {
      const input = characterTools.getCharacterSchema.parse(args);
      const result = await characterTools.getCharacter(input);

      // Handle ambiguous results (multiple matches, elicitation not available)
      if (result.matchInfo?.type === 'ambiguous' && result.guidanceMessage) {
        return {
          content: [{ type: 'text', text: result.guidanceMessage }],
        };
      }

      if (!result.character) {
        return { content: [{ type: 'text', text: `Character not found: ${input.name}` }], isError: true };
      }

      // Build response with optional match info
      let response = characterTools.formatCharacterSummary(result.character);
      if (result.matchInfo?.type === 'fuzzy') {
        response = `*Matched via fuzzy search for "${result.matchInfo.originalQuery}"*\n\n` + response;
      } else if (result.matchInfo?.type === 'elicited') {
        response = `*Selected from ${result.matchInfo.matchCount} matches*\n\n` + response;
      }

      return {
        content: [{
          type: 'text',
          text: response,
        }],
      };
    })
  );

  server.tool(
    'list_characters',
    'Show all characters in the story. Filter by role (protagonist, antagonist), faction, or status (alive/deceased)',
    characterTools.listCharactersSchema.shape,
    async (args) => logToolInvocation('list_characters', args, async () => {
      const input = characterTools.listCharactersSchema.parse(args);
      const characters = await characterTools.listCharacters(input);

      if (characters.length === 0) {
        return { content: [{ type: 'text', text: 'No characters found matching filters.' }], isError: true };
      }

      const summary = characters.map(c => {
        const parts = [`- **${c.name}**`];
        if (c.role) parts.push(`(${c.role})`);
        if (c.faction) parts.push(`- ${c.faction}`);
        return parts.join(' ');
      }).join('\n');

      return {
        content: [{ type: 'text', text: `# Characters (${characters.length})\n\n${summary}` }],
      };
    })
  );

  server.tool(
    'create_character',
    'Create a new character - define their name, appearance, personality, background, motivations, and role in the story',
    characterTools.createCharacterSchema.shape,
    async (args) => logToolInvocation('create_character', args, async () => {
      const input = characterTools.createCharacterSchema.parse(args);
      const character = characterTools.createCharacter(input);

      return {
        content: [{
          type: 'text',
          text: `Created character: **${character.name}** (${character.slug})\n\n${characterTools.formatCharacterSummary(character)}`,
        }],
      };
    })
  );

  server.tool(
    'edit_character',
    "Modify a character's details - change appearance, personality, background, status, or any profile field",
    characterTools.editCharacterSchema.shape,
    async (args) => logToolInvocation('edit_character', args, async () => {
      const input = characterTools.editCharacterSchema.parse(args);
      const character = characterTools.editCharacter(input);

      return {
        content: [{
          type: 'text',
          text: `Updated character: **${character.name}**\n\n${characterTools.formatCharacterSummary(character)}`,
        }],
      };
    })
  );

  server.tool(
    'add_relationship',
    'Connect two characters - set relationship type: ally, rival, mentor, student, family, romantic, or enemy',
    characterTools.addRelationshipSchema.shape,
    async (args) => logToolInvocation('add_relationship', args, async () => {
      const input = characterTools.addRelationshipSchema.parse(args);
      const character = characterTools.addRelationship(input);

      return {
        content: [{
          type: 'text',
          text: `Added relationship: ${character.name} → ${input.target} (${input.type})`,
        }],
      };
    })
  );

  server.tool(
    'get_relationships',
    "Show who a character is connected to - allies, rivals, family, mentors, enemies, and romantic interests",
    characterTools.getRelationshipsSchema.shape,
    async (args) => logToolInvocation('get_relationships', args, async () => {
      const input = characterTools.getRelationshipsSchema.parse(args);
      const result = await characterTools.getRelationships(input);

      if (result.relationships.length === 0) {
        return { content: [{ type: 'text', text: `${result.character} has no recorded relationships.` }], isError: true };
      }

      const lines = result.relationships.map(r =>
        `- **${r.targetName}** (${r.type})${r.description ? `: ${r.description}` : ''}`
      );

      return {
        content: [{ type: 'text', text: `# ${result.character}'s Relationships\n\n${lines.join('\n')}` }],
      };
    })
  );

  // ============ Chapter Tools ============

  server.tool(
    'get_chapter',
    "Read a chapter's full content and metadata by title or number",
    chapterTools.getChapterSchema.shape,
    async (args) => logToolInvocation('get_chapter', args, async () => {
      const input = chapterTools.getChapterSchema.parse(args);
      const result = await chapterTools.getChapter(input);

      // Handle ambiguous results (multiple matches, elicitation not available)
      if (result.matchInfo?.type === 'ambiguous' && result.guidanceMessage) {
        return {
          content: [{ type: 'text', text: result.guidanceMessage }],
        };
      }

      if (!result.chapter) {
        return { content: [{ type: 'text', text: `Chapter not found: ${input.identifier}` }], isError: true };
      }

      // Build response with optional match info
      let response = chapterTools.formatChapterSummary(result.chapter);
      if (result.matchInfo?.type === 'fuzzy') {
        response = `*Matched via fuzzy search for "${result.matchInfo.originalQuery}"*\n\n` + response;
      } else if (result.matchInfo?.type === 'elicited') {
        response = `*Selected from ${result.matchInfo.matchCount} matches*\n\n` + response;
      }

      if (input.includeContent && result.chapter.content) {
        response += `\n\n---\n\n${result.chapter.content}`;
      }

      return { content: [{ type: 'text', text: response }] };
    })
  );

  server.tool(
    'list_chapters',
    'Show all chapters with their status (draft, revision, published) and story arc',
    chapterTools.listChaptersSchema.shape,
    async (args) => logToolInvocation('list_chapters', args, async () => {
      const input = chapterTools.listChaptersSchema.parse(args);
      const chapters = await chapterTools.listChapters(input);

      if (chapters.length === 0) {
        return { content: [{ type: 'text', text: 'No chapters found.' }], isError: true };
      }

      const summary = chapters.map(c => {
        const parts = [`${c.number || '?'}. **${c.title}**`];
        parts.push(`[${c.status}]`);
        if (c.wordCount) parts.push(`(${c.wordCount.toLocaleString()} words)`);
        return parts.join(' ');
      }).join('\n');

      return {
        content: [{ type: 'text', text: `# Chapters (${chapters.length})\n\n${summary}` }],
      };
    })
  );

  server.tool(
    'create_chapter',
    'Start a new chapter - set title, POV character, featured characters and locations, and initial content',
    chapterTools.createChapterSchema.shape,
    async (args) => logToolInvocation('create_chapter', args, async () => {
      const input = chapterTools.createChapterSchema.parse(args);
      const chapter = await chapterTools.createChapter(input);

      return {
        content: [{
          type: 'text',
          text: `Created chapter ${chapter.number}: **${chapter.title}**\n\n${chapterTools.formatChapterSummary(chapter)}`,
        }],
      };
    })
  );

  server.tool(
    'edit_chapter',
    "Modify a chapter's content, title, status, summary, or metadata",
    chapterTools.editChapterSchema.shape,
    async (args) => logToolInvocation('edit_chapter', args, async () => {
      const input = chapterTools.editChapterSchema.parse(args);
      const chapter = await chapterTools.editChapter(input);

      return {
        content: [{
          type: 'text',
          text: `Updated chapter: **${chapter.title}**\n\n${chapterTools.formatChapterSummary(chapter)}`,
        }],
      };
    })
  );

  server.tool(
    'append_to_chapter',
    'Add more content to the end of a chapter - optionally insert a scene break first',
    chapterTools.appendToChapterSchema.shape,
    async (args) => logToolInvocation('append_to_chapter', args, async () => {
      const input = chapterTools.appendToChapterSchema.parse(args);
      const chapter = await chapterTools.appendToChapter(input);

      return {
        content: [{
          type: 'text',
          text: `Appended to chapter ${chapter.number}: **${chapter.title}**\nNew word count: ${chapter.wordCount?.toLocaleString() || 0}`,
        }],
      };
    })
  );

  server.tool(
    'add_scene',
    'Add a structured scene with location, characters present, mood, tension level, and narrative purpose',
    chapterTools.addSceneSchema.shape,
    async (args) => logToolInvocation('add_scene', args, async () => {
      const input = chapterTools.addSceneSchema.parse(args);
      const { chapter, scene } = await chapterTools.addScene(input);

      return {
        content: [{
          type: 'text',
          text: `Added scene ${scene.sequence} to chapter ${chapter.number}: **${chapter.title}**\n${scene.title ? `Scene: ${scene.title}` : ''}`,
        }],
      };
    })
  );

  server.tool(
    'get_chapter_outline',
    "See a chapter's structure - scenes, word count, and flow without reading the full content",
    chapterTools.getChapterOutlineSchema.shape,
    async (args) => logToolInvocation('get_chapter_outline', args, async () => {
      const input = chapterTools.getChapterOutlineSchema.parse(args);
      const outline = await chapterTools.getChapterOutline(input);

      const lines = [
        `# ${outline.title}`,
        `**Status:** ${outline.status} | **Words:** ${outline.wordCount.toLocaleString()}`,
      ];

      if (outline.summary) {
        lines.push(`\n## Summary\n${outline.summary}`);
      }

      if (outline.scenes.length > 0) {
        lines.push('\n## Scenes');
        outline.scenes.forEach(s => {
          const parts = [`${s.sequence}.`];
          if (s.title) parts.push(`**${s.title}**`);
          if (s.location) parts.push(`@ ${s.location}`);
          if (s.tension) parts.push(`[${s.tension}]`);
          lines.push(parts.join(' '));
          if (s.summary) lines.push(`   ${s.summary}`);
        });
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    })
  );

  // ============ Image Tools ============

  server.tool(
    'generate_character_portrait',
    "Create character art using their established appearance - hair, eyes, clothing, distinguishing features",
    imageTools.generateCharacterPortraitSchema.shape,
    async (args) => logToolInvocation('generate_character_portrait', args, async () => {
      const input = imageTools.generateCharacterPortraitSchema.parse(args);
      const result = await imageTools.generateCharacterPortrait(input);

      return {
        content: [{
          type: 'text',
          text: `Generated portrait for character.\n\n**Path:** ${result.path}\n**Prompt:** ${result.prompt}`,
        }],
      };
    })
  );

  server.tool(
    'generate_location_art',
    'Create artwork of a location - specify time of day and mood for atmosphere',
    imageTools.generateLocationArtSchema.shape,
    async (args) => logToolInvocation('generate_location_art', args, async () => {
      const input = imageTools.generateLocationArtSchema.parse(args);
      const result = await imageTools.generateLocationArt(input);

      return {
        content: [{
          type: 'text',
          text: `Generated location art.\n\n**Path:** ${result.path}\n**Prompt:** ${result.prompt}`,
        }],
      };
    })
  );

  server.tool(
    'generate_scene_art',
    "Illustrate a specific scene or moment - describe what's happening, who's there, and the mood",
    imageTools.generateSceneArtSchema.shape,
    async (args) => logToolInvocation('generate_scene_art', args, async () => {
      const input = imageTools.generateSceneArtSchema.parse(args);
      const result = await imageTools.generateSceneArt(input);

      return {
        content: [{
          type: 'text',
          text: `Generated scene illustration.\n\n**Path:** ${result.path}\n**Prompt:** ${result.prompt}`,
        }],
      };
    })
  );

  server.tool(
    'generate_cover',
    'Create cover art for your book or chapter with space for title text',
    imageTools.generateCoverSchema.shape,
    async (args) => logToolInvocation('generate_cover', args, async () => {
      const input = imageTools.generateCoverSchema.parse(args);
      const result = await imageTools.generateCover(input);

      return {
        content: [{
          type: 'text',
          text: `Generated cover art.\n\n**Path:** ${result.path}\n**Prompt:** ${result.prompt}`,
        }],
      };
    })
  );

  server.tool(
    'generate_image',
    'Generate any image from a detailed description - full creative control',
    imageTools.generateFromPromptSchema.shape,
    async (args) => logToolInvocation('generate_image', args, async () => {
      const input = imageTools.generateFromPromptSchema.parse(args);
      const result = await imageTools.generateFromPrompt(input);

      return {
        content: [{
          type: 'text',
          text: `Generated image.\n\n**Path:** ${result.path}\n**Prompt:** ${result.prompt}`,
        }],
      };
    })
  );

  server.tool(
    'upload_image',
    'Upload a generated image to the cloud and link it to a character, location, or chapter',
    imageTools.uploadImageSchema.shape,
    async (args) => logToolInvocation('upload_image', args, async () => {
      const input = imageTools.uploadImageSchema.parse(args);
      const result = await imageTools.uploadImage(input);

      return {
        content: [{
          type: 'text',
          text: `Uploaded image.\n\n**URL:** ${result.url}\n**ID:** ${result.id}`,
        }],
      };
    })
  );

  server.tool(
    'list_local_images',
    "Show all generated images that haven't been uploaded yet",
    imageTools.listLocalImagesSchema.shape,
    async (args) => logToolInvocation('list_local_images', args, async () => {
      const input = imageTools.listLocalImagesSchema.parse(args);
      const images = await imageTools.listLocalImages(input);

      if (images.length === 0) {
        return { content: [{ type: 'text', text: 'No local images found.' }], isError: true };
      }

      const lines = images.map(img => `- ${img.filename} (${img.createdAt})`);

      return {
        content: [{ type: 'text', text: `# Local Images (${images.length})\n\n${lines.join('\n')}` }],
      };
    })
  );

  server.tool(
    'set_character_portrait',
    "Use a generated image as a character's official portrait - uploads and links automatically",
    imageTools.setCharacterPortraitSchema.shape,
    async (args) => logToolInvocation('set_character_portrait', args, async () => {
      const input = imageTools.setCharacterPortraitSchema.parse(args);
      const result = await imageTools.setCharacterPortrait(input);

      return {
        content: [{
          type: 'text',
          text: `Set portrait for **${result.character}**\n\n**URL:** ${result.portraitUrl}`,
        }],
      };
    })
  );

  // ============ Bulk Regeneration Tools ============

  server.tool(
    'regenerate_character_images',
    'Regenerate all images for a character using prompts from their imagery.yaml file',
    imageTools.regenerateCharacterImagesSchema.shape,
    async (args) => logToolInvocation('regenerate_character_images', args, async () => {
      const input = imageTools.regenerateCharacterImagesSchema.parse(args);
      const result = await imageTools.regenerateCharacterImages(input);

      const lines = [
        `# Character Image Regeneration: ${input.slug}`,
        `**Provider:** ${input.provider}`,
        `**Dry Run:** ${result.dryRun}`,
        `**Archived:** ${result.archivedCount} images`,
        `**Generated:** ${result.generatedCount} images`,
      ];

      if (result.errors.length > 0) {
        lines.push(`\n## Errors\n${result.errors.join('\n')}`);
      }

      if (result.details) {
        lines.push(`\n## Details\n${result.details}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  server.tool(
    'regenerate_location_images',
    'Regenerate all images for a location (overview and zones) using prompts from imagery.yaml',
    imageTools.regenerateLocationImagesSchema.shape,
    async (args) => logToolInvocation('regenerate_location_images', args, async () => {
      const input = imageTools.regenerateLocationImagesSchema.parse(args);
      const result = await imageTools.regenerateLocationImages(input);

      const lines = [
        `# Location Image Regeneration: ${input.slug}`,
        `**Provider:** ${input.provider}`,
        `**Dry Run:** ${result.dryRun}`,
        `**Archived:** ${result.archivedCount} images`,
        `**Generated:** ${result.generatedCount} images`,
      ];

      if (result.errors.length > 0) {
        lines.push(`\n## Errors\n${result.errors.join('\n')}`);
      }

      if (result.details) {
        lines.push(`\n## Details\n${result.details}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  server.tool(
    'regenerate_chapter_images',
    'Regenerate all scene images for a chapter using prompts from imagery.yaml',
    imageTools.regenerateChapterImagesSchema.shape,
    async (args) => logToolInvocation('regenerate_chapter_images', args, async () => {
      const input = imageTools.regenerateChapterImagesSchema.parse(args);
      const result = await imageTools.regenerateChapterImages(input);

      const lines = [
        `# Chapter Image Regeneration: ${input.slug}`,
        `**Provider:** ${input.provider}`,
        `**Dry Run:** ${result.dryRun}`,
        `**Archived:** ${result.archivedCount} images`,
        `**Generated:** ${result.generatedCount} images`,
      ];

      if (result.errors.length > 0) {
        lines.push(`\n## Errors\n${result.errors.join('\n')}`);
      }

      if (result.details) {
        lines.push(`\n## Details\n${result.details}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  server.tool(
    'list_regeneration_candidates',
    'List entities with images that can be regenerated, optionally filtered by provider',
    imageTools.listRegenerationCandidatesSchema.shape,
    async (args) => logToolInvocation('list_regeneration_candidates', args, async () => {
      const input = imageTools.listRegenerationCandidatesSchema.parse(args);
      const result = await imageTools.listRegenerationCandidatesImpl(input);

      if (result.count === 0) {
        return {
          content: [{ type: 'text', text: 'No regeneration candidates found matching filters.' }],
          isError: true,
        };
      }

      const lines = [
        `# Regeneration Candidates (${result.count})`,
        '',
      ];

      for (const c of result.candidates) {
        const providerList = Object.entries(c.providers)
          .map(([p, n]) => `${p}: ${n}`)
          .join(', ');
        lines.push(`- **[${c.entityType}]** ${c.slug}`);
        lines.push(`  Prompts: ${c.promptCount} | Generated: ${c.generatedCount} | Providers: ${providerList}`);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  // ============ LLM-Driven Imagery Tools ============

  server.tool(
    'get_content_for_imagery_analysis',
    'Get entity content (chapter text, character profile, location details) formatted for imagery ideation - includes character visuals and existing imagery context',
    imageryGenTools.getContentForImageryAnalysisSchema.shape,
    async (args) => logToolInvocation('get_content_for_imagery_analysis', args, async () => {
      const input = imageryGenTools.getContentForImageryAnalysisSchema.parse(args);
      const result = await imageryGenTools.getContentForImageryAnalysis(input);

      const lines = [
        `# Content for Imagery Analysis`,
        `**Entity:** ${result.entityType} / ${result.slug}`,
        '',
        '## Content',
        result.content,
      ];

      if (result.characters.length > 0) {
        lines.push('', '## Character Visuals');
        for (const char of result.characters) {
          lines.push(`### ${char.name}`, char.visualSummary);
        }
      }

      if (result.existingImagery) {
        lines.push('', '## Existing Imagery', '```json', result.existingImagery, '```');
      }

      lines.push('', '## Art Style', result.artStyle);

      if (result.analysisGuidance) {
        lines.push('', '---', '', result.analysisGuidance);
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  server.tool(
    'save_imagery_prompts',
    'Save LLM-generated image prompts to imagery.yaml - use freshStart=true to archive existing and start fresh',
    imageryGenTools.saveImageryPromptsSchema.shape,
    async (args) => logToolInvocation('save_imagery_prompts', args, async () => {
      const input = imageryGenTools.saveImageryPromptsSchema.parse(args);
      const result = await imageryGenTools.saveImageryPrompts(input);

      return {
        content: [{
          type: 'text',
          text: `# Imagery Prompts Saved\n\n${result.message}\n\nSaved ${result.savedCount} prompts to ${input.entityType}/${input.slug}`,
        }],
      };
    })
  );

  server.tool(
    'generate_new_images',
    'Generate new images from prompts and add to imagery.yaml - by default adds to existing (use archiveExisting=true to archive first)',
    imageryGenTools.generateNewImagesSchema.shape,
    async (args) => logToolInvocation('generate_new_images', args, async () => {
      const input = imageryGenTools.generateNewImagesSchema.parse(args);
      const result = await imageryGenTools.generateNewImages(input);

      const lines = [
        `# Image Generation Results`,
        `**Entity:** ${input.entityType} / ${input.slug}`,
        `**Provider:** ${input.provider}`,
        `**Generated:** ${result.generatedCount} images`,
      ];

      if (result.archivedCount > 0) {
        lines.push(`**Archived:** ${result.archivedCount} existing images`);
      }

      if (result.images.length > 0) {
        lines.push('', '## Generated Images');
        for (const img of result.images) {
          lines.push(`- **${img.title}**: ${img.path}`);
        }
      }

      if (result.errors.length > 0) {
        lines.push('', '## Errors');
        for (const err of result.errors) {
          lines.push(`- ${err}`);
        }
      }

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  // ============ Unified Image Generation Tool ============

  server.tool(
    'generate_images_for_entity',
    'Generate images for any entity (chapter, character, location). Reads imagery.yaml if exists, otherwise auto-constructs prompts from content. Use preview=true (default) to see candidates first, then call again with promptIndices to generate.',
    imageTools.generateImagesForEntitySchema.shape,
    async (args) => logToolInvocation('generate_images_for_entity', args, async () => {
      const input = imageTools.generateImagesForEntitySchema.parse(args);
      const result = await imageTools.generateImagesForEntity(input);

      if (result.mode === 'preview') {
        const lines = [
          `# Image Generation Preview`,
          `**Entity:** ${result.entityType} / ${result.slug}`,
          `**Source:** ${result.source}`,
          '',
          `## Available Prompts (${result.candidates.length})`,
          '',
        ];

        for (const c of result.candidates) {
          const recommended = result.recommendedIndices.includes(c.index) ? ' ⭐' : '';
          lines.push(`### [${c.index}] ${c.title}${recommended}`);
          lines.push(`**Score:** ${c.score.toFixed(1)}`);
          lines.push(`**Prompt:** ${c.prompt.slice(0, 300)}${c.prompt.length > 300 ? '...' : ''}`);
          if (c.metadata) {
            const meta = [];
            if (c.metadata.tension) meta.push(`Tension: ${c.metadata.tension}`);
            if (c.metadata.mood) meta.push(`Mood: ${c.metadata.mood}`);
            if (c.metadata.location) meta.push(`Location: ${c.metadata.location}`);
            if (c.metadata.characters?.length) meta.push(`Characters: ${c.metadata.characters.join(', ')}`);
            if (meta.length) lines.push(`**Metadata:** ${meta.join(' | ')}`);
          }
          lines.push('');
        }

        lines.push('---');
        lines.push(`**Recommended indices:** [${result.recommendedIndices.join(', ')}]`);
        lines.push('');
        lines.push(result.message);

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      } else {
        // Generate mode
        const lines = [
          `# Image Generation ${result.dryRun ? '(Dry Run)' : 'Results'}`,
          `**Entity:** ${result.entityType} / ${result.slug}`,
          `**Success:** ${result.success}`,
        ];

        if (result.archivedCount > 0) {
          lines.push(`**Archived:** ${result.archivedCount} existing images`);
        }

        if (result.generatedImages.length > 0) {
          lines.push('', `## Generated Images (${result.generatedImages.length})`);
          for (const img of result.generatedImages) {
            lines.push(`### [${img.index}] ${img.title}`);
            lines.push(`**Path:** ${img.path}`);
            lines.push(`**Prompt:** ${img.prompt.slice(0, 200)}...`);
            lines.push('');
          }
        }

        if (result.errors.length > 0) {
          lines.push('', '## Errors');
          for (const err of result.errors) {
            lines.push(`- ${err}`);
          }
        }

        return {
          content: [{ type: 'text', text: lines.join('\n') }],
        };
      }
    })
  );

  // ============ Image Editing Tools ============

  server.tool(
    'edit_image',
    'Edit an existing image using natural language - remove elements, change colors, add objects, modify backgrounds. Uses Gemini multimodal capabilities.',
    imageTools.editImageSchema.shape,
    async (args) => logToolInvocation('edit_image', args, async () => {
      const input = imageTools.editImageSchema.parse(args);
      const result = await imageTools.editImage(input);

      if (result.error) {
        return {
          content: [{ type: 'text', text: `Image editing failed: ${result.error}` }],
          isError: true,
        };
      }

      return {
        content: [{
          type: 'text',
          text: `# Image Edited Successfully\n\n**Source:** ${result.sourceImage}\n**Instruction:** ${result.instruction}\n**Output:** ${result.path}\n**Model:** ${result.model}`,
        }],
      };
    })
  );

  server.tool(
    'generate_character_variation',
    'Generate a character in a new scenario using existing portrait(s) as reference for visual consistency. Auto-discovers portrait.png from character directory, falls back to text description if no images exist.',
    imageTools.generateCharacterVariationSchema.shape,
    async (args) => logToolInvocation('generate_character_variation', args, async () => {
      const input = imageTools.generateCharacterVariationSchema.parse(args);
      const result = await imageTools.generateCharacterVariation(input);

      if (result.error) {
        const lines = [`Character variation generation failed: ${result.error}`];
        if (result.guidance) {
          lines.push('', result.guidance);
        }
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          isError: true,
        };
      }

      const lines = [
        `# Character Variation Generated`,
        `**Character:** ${result.character}`,
        `**Path:** ${result.path}`,
        `**Model:** ${result.model}`,
        `**References Used:** ${result.referencesUsed}`,
      ];

      if (result.fallbackMode === 'text-only') {
        lines.push('', '*Note: No reference images found. Generated from text description only.*');
      }

      lines.push('', '**Prompt:**', result.prompt.slice(0, 500) + (result.prompt.length > 500 ? '...' : ''));

      return {
        content: [{ type: 'text', text: lines.join('\n') }],
      };
    })
  );

  server.tool(
    'generate_character_images_from_ideas',
    'Generate character scene images from story-content image-ideas.yaml using portrait.png as a reference (Gemini reference or OpenAI edit).',
    imageTools.generateCharacterImagesFromIdeasSchema.shape,
    async (args) => logToolInvocation('generate_character_images_from_ideas', args, async () => {
      const input = imageTools.generateCharacterImagesFromIdeasSchema.parse(args);
      const result = await imageTools.generateCharacterImagesFromIdeas(input);

      if (result.mode === 'preview') {
        const lines = [
          '# Character Idea Image Candidates',
          `**Character:** ${result.character} (${result.slug})`,
          `**Ideas:** ${result.selectedCount}/${result.ideaCount}`,
          `**Ideas File:** ${result.ideasPath}`,
          `**Portrait:** ${result.portraitPath}`,
          '',
        ];

        for (const c of result.candidates) {
          lines.push(`## [${c.index}] ${c.title}`);
          if (c.tags.length) lines.push(`Tags: ${c.tags.join(', ')}`);
          lines.push('```', c.prompt.trim(), '```', '');
        }

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }

      const lines = [
        '# Character Idea Image Generation Results',
        `**Character:** ${result.character} (${result.slug})`,
        `**Provider:** ${result.provider}`,
        result.model ? `**Model:** ${result.model}` : null,
        `**Portrait:** ${result.portraitPath}`,
        `**References Used:** ${result.referencesUsed}`,
        `**Generated:** ${result.generatedCount}`,
        result.dryRun ? '**Mode:** Dry run' : null,
      ].filter(Boolean) as string[];

      if (result.generatedImages.length > 0) {
        lines.push('', '## Generated Images');
        for (const img of result.generatedImages) {
          lines.push(`- **[${img.index}] ${img.title}**: ${img.path}`);
        }
      }

      if (result.errors.length > 0) {
        lines.push('', '## Errors');
        for (const err of result.errors) {
          lines.push(`- ${err}`);
        }
      }

      return { content: [{ type: 'text', text: lines.join('\n') }] };
    })
  );

  // ============ Search Tools ============

  server.tool(
    'search',
    'Search your story for concepts, themes, or moments - understands meaning, not just keywords',
    searchTools.searchSchema.shape,
    async (args) => logToolInvocation('search', args, async () => {
      const input = searchTools.searchSchema.parse(args);
      const results = await searchTools.search(input);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No results found for: "${input.query}"` }], isError: true };
      }

      const lines = results.map((r, i) => {
        return `${i + 1}. **[${r.type}]** ${r.title}\n   ${r.preview}\n   Score: ${r.score.toFixed(3)}`;
      });

      return {
        content: [{ type: 'text', text: `# Search Results for "${input.query}"\n\n${lines.join('\n\n')}` }],
      };
    })
  );

  server.tool(
    'find_mentions',
    'Find everywhere a character or location appears across all chapters',
    searchTools.findMentionsSchema.shape,
    async (args) => logToolInvocation('find_mentions', args, async () => {
      const input = searchTools.findMentionsSchema.parse(args);
      const results = await searchTools.findMentions(input);

      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No mentions found for: "${input.name}"` }], isError: true };
      }

      const lines = results.map(r => `- **${r.chapter}**: ${r.context}`);

      return {
        content: [{ type: 'text', text: `# Mentions of "${input.name}"\n\n${lines.join('\n')}` }],
      };
    })
  );

  // ============ Location Tools ============

  server.tool(
    'get_location',
    "Look up a location's details - description, atmosphere, history, notable features, and who lives there",
    locationTools.getLocationSchema.shape,
    async (args) => logToolInvocation('get_location', args, async () => {
      const input = locationTools.getLocationSchema.parse(args);
      const result = await locationTools.getLocation(input);

      // Handle ambiguous results (multiple matches, elicitation not available)
      if (result.matchInfo?.type === 'ambiguous' && result.guidanceMessage) {
        return {
          content: [{ type: 'text', text: result.guidanceMessage }],
        };
      }

      if (!result.location) {
        return { content: [{ type: 'text', text: `Location not found: ${input.name}` }], isError: true };
      }

      // Build response with optional match info
      let response = locationTools.formatLocationSummary(result.location);
      if (result.matchInfo?.type === 'fuzzy') {
        response = `*Matched via fuzzy search for "${result.matchInfo.originalQuery}"*\n\n` + response;
      } else if (result.matchInfo?.type === 'elicited') {
        response = `*Selected from ${result.matchInfo.matchCount} matches*\n\n` + response;
      }

      return {
        content: [{ type: 'text', text: response }],
      };
    })
  );

  server.tool(
    'list_locations',
    'List all locations, optionally filtered by type or region',
    locationTools.listLocationsSchema.shape,
    async (args) => logToolInvocation('list_locations', args, async () => {
      const input = locationTools.listLocationsSchema.parse(args);
      const locations = await locationTools.listLocations(input);

      if (locations.length === 0) {
        return { content: [{ type: 'text', text: 'No locations found matching filters.' }], isError: true };
      }

      const summary = locations.map(l => {
        const parts = [`- **${l.name}**`];
        if (l.type) parts.push(`(${l.type})`);
        if (l.region) parts.push(`in ${l.region}`);
        return parts.join(' ');
      }).join('\n');

      return {
        content: [{ type: 'text', text: `# Locations (${locations.length})\n\n${summary}` }],
      };
    })
  );

  server.tool(
    'create_location',
    'Create a new place - city, building, room, landmark, or natural setting with description and atmosphere',
    locationTools.createLocationSchema.shape,
    async (args) => logToolInvocation('create_location', args, async () => {
      const input = locationTools.createLocationSchema.parse(args);
      const location = locationTools.createLocation(input);

      return {
        content: [{
          type: 'text',
          text: `Created location: **${location.name}**\n\n${locationTools.formatLocationSummary(location)}`,
        }],
      };
    })
  );

  server.tool(
    'edit_location',
    "Modify a location's description, atmosphere, history, features, or inhabitants",
    locationTools.editLocationSchema.shape,
    async (args) => logToolInvocation('edit_location', args, async () => {
      const input = locationTools.editLocationSchema.parse(args);
      const location = locationTools.editLocation(input);

      return {
        content: [{
          type: 'text',
          text: `Updated location: **${location.name}**\n\n${locationTools.formatLocationSummary(location)}`,
        }],
      };
    })
  );

  // ============ Exploration Tools ============

  server.tool(
    'explore_character',
    'Tell me everything about a character - full profile, all relationships, which chapters they appear in, their complete history',
    exploreTools.exploreCharacterSchema.shape,
    async (args) => logToolInvocation('explore_character', args, async () => {
      const input = exploreTools.exploreCharacterSchema.parse(args);
      const result = exploreTools.exploreCharacter(input);

      return {
        content: [{ type: 'text', text: result.summary }],
      };
    })
  );

  server.tool(
    'explore_location',
    'Deep dive into a location - details, sub-locations, who lives there, which chapters feature it',
    exploreTools.exploreLocationSchema.shape,
    async (args) => logToolInvocation('explore_location', args, async () => {
      const input = exploreTools.exploreLocationSchema.parse(args);
      const result = exploreTools.exploreLocation(input);

      return {
        content: [{ type: 'text', text: result.summary }],
      };
    })
  );

  server.tool(
    'get_writing_context',
    'Prepare to write a scene - load relevant character profiles, location details, and where we left off in the chapter',
    exploreTools.getWritingContextSchema.shape,
    async (args) => logToolInvocation('get_writing_context', args, async () => {
      const input = exploreTools.getWritingContextSchema.parse(args);
      const result = exploreTools.getWritingContext(input);

      return {
        content: [{ type: 'text', text: result.context }],
      };
    })
  );

  server.tool(
    'get_recap',
    'Summarize what happened before a chapter - useful when returning to write or creating "previously on" text',
    exploreTools.getRecapSchema.shape,
    async (args) => logToolInvocation('get_recap', args, async () => {
      const input = exploreTools.getRecapSchema.parse(args);
      const result = await exploreTools.getRecap(input);

      return {
        content: [{ type: 'text', text: result.recap }],
      };
    })
  );

  server.tool(
    'brainstorm',
    'Generate and explore ideas for characters, locations, scenes, plot points, or dialogue - with context from your story',
    exploreTools.brainstormSchema.shape,
    async (args) => logToolInvocation('brainstorm', args, async () => {
      const input = exploreTools.brainstormSchema.parse(args);
      const result = exploreTools.brainstorm(input);

      return {
        content: [{ type: 'text', text: result.prompt }],
      };
    })
  );

  // ============ Resources ============

  server.resource(
    'characters',
    'mythicindex://characters',
    async () => {
      const characters = await characterTools.listCharacters({});
      const text = characters.map(c => `${c.name} (${c.role || 'unknown role'})`).join('\n');
      return { contents: [{ uri: 'mythicindex://characters', text, mimeType: 'text/plain' }] };
    }
  );

  server.resource(
    'chapters',
    'mythicindex://chapters',
    async () => {
      const chapters = await chapterTools.listChapters({});
      const text = chapters.map(c => `${c.number}. ${c.title} [${c.status}]`).join('\n');
      return { contents: [{ uri: 'mythicindex://chapters', text, mimeType: 'text/plain' }] };
    }
  );

  server.resource(
    'locations',
    'mythicindex://locations',
    async () => {
      const locations = await locationTools.listLocations({});
      const text = locations.map(l => `${l.name} (${l.type || 'unspecified'})`).join('\n');
      return { contents: [{ uri: 'mythicindex://locations', text, mimeType: 'text/plain' }] };
    }
  );

  // ============ Resource Templates (Dynamic Entity Access) ============

  // Character template: mythicindex://characters/{slug}
  server.resource(
    'character',
    new ResourceTemplate('mythicindex://characters/{slug}', {
      list: async () => {
        const characters = await characterTools.listCharacters({});
        return {
          resources: characters.map(c => ({
            uri: `mythicindex://characters/${c.slug}`,
            name: c.name,
            description: `${c.role || 'Character'} - ${c.faction || 'No faction'}`,
            mimeType: 'application/json',
          })),
        };
      },
      complete: {
        slug: async () => {
          const characters = await characterTools.listCharacters({});
          return characters.map(c => c.slug);
        },
      },
    }),
    async (uri, { slug }) => {
      const character = await characterTools.getCharacter({ name: slug as string });
      if (!character) {
        return { contents: [{ uri: uri.href, text: `Character not found: ${slug}`, mimeType: 'text/plain' }] };
      }
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(character, null, 2),
          mimeType: 'application/json',
        }],
      };
    }
  );

  // Chapter template: mythicindex://chapters/{slug}
  server.resource(
    'chapter',
    new ResourceTemplate('mythicindex://chapters/{slug}', {
      list: async () => {
        const chapters = await chapterTools.listChapters({});
        return {
          resources: chapters.map(c => ({
            uri: `mythicindex://chapters/${c.slug}`,
            name: `Ch ${c.number}: ${c.title}`,
            description: `[${c.status}] ${c.summary || 'No summary'}`.slice(0, 100),
            mimeType: 'application/json',
          })),
        };
      },
      complete: {
        slug: async () => {
          const chapters = await chapterTools.listChapters({});
          return chapters.map(c => c.slug);
        },
      },
    }),
    async (uri, { slug }) => {
      const chapter = await chapterTools.getChapter({ identifier: slug as string, includeContent: true });
      if (!chapter) {
        return { contents: [{ uri: uri.href, text: `Chapter not found: ${slug}`, mimeType: 'text/plain' }] };
      }
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(chapter, null, 2),
          mimeType: 'application/json',
        }],
      };
    }
  );

  // Location template: mythicindex://locations/{slug}
  server.resource(
    'location',
    new ResourceTemplate('mythicindex://locations/{slug}', {
      list: async () => {
        const locations = await locationTools.listLocations({});
        return {
          resources: locations.map(l => ({
            uri: `mythicindex://locations/${l.slug}`,
            name: l.name,
            description: `${l.type || 'Location'} in ${l.region || 'unknown region'}`,
            mimeType: 'application/json',
          })),
        };
      },
      complete: {
        slug: async () => {
          const locations = await locationTools.listLocations({});
          return locations.map(l => l.slug);
        },
      },
    }),
    async (uri, { slug }) => {
      const location = await locationTools.getLocation({ name: slug as string });
      if (!location) {
        return { contents: [{ uri: uri.href, text: `Location not found: ${slug}`, mimeType: 'text/plain' }] };
      }
      return {
        contents: [{
          uri: uri.href,
          text: JSON.stringify(location, null, 2),
          mimeType: 'application/json',
        }],
      };
    }
  );

  // ============ Prompts (User-Controlled Workflow Templates) ============

  server.prompt(
    'write-scene',
    'Guide through writing a scene with proper character and location context',
    {
      chapter: z.string().describe('Chapter number or slug'),
      location: z.string().optional().describe('Where the scene takes place'),
      characters: z.string().optional().describe('Characters in the scene (comma-separated)'),
      mood: z.string().optional().describe('Emotional tone of the scene'),
    },
    async (args) => {
      const context = exploreTools.getWritingContext({
        chapter: args.chapter,
        characters: args.characters?.split(',').map(c => c.trim()),
        locations: args.location ? [args.location] : undefined,
      });

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `I want to write a scene for chapter ${args.chapter}.

## Context
${context.context}

## Scene Parameters
- Location: ${args.location || 'To be determined'}
- Characters: ${args.characters || 'To be determined'}
- Mood: ${args.mood || 'To be determined'}

Please help me write this scene, maintaining consistency with the established world and characters. Focus on:
1. Character voices and mannerisms
2. Setting details that match the location
3. Emotional beats that serve the story
4. Natural dialogue and interactions`,
          },
        }],
      };
    }
  );

  server.prompt(
    'create-character',
    'Structured character creation with archetypes and story role',
    {
      name: z.string().describe('Character name'),
      role: z.string().optional().describe('Story role (protagonist, antagonist, mentor, ally, etc.)'),
      archetype: z.string().optional().describe('Character archetype (hero, trickster, sage, etc.)'),
    },
    async (args) => {
      const existingCharacters = await characterTools.listCharacters({});
      const characterList = existingCharacters.map(c => `- ${c.name} (${c.role || 'unknown role'})`).join('\n');

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me create a new character named "${args.name}".

## Existing Characters
${characterList || 'No existing characters yet.'}

## Character Parameters
- Name: ${args.name}
- Story Role: ${args.role || 'To be determined'}
- Archetype: ${args.archetype || 'To be determined'}

Please help me develop this character by addressing:
1. **Appearance**: Physical description, distinguishing features, typical attire
2. **Personality**: Core traits, mannerisms, speech patterns
3. **Background**: History, formative experiences, secrets
4. **Motivations**: Goals, fears, what drives them
5. **Relationships**: How they might connect to existing characters
6. **Arc Potential**: How they might grow or change

Ensure this character feels distinct from existing characters while fitting the story's world.`,
          },
        }],
      };
    }
  );

  server.prompt(
    'plan-chapter',
    'Plan a chapter outline with key events and narrative beats',
    {
      number: z.string().describe('Chapter number'),
      arc: z.string().optional().describe('Story arc this chapter belongs to'),
      keyEvents: z.string().optional().describe('Key events that must happen (comma-separated)'),
    },
    async (args) => {
      const recap = await exploreTools.getRecap({ beforeChapter: parseInt(args.number, 10), maxChapters: 3 });
      const chapters = await chapterTools.listChapters({});
      const chapterList = chapters.slice(-5).map(c => `- Ch ${c.number}: ${c.title} [${c.status}]`).join('\n');

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me plan chapter ${args.number}.

## Story So Far
${recap.recap}

## Recent Chapters
${chapterList || 'No chapters yet.'}

## Chapter Parameters
- Chapter Number: ${args.number}
- Story Arc: ${args.arc || 'To be determined'}
- Key Events: ${args.keyEvents || 'To be determined'}

Please help me outline this chapter by defining:
1. **Opening Hook**: How to grab the reader's attention
2. **Scenes**: 3-5 key scenes with location, characters, and purpose
3. **Conflict**: The central tension driving this chapter
4. **Character Development**: Who grows and how
5. **Plot Advancement**: What story threads move forward
6. **Cliffhanger/Resolution**: How to end the chapter
7. **Foreshadowing**: Seeds to plant for future chapters`,
          },
        }],
      };
    }
  );

  server.prompt(
    'brainstorm-imagery',
    'Generate creative image ideas for a character, location, or chapter',
    {
      entityType: z.enum(['character', 'location', 'chapter']).describe('Type of entity'),
      slug: z.string().describe('Entity slug'),
    },
    async (args) => {
      const content = await imageryGenTools.getContentForImageryAnalysis({
        entityType: args.entityType,
        slug: args.slug,
        includeExistingImagery: true,
      });

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Help me brainstorm imagery for ${args.entityType}: ${args.slug}

## Content
${content.content}

## Art Style
${content.artStyle}

${content.analysisGuidance || ''}

Based on this content, suggest 3-5 image concepts that would be visually compelling. For each concept, provide:
1. **Title**: A short descriptive name
2. **Description**: What the image depicts
3. **Mood**: Emotional tone and atmosphere
4. **Composition**: Framing, perspective, focal points
5. **Key Details**: Important visual elements to include

Focus on images that capture the essence and emotion, not just literal depictions.`,
          },
        }],
      };
    }
  );

  server.prompt(
    'story-recap',
    'Get a comprehensive summary of the story up to a specific point',
    {
      upToChapter: z.string().optional().describe('Chapter number to recap up to (default: all)'),
      focus: z.string().optional().describe('Focus area: plot, characters, worldbuilding, or all'),
    },
    async (args) => {
      const chapterNum = args.upToChapter ? parseInt(args.upToChapter, 10) : undefined;
      const chapters = await chapterTools.listChapters({});
      const relevantChapters = chapterNum
        ? chapters.filter(c => (c.number || 0) <= chapterNum)
        : chapters;

      const chapterSummaries = relevantChapters.map(c =>
        `**Ch ${c.number}: ${c.title}** [${c.status}]\n${c.summary || 'No summary available.'}`
      ).join('\n\n');

      const characters = await characterTools.listCharacters({});
      const characterList = characters.map(c => `- ${c.name} (${c.role || 'unknown'})`).join('\n');

      const locations = await locationTools.listLocations({});
      const locationList = locations.map(l => `- ${l.name} (${l.type || 'unknown'})`).join('\n');

      return {
        messages: [{
          role: 'user',
          content: {
            type: 'text',
            text: `Please give me a comprehensive recap of the story${chapterNum ? ` up to chapter ${chapterNum}` : ''}.

## Chapters
${chapterSummaries || 'No chapters yet.'}

## Characters
${characterList || 'No characters yet.'}

## Locations
${locationList || 'No locations yet.'}

## Focus
${args.focus || 'All aspects'}

Please provide:
1. **Plot Summary**: Key events and story beats
2. **Character Arcs**: How main characters have developed
3. **Open Threads**: Unresolved plot points and mysteries
4. **World State**: Current situation in the story world
5. **Themes**: Recurring themes and motifs`,
          },
        }],
      };
    }
  );

  // ============ Start Server ============

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP Server started', {
    module: 'server',
    workspace: config.workspace.name,
    remoteApi: config.remote.apiUrl || '(not configured)',
    d1Enabled: isD1Available(),
  });
}

main().catch((error) => {
  // Try to use logger if available, fall back to console.error
  try {
    const logger = getLogger();
    if (logger) {
      logger.error('Fatal error', error as Error, { module: 'server' });
    } else {
      console.error('Fatal error (logger unavailable):', error);
    }
  } catch (loggerError) {
    // Logger completely unavailable, use console
    console.error('Fatal error (logger failed):', error);
    console.error('Logger error:', loggerError);
  }
  process.exit(1);
});

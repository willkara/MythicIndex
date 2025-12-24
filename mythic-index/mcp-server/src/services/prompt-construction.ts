/**
 * Prompt Construction Service
 * Auto-builds image generation prompts from content when no imagery.yaml exists
 */

import type { Character, Location, Chapter, Scene } from '../types/index.js';
import { getStorage } from './storage.js';
import { getConfig } from './config.js';

/**
 * A prompt candidate with metadata for scoring and selection
 */
export interface PromptCandidate {
  index: number;
  title: string;
  prompt: string;
  score: number;
  source: 'auto-constructed' | 'imagery-yaml';
  metadata?: {
    tension?: string;
    mood?: string;
    characters?: string[];
    location?: string;
  };
}

/**
 * Build a visual description string from character appearance data
 */
export function buildCharacterVisualDescription(character: Character): string {
  const parts: string[] = [];

  parts.push(`Portrait of ${character.name}`);

  if (character.appearance) {
    const { age, height, build, hair, eyes, distinguishingFeatures, clothing } = character.appearance;
    if (age) parts.push(`${age} years old`);
    if (height) parts.push(height);
    if (build) parts.push(`${build} build`);
    if (hair) parts.push(`${hair} hair`);
    if (eyes) parts.push(`${eyes} eyes`);
    if (distinguishingFeatures?.length) {
      parts.push(distinguishingFeatures.join(', '));
    }
    if (clothing) parts.push(`wearing ${clothing}`);
  }

  return parts.join(', ');
}

/**
 * Get expression/mood hint from personality
 */
function getExpressionFromPersonality(personality?: string): string | null {
  if (!personality) return null;
  const lower = personality.toLowerCase();

  if (lower.includes('stern') || lower.includes('serious') || lower.includes('stoic')) {
    return 'stern, serious expression';
  }
  if (lower.includes('cheerful') || lower.includes('friendly') || lower.includes('warm')) {
    return 'warm smile, approachable expression';
  }
  if (lower.includes('mysterious') || lower.includes('secretive') || lower.includes('enigmatic')) {
    return 'enigmatic expression, knowing gaze';
  }
  if (lower.includes('fierce') || lower.includes('warrior') || lower.includes('aggressive')) {
    return 'fierce expression, determined gaze';
  }
  if (lower.includes('scholarly') || lower.includes('intellectual') || lower.includes('wise')) {
    return 'thoughtful expression, wise eyes';
  }
  if (lower.includes('cunning') || lower.includes('sly') || lower.includes('clever')) {
    return 'sly smile, clever eyes';
  }

  return null;
}

/**
 * Get an action pose based on occupation
 */
function getActionPoseFromOccupation(occupation?: string): string | null {
  if (!occupation) return null;
  const lower = occupation.toLowerCase();

  if (lower.includes('warrior') || lower.includes('soldier') || lower.includes('knight')) {
    return 'in battle stance, weapon raised';
  }
  if (lower.includes('mage') || lower.includes('wizard') || lower.includes('sorcerer')) {
    return 'casting a spell, magical energy swirling';
  }
  if (lower.includes('healer') || lower.includes('cleric') || lower.includes('priest')) {
    return 'hands raised in blessing, divine light';
  }
  if (lower.includes('rogue') || lower.includes('thief') || lower.includes('assassin')) {
    return 'emerging from shadows, dagger in hand';
  }
  if (lower.includes('ranger') || lower.includes('hunter') || lower.includes('scout')) {
    return 'bow drawn, surveying terrain';
  }
  if (lower.includes('merchant') || lower.includes('trader')) {
    return 'examining goods, shrewd assessment';
  }
  if (lower.includes('scholar') || lower.includes('librarian')) {
    return 'reading ancient tome, candlelight';
  }

  return null;
}

/**
 * Construct prompts for a character from their profile data
 * Returns 3-5 varied portrait prompts
 */
export function constructCharacterPrompts(character: Character): PromptCandidate[] {
  const prompts: PromptCandidate[] = [];
  const baseVisual = buildCharacterVisualDescription(character);
  let index = 0;

  // 1. Signature Portrait - neutral, clear view
  const expression = getExpressionFromPersonality(character.personality);
  prompts.push({
    index: index++,
    title: 'Signature Portrait',
    prompt: `${baseVisual}${expression ? `, ${expression}` : ''}, classical three-quarter portrait lighting, detailed face`,
    score: 10,
    source: 'auto-constructed',
    metadata: { characters: [character.name] },
  });

  // 2. Action Pose - if occupation suggests one
  const actionPose = getActionPoseFromOccupation(character.occupation);
  if (actionPose) {
    prompts.push({
      index: index++,
      title: 'In Action',
      prompt: `${baseVisual}, ${actionPose}, dynamic composition, dramatic lighting`,
      score: 8,
      source: 'auto-constructed',
      metadata: { characters: [character.name] },
    });
  }

  // 3. Emotional Portrait - based on role
  let emotionalPrompt: string | null = null;
  if (character.role === 'protagonist') {
    emotionalPrompt = `${baseVisual}, moment of determination, heroic lighting, uplifting composition`;
  } else if (character.role === 'antagonist') {
    emotionalPrompt = `${baseVisual}, menacing presence, dramatic shadows, ominous atmosphere`;
  } else if (character.motivations?.length) {
    emotionalPrompt = `${baseVisual}, contemplative moment, soft lighting, introspective mood`;
  }

  if (emotionalPrompt) {
    prompts.push({
      index: index++,
      title: 'Emotional Moment',
      prompt: emotionalPrompt,
      score: 7,
      source: 'auto-constructed',
      metadata: { characters: [character.name] },
    });
  }

  // 4. Close-up Detail - distinctive features
  if (character.appearance?.distinguishingFeatures?.length) {
    const features = character.appearance.distinguishingFeatures.slice(0, 2).join(' and ');
    prompts.push({
      index: index++,
      title: 'Distinctive Features',
      prompt: `Close-up portrait of ${character.name}, focus on ${features}, dramatic side lighting, highly detailed`,
      score: 6,
      source: 'auto-constructed',
      metadata: { characters: [character.name] },
    });
  }

  // 5. Full Body - if clothing described
  if (character.appearance?.clothing) {
    prompts.push({
      index: index++,
      title: 'Full Figure',
      prompt: `Full body portrait of ${character.name}, ${buildCharacterVisualDescription(character)}, standing pose, environmental context, atmospheric lighting`,
      score: 5,
      source: 'auto-constructed',
      metadata: { characters: [character.name] },
    });
  }

  return prompts;
}

/**
 * Construct prompts for a location from its overview data
 * Returns 3-5 varied location prompts
 */
export function constructLocationPrompts(location: Location): PromptCandidate[] {
  const prompts: PromptCandidate[] = [];
  let index = 0;

  // Build base description
  const baseParts: string[] = [location.name];
  if (location.type) baseParts.push(location.type);
  if (location.description) baseParts.push(location.description);
  const baseDesc = baseParts.join(', ');

  // 1. Establishing Shot
  prompts.push({
    index: index++,
    title: 'Establishing View',
    prompt: `${baseDesc}, wide establishing shot, atmospheric perspective, ${location.atmosphere || 'dramatic lighting'}`,
    score: 10,
    source: 'auto-constructed',
    metadata: { location: location.name },
  });

  // 2. Atmospheric Shot - with features
  if (location.features?.length) {
    const features = location.features.slice(0, 3).join(', ');
    prompts.push({
      index: index++,
      title: 'Notable Features',
      prompt: `${location.name}, focusing on ${features}, ${location.atmosphere || 'dramatic lighting'}, detailed architecture`,
      score: 8,
      source: 'auto-constructed',
      metadata: { location: location.name },
    });
  }

  // 3. Time variations
  const timeVariations = [
    { time: 'dawn', mood: 'golden hour light, mist rising, peaceful' },
    { time: 'dusk', mood: 'warm sunset light, long shadows, contemplative' },
    { time: 'night', mood: 'moonlight, torches and lanterns, mysterious' },
  ];

  // Pick one based on atmosphere
  let selectedTime = timeVariations[0];
  if (location.atmosphere?.toLowerCase().includes('dark') || location.atmosphere?.toLowerCase().includes('mysterious')) {
    selectedTime = timeVariations[2];
  } else if (location.atmosphere?.toLowerCase().includes('peaceful') || location.atmosphere?.toLowerCase().includes('serene')) {
    selectedTime = timeVariations[0];
  }

  prompts.push({
    index: index++,
    title: `At ${selectedTime.time.charAt(0).toUpperCase() + selectedTime.time.slice(1)}`,
    prompt: `${baseDesc}, at ${selectedTime.time}, ${selectedTime.mood}`,
    score: 7,
    source: 'auto-constructed',
    metadata: { location: location.name },
  });

  // 4. Detail shot - if history mentioned
  if (location.history) {
    prompts.push({
      index: index++,
      title: 'Historical Detail',
      prompt: `${location.name}, close-up on weathered architectural details showing age and history, storytelling through texture, ${location.atmosphere || 'atmospheric lighting'}`,
      score: 6,
      source: 'auto-constructed',
      metadata: { location: location.name },
    });
  }

  // 5. Inhabited view - if inhabitants mentioned
  if (location.inhabitants?.length) {
    prompts.push({
      index: index++,
      title: 'Lived-In View',
      prompt: `${location.name}, showing signs of inhabitants, ${location.atmosphere || 'warm lighting'}, environmental storytelling`,
      score: 5,
      source: 'auto-constructed',
      metadata: { location: location.name },
    });
  }

  return prompts;
}

/**
 * Score a scene for visual potential
 */
function scoreScene(scene: Scene): number {
  let score = 5; // Base score

  // Tension bonus
  if (scene.tension === 'climax') score += 4;
  else if (scene.tension === 'high') score += 3;
  else if (scene.tension === 'medium') score += 1;

  // Mood bonus (if specified, scene is more visually defined)
  if (scene.mood) score += 1;

  // Character presence bonus
  if (scene.charactersPresent?.length) {
    score += Math.min(scene.charactersPresent.length, 3);
  }

  // Location bonus
  if (scene.location) score += 1;

  // Summary presence (more detail = better visual potential)
  if (scene.summary && scene.summary.length > 100) score += 1;

  return score;
}

/**
 * Build a visual prompt for a scene, enriching with character visuals
 */
function buildScenePrompt(scene: Scene, chapter: Chapter): string {
  const parts: string[] = [];

  // Scene title/summary
  if (scene.title) {
    parts.push(`Scene: ${scene.title}`);
  }
  if (scene.summary) {
    // Use first 200 chars of summary as description
    parts.push(scene.summary.slice(0, 200));
  }

  // Location context
  if (scene.location) {
    parts.push(`Setting: ${scene.location}`);
  }

  // Characters present - try to get visual details
  if (scene.charactersPresent?.length) {
    const config = getConfig();
    const storage = getStorage();
    const characterDetails: string[] = [];

    for (const charName of scene.charactersPresent.slice(0, 3)) {
      const char = storage.getCharacter(config.workspace.id, charName);
      if (char?.appearance) {
        const brief = [
          char.name,
          char.appearance.hair ? `${char.appearance.hair} hair` : null,
          char.appearance.distinguishingFeatures?.[0],
        ].filter(Boolean).join(', ');
        characterDetails.push(brief);
      } else {
        characterDetails.push(charName);
      }
    }

    parts.push(`Characters: ${characterDetails.join('; ')}`);
  }

  // Mood and atmosphere
  if (scene.mood) {
    parts.push(`Mood: ${scene.mood}`);
  }
  if (scene.timeOfDay) {
    parts.push(`Time: ${scene.timeOfDay}`);
  }

  // Tension-based composition hints
  if (scene.tension === 'climax' || scene.tension === 'high') {
    parts.push('dramatic composition, peak action moment');
  }

  return parts.join('. ');
}

/**
 * Construct prompts for a chapter from its scenes and content
 * Returns 5-8 key moment prompts scored by visual potential
 */
export function constructChapterPrompts(chapter: Chapter): PromptCandidate[] {
  const prompts: PromptCandidate[] = [];

  // If chapter has scenes, use those
  if (chapter.scenes?.length) {
    const scoredScenes = chapter.scenes
      .map(scene => ({
        scene,
        score: scoreScene(scene),
      }))
      .sort((a, b) => b.score - a.score);

    // Take top 8 scenes
    const topScenes = scoredScenes.slice(0, 8);

    topScenes.forEach((item, idx) => {
      prompts.push({
        index: idx,
        title: item.scene.title || `Scene ${item.scene.sequence}`,
        prompt: buildScenePrompt(item.scene, chapter),
        score: item.score,
        source: 'auto-constructed',
        metadata: {
          tension: item.scene.tension,
          mood: item.scene.mood,
          characters: item.scene.charactersPresent,
          location: item.scene.location,
        },
      });
    });
  }

  // If no scenes or few scenes, create prompts from chapter-level data
  if (prompts.length < 3) {
    let idx = prompts.length;

    // Opening scene with POV character
    if (chapter.povCharacter) {
      const config = getConfig();
      const storage = getStorage();
      const povChar = storage.getCharacter(config.workspace.id, chapter.povCharacter);
      const povVisual = povChar ? buildCharacterVisualDescription(povChar) : chapter.povCharacter;

      prompts.push({
        index: idx++,
        title: `${chapter.title} - Opening`,
        prompt: `${povVisual}, opening scene of ${chapter.title}, ${chapter.summary?.slice(0, 150) || 'establishing moment'}`,
        score: 8,
        source: 'auto-constructed',
        metadata: { characters: [chapter.povCharacter] },
      });
    }

    // Featured locations
    if (chapter.featuredLocations?.length) {
      const loc = chapter.featuredLocations[0];
      prompts.push({
        index: idx++,
        title: `${loc} - Chapter Setting`,
        prompt: `${loc}, setting for ${chapter.title}, atmospheric establishing shot`,
        score: 7,
        source: 'auto-constructed',
        metadata: { location: loc },
      });
    }

    // Chapter climax
    if (chapter.summary) {
      prompts.push({
        index: idx++,
        title: `${chapter.title} - Key Moment`,
        prompt: `Key dramatic moment from ${chapter.title}. ${chapter.summary.slice(0, 200)}. Dramatic lighting, emotional peak.`,
        score: 9,
        source: 'auto-constructed',
      });
    }
  }

  return prompts;
}

/**
 * Score and rank an array of prompts, returning the top N
 */
export function scoreAndRankPrompts(prompts: PromptCandidate[], limit: number = 8): PromptCandidate[] {
  return prompts
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p, idx) => ({ ...p, index: idx }));
}

/**
 * Get recommended indices for a set of prompts (top scoring ones)
 */
export function getRecommendedIndices(prompts: PromptCandidate[], count: number = 5): number[] {
  return prompts
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map(p => p.index);
}

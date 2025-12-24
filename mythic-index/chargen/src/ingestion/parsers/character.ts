/**
 * Character parsing module
 * Parses character profile.md and relationships.md files into typed data
 */

import * as yaml from 'yaml';
import type {
  ParsedCharacter,
  ParsedRelationship,
  CharacterAppearance,
  CharacterPersonality,
  CharacterCombat,
  CharacterVoice,
} from './types.js';

// ============================================================================
// YAML Frontmatter Parsing
// ============================================================================

interface RawFrontmatter {
  name: string;
  aliases?: string[];
  race?: string;
  class?: string;
  role?: string;
}

function extractFrontmatter(content: string): { frontmatter: RawFrontmatter | null; body: string } {
  if (!content.startsWith('---')) {
    return { frontmatter: null, body: content };
  }

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { frontmatter: null, body: content };
  }

  const yamlContent = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trim();

  try {
    const parsed = yaml.parse(yamlContent) as RawFrontmatter;
    return { frontmatter: parsed, body };
  } catch {
    return { frontmatter: null, body: content };
  }
}

// ============================================================================
// Section Parsing
// ============================================================================

interface Section {
  title: string;
  level: number;
  content: string;
}

function parseSections(content: string): Section[] {
  const sections: Section[] = [];
  // Normalize line endings (Windows -> Unix)
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let currentSection: Section | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join('\n').trim();
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        title: headingMatch[2],
        level: headingMatch[1].length,
        content: '',
      };
      currentContent = [];
    } else if (currentSection) {
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = currentContent.join('\n').trim();
    sections.push(currentSection);
  }

  return sections;
}

// ============================================================================
// List Item Parsing
// ============================================================================

interface ListItem {
  label: string;
  value: string;
}

function parseListItems(content: string): ListItem[] {
  const items: ListItem[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match "- **Label**: Value" pattern
    const match = line.match(/^-\s+\*\*([^*]+)\*\*:\s*(.+)$/);
    if (match) {
      items.push({
        label: match[1].trim(),
        value: match[2].trim(),
      });
    }
  }

  return items;
}

function getListItemValue(items: ListItem[], label: string): string | undefined {
  const item = items.find((i) => i.label.toLowerCase() === label.toLowerCase());
  return item?.value;
}

// ============================================================================
// Appearance Parsing
// ============================================================================

function parseAppearance(section: Section | undefined): CharacterAppearance {
  if (!section) return {};

  const items = parseListItems(section.content);

  return {
    age: getListItemValue(items, 'Age'),
    height: getListItemValue(items, 'Height/Build')?.split(',')[0]?.trim(),
    build:
      getListItemValue(items, 'Height/Build')?.split(',').slice(1).join(',')?.trim() ||
      getListItemValue(items, 'Build'),
    hair: getListItemValue(items, 'Hair'),
    eyes: getListItemValue(items, 'Eyes'),
    distinguishingFeatures: parseCommaSeparatedOrMultiLine(
      getListItemValue(items, 'Distinguishing Features')
    ),
    clothing: getListItemValue(items, 'Typical Clothing'),
  };
}

// ============================================================================
// Personality Parsing
// ============================================================================

function parsePersonality(section: Section | undefined): CharacterPersonality {
  if (!section) return {};

  const items = parseListItems(section.content);

  return {
    archetype: getListItemValue(items, 'Archetype'),
    temperament: getListItemValue(items, 'Temperament'),
    positiveTraits: parseCommaSeparatedOrMultiLine(getListItemValue(items, 'Positive Traits')),
    negativeTraits: parseCommaSeparatedOrMultiLine(getListItemValue(items, 'Negative Traits')),
    moralAlignment: getListItemValue(items, 'Moral Alignment'),
  };
}

// ============================================================================
// Combat Parsing
// ============================================================================

function parseCombat(section: Section | undefined): CharacterCombat {
  if (!section) return {};

  const items = parseListItems(section.content);

  return {
    primaryWeapons: getListItemValue(items, 'Primary Weapons'),
    fightingStyle: getListItemValue(items, 'Fighting Style'),
    tacticalRole: getListItemValue(items, 'Tactical Role'),
  };
}

// ============================================================================
// Voice Parsing
// ============================================================================

function parseVoice(section: Section | undefined): CharacterVoice {
  if (!section) return {};

  const items = parseListItems(section.content);
  const speechStyle = getListItemValue(items, 'Speech Style');

  // Parse signature phrases - they may be nested list items
  const phrases: string[] = [];
  const lines = section.content.split('\n');
  let inPhrases = false;

  for (const line of lines) {
    if (line.includes('**Signature Phrases**')) {
      inPhrases = true;
      continue;
    }
    if (inPhrases && line.match(/^-\s+\*\*/)) {
      inPhrases = false;
      continue;
    }
    if (inPhrases) {
      // Match "  - " or "  - \"phrase\""
      const phraseMatch = line.match(/^\s+-\s+[""]?([^""]+)[""]?$/);
      if (phraseMatch) {
        phrases.push(phraseMatch[1].trim().replace(/^[""]|[""]$/g, ''));
      }
    }
  }

  return {
    speechStyle,
    signaturePhrases: phrases.length > 0 ? phrases : undefined,
  };
}

// ============================================================================
// Helpers
// ============================================================================

function parseCommaSeparatedOrMultiLine(value: string | undefined): string[] {
  if (!value) return [];

  // Check if it's comma-separated
  if (value.includes(',')) {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // Could be a single value
  return [value.trim()].filter(Boolean);
}

function findSection(sections: Section[], titlePattern: RegExp): Section | undefined {
  return sections.find((s) => titlePattern.test(s.title));
}

function extractProse(section: Section | undefined): string | undefined {
  if (!section) return undefined;

  // Remove list items, keep only prose paragraphs
  const lines = section.content.split('\n');
  const prose: string[] = [];

  for (const line of lines) {
    if (!line.startsWith('-') && line.trim()) {
      prose.push(line);
    }
  }

  const result = prose.join('\n').trim();
  return result || undefined;
}

// ============================================================================
// Main Parser
// ============================================================================

export function parseCharacterProfile(slug: string, content: string): ParsedCharacter {
  const { frontmatter, body } = extractFrontmatter(content);
  const sections = parseSections(body);

  // Find specific sections
  const basicInfo = findSection(sections, /Basic Information/i);
  const physicalDesc = findSection(sections, /Physical Description/i);
  const visualSummary = findSection(sections, /Visual Summary/i);
  const personality = findSection(sections, /^Personality$/i);
  const combat = findSection(sections, /Combat|Tactics/i);
  const voice = findSection(sections, /Voice|Dialogue/i);
  const personalDetails = findSection(sections, /Personal Details/i);
  const notes = findSection(sections, /^Notes$/i);

  // Parse basic info list items
  const basicItems = basicInfo ? parseListItems(basicInfo.content) : [];

  // Extract motivations, fears, secrets from psychology section or personal details
  const psychology = findSection(sections, /Psychology|Psychological/i);
  const psychItems = psychology ? parseListItems(psychology.content) : [];
  const personalItems = personalDetails ? parseListItems(personalDetails.content) : [];

  return {
    slug,
    frontmatter: frontmatter || { name: slug },
    name: frontmatter?.name || getListItemValue(basicItems, 'Full Name') || slug,
    aliases:
      frontmatter?.aliases ||
      parseCommaSeparatedOrMultiLine(getListItemValue(basicItems, 'Aliases/Nicknames')),
    race: frontmatter?.race || getListItemValue(basicItems, 'Race'),
    characterClass: frontmatter?.class || getListItemValue(basicItems, 'Class'),
    role:
      frontmatter?.role ||
      getListItemValue(basicItems, 'Role in Story')?.toLowerCase().replace(/\s+/g, '_'),
    status: getListItemValue(basicItems, 'Status') || 'alive',
    firstAppearance: getListItemValue(basicItems, 'First Appearance'),
    appearance: parseAppearance(physicalDesc),
    visualSummary: extractProse(visualSummary),
    personality: parsePersonality(personality),
    background: extractProse(findSection(sections, /Background|History/i)),
    motivations: parseCommaSeparatedOrMultiLine(
      getListItemValue(psychItems, 'Motivations') || getListItemValue(personalItems, 'Motivations')
    ),
    fears: parseCommaSeparatedOrMultiLine(
      getListItemValue(psychItems, 'Fears') || getListItemValue(personalItems, 'Fears')
    ),
    secrets: parseCommaSeparatedOrMultiLine(
      getListItemValue(psychItems, 'Secrets') || getListItemValue(personalItems, 'Secrets')
    ),
    combat: parseCombat(combat),
    voice: parseVoice(voice),
    faction: getListItemValue(basicItems, 'Faction'),
    occupation: getListItemValue(basicItems, 'Occupation'),
    notes: extractProse(notes),
  };
}

// ============================================================================
// Relationship Parser
// ============================================================================

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function inferRelationshipType(
  natureLine: string | undefined,
  dynamicsLine: string | undefined
): ParsedRelationship['relationshipType'] {
  const text = `${natureLine || ''} ${dynamicsLine || ''}`.toLowerCase();

  if (text.includes('enemy') || text.includes('adversar') || text.includes('antagoni')) {
    return 'enemy';
  }
  if (text.includes('rival') || text.includes('competit')) {
    return 'rival';
  }
  if (text.includes('mentor')) {
    return 'mentor';
  }
  if (text.includes('student') || text.includes('apprentice')) {
    return 'student';
  }
  if (
    text.includes('family') ||
    text.includes('brother') ||
    text.includes('sister') ||
    text.includes('parent') ||
    text.includes('child') ||
    text.includes('father') ||
    text.includes('mother')
  ) {
    return 'family';
  }
  if (text.includes('romantic') || text.includes('love') || text.includes('partner')) {
    return 'romantic';
  }
  if (
    text.includes('ally') ||
    text.includes('friend') ||
    text.includes('loyal') ||
    text.includes('trust') ||
    text.includes('colleague')
  ) {
    return 'ally';
  }

  return 'neutral';
}

export function parseCharacterRelationships(content: string): ParsedRelationship[] {
  const relationships: ParsedRelationship[] = [];
  const sections = parseSections(content);

  for (const section of sections) {
    // Skip top-level and category sections
    if (section.level <= 2) continue;

    // Section title is the character name (e.g., "**Veyra Thornwake**:" or "Veyra Thornwake")
    const nameMatch =
      section.title.match(/^\*\*([^*]+)\*\*:?\s*$/) || section.title.match(/^([^:]+):?\s*$/);
    if (!nameMatch) continue;

    const targetName = nameMatch[1].trim();
    const targetSlug = slugify(targetName);

    // Parse the content for relationship details
    const items = parseListItems(section.content);
    const natureLine = getListItemValue(items, 'Nature of Relationship');
    const dynamicsLine = getListItemValue(items, 'Dynamics');
    const relationshipType = inferRelationshipType(natureLine, dynamicsLine);

    // Build description from available fields
    const descParts: string[] = [];
    if (natureLine) descParts.push(natureLine);
    if (dynamicsLine) descParts.push(dynamicsLine);
    const historyLine = getListItemValue(items, 'History');
    if (historyLine) descParts.push(historyLine);

    relationships.push({
      targetSlug,
      targetName,
      relationshipType,
      description: descParts.length > 0 ? descParts.join(' ') : undefined,
    });
  }

  return relationships;
}

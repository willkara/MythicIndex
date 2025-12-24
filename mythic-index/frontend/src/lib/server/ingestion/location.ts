/**
 * Location parsing module
 * Parses location overview.md files into typed data
 */

import * as yaml from 'yaml';
import type { ParsedLocation, LocationFrontmatter } from './types';

// ============================================================================
// YAML Frontmatter Parsing
// ============================================================================

/**
 * Extract YAML frontmatter from location overview markdown
 *
 * @param content - Raw markdown content with optional frontmatter
 * @returns Object containing parsed frontmatter and body content
 */
function extractFrontmatter(content: string): {
  frontmatter: LocationFrontmatter | null;
  body: string;
} {
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
    const parsed = yaml.parse(yamlContent) as LocationFrontmatter;
    return { frontmatter: parsed, body };
  } catch {
    return { frontmatter: null, body: content };
  }
}

// ============================================================================
// Section Parsing
// ============================================================================

/**
 * Represents a markdown section with heading and content
 */
interface Section {
  title: string;
  level: number;
  content: string;
}

/**
 * Parse markdown content into sections by headings
 *
 * @param content - Markdown content to parse
 * @returns Array of sections with titles, levels, and content
 */
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
  const item = items.find(i => i.label.toLowerCase() === label.toLowerCase());
  return item?.value;
}

// ============================================================================
// Helpers
// ============================================================================

function findSection(sections: Section[], titlePattern: RegExp): Section | undefined {
  return sections.find(s => titlePattern.test(s.title));
}

function extractProse(section: Section | undefined): string | undefined {
  if (!section) return undefined;

  // For prose sections like Quick Description, the content might be plain text
  // or list items. Extract non-list lines.
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

function parseCommaSeparatedOrMultiLine(value: string | undefined): string[] {
  if (!value) return [];

  if (value.includes(',')) {
    return value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  return [value.trim()].filter(Boolean);
}

function parseNestedList(section: Section | undefined): string[] {
  if (!section) return [];

  const items: string[] = [];
  const lines = section.content.split('\n');

  for (const line of lines) {
    // Match "- Item" or "  - Nested item"
    const match = line.match(/^\s*-\s+(.+)$/);
    if (match) {
      // Remove bold formatting
      const cleaned = match[1].replace(/\*\*([^*]+)\*\*/g, '$1').trim();
      // Skip if it's a label:value pair
      if (!cleaned.includes(':')) {
        items.push(cleaned);
      }
    }
  }

  return items;
}

// ============================================================================
// Key Personnel Parsing
// ============================================================================

function parseKeyPersonnel(section: Section | undefined): string[] {
  if (!section) return [];

  const personnel: string[] = [];
  const lines = section.content.split('\n');

  for (const line of lines) {
    // Match "- **Name**: Description" and extract just the name
    const match = line.match(/^-\s+\*\*([^*]+)\*\*/);
    if (match) {
      // Convert name to slug format
      const name = match[1].trim();
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      personnel.push(slug);
    }
  }

  return personnel;
}

// ============================================================================
// Notable Landmarks Parsing
// ============================================================================

function parseNotableLandmarks(section: Section | undefined, allSections: Section[]): string[] {
  if (!section) return [];

  // First, try to find a dedicated "Architectural Landmarks" subsection
  const landmarksSection = allSections.find(
    s =>
      s.title.toLowerCase().includes('architectural landmarks') ||
      (s.title.toLowerCase().includes('landmarks') && s.level > 2)
  );

  if (landmarksSection) {
    // Extract items from the subsection - get just the bold names
    const items: string[] = [];
    const lines = landmarksSection.content.split('\n');
    for (const line of lines) {
      // Match "- **Name**: Description" and extract just the name
      const match = line.match(/^-\s+\*\*([^*]+)\*\*/);
      if (match) {
        items.push(match[1].trim());
      }
    }
    if (items.length > 0) return items;
  }

  // Fallback: Look for list items with "landmark" or "notable" label
  const items = parseListItems(section.content);
  const landmarksItem = items.find(
    i => i.label.toLowerCase().includes('landmark') || i.label.toLowerCase().includes('notable')
  );

  if (landmarksItem) {
    return parseCommaSeparatedOrMultiLine(landmarksItem.value);
  }

  // Try parsing as nested list
  return parseNestedList(section);
}

// ============================================================================
// Story Role Parsing
// ============================================================================

function parseStoryRole(sections: Section[]): string | undefined {
  const storyRoleSection = findSection(sections, /Story Role/i);
  if (!storyRoleSection) return undefined;

  // Look for Plot Relevance and Symbolic Meaning subsections
  const plotRelevance = sections.find(
    s => s.title.toLowerCase().includes('plot relevance') && s.level > 2
  );
  const symbolicMeaning = sections.find(
    s => s.title.toLowerCase().includes('symbolic meaning') && s.level > 2
  );

  const parts: string[] = [];

  if (plotRelevance?.content) {
    const prose = extractProse(plotRelevance);
    if (prose) parts.push(`**Plot Relevance:** ${prose}`);
  }

  if (symbolicMeaning?.content) {
    const prose = extractProse(symbolicMeaning);
    if (prose) parts.push(`**Symbolic Meaning:** ${prose}`);
  }

  // If no subsections found, use the main section content
  if (parts.length === 0) {
    const mainProse = extractProse(storyRoleSection);
    if (mainProse) return mainProse;
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

// ============================================================================
// Hazards/Dangers Parsing
// ============================================================================

function parseHazardsDangers(sections: Section[]): string[] {
  const hazardsSection = findSection(sections, /Hazards|Dangers/i);
  if (!hazardsSection) return [];

  const hazards: string[] = [];

  // Look for subsections like "Operational Risks", "Structural Vulnerabilities"
  const hazardSubsections = sections.filter(
    s =>
      s.level > 2 &&
      (s.title.toLowerCase().includes('risk') ||
        s.title.toLowerCase().includes('vulnerabilit') ||
        s.title.toLowerCase().includes('hazard') ||
        s.title.toLowerCase().includes('danger'))
  );

  for (const sub of hazardSubsections) {
    // Extract list items from each subsection
    const lines = sub.content.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s+\*\*([^*]+)\*\*:\s*(.+)$/);
      if (match) {
        // Format as "Category: Description"
        hazards.push(`${match[1].trim()}: ${match[2].trim()}`);
      } else {
        // Simple list item
        const simpleMatch = line.match(/^-\s+(.+)$/);
        if (simpleMatch && !simpleMatch[1].startsWith('#')) {
          hazards.push(simpleMatch[1].trim());
        }
      }
    }
  }

  // If no subsections, parse the main section
  if (hazards.length === 0) {
    const lines = hazardsSection.content.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s+(.+)$/);
      if (match) {
        hazards.push(match[1].replace(/\*\*([^*]+)\*\*/g, '$1').trim());
      }
    }
  }

  return hazards;
}

// ============================================================================
// Connections Parsing
// ============================================================================

function parseConnections(sections: Section[]): string[] {
  const connectionsSection = findSection(sections, /Connections|Connected/i);
  if (!connectionsSection) return [];

  const connections: string[] = [];

  // Look for "Connected Locations" subsection
  const connectedLocations = sections.find(
    s => s.title.toLowerCase().includes('connected locations') && s.level > 2
  );

  if (connectedLocations) {
    const lines = connectedLocations.content.split('\n');
    for (const line of lines) {
      // Match "- **Location Name**: Description"
      const match = line.match(/^-\s+\*\*([^*]+)\*\*/);
      if (match) {
        connections.push(match[1].trim());
      }
    }
  }

  // Also check for Transportation Networks
  const transportSection = sections.find(
    s => s.title.toLowerCase().includes('transportation') && s.level > 2
  );

  if (transportSection) {
    const lines = transportSection.content.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s+\*\*([^*]+)\*\*/);
      if (match) {
        connections.push(match[1].trim());
      }
    }
  }

  // If no subsections, parse the main section
  if (connections.length === 0) {
    const lines = connectionsSection.content.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s+\*\*([^*]+)\*\*/);
      if (match) {
        connections.push(match[1].trim());
      }
    }
  }

  return connections;
}

// ============================================================================
// Accessibility Parsing
// ============================================================================

function parseAccessibility(sections: Section[]): string | undefined {
  const accessSection = findSection(sections, /Accessibility/i);
  if (!accessSection) return undefined;

  // Look for subsections like "Access Restrictions", "Hidden Paths"
  const accessSubsections = sections.filter(
    s =>
      s.level > 2 &&
      (s.title.toLowerCase().includes('access') ||
        s.title.toLowerCase().includes('restriction') ||
        s.title.toLowerCase().includes('hidden') ||
        s.title.toLowerCase().includes('path') ||
        s.title.toLowerCase().includes('entry'))
  );

  const parts: string[] = [];

  for (const sub of accessSubsections) {
    const items: string[] = [];
    const lines = sub.content.split('\n');
    for (const line of lines) {
      const match = line.match(/^-\s+\*\*([^*]+)\*\*:\s*(.+)$/);
      if (match) {
        items.push(`${match[1].trim()}: ${match[2].trim()}`);
      } else {
        const simpleMatch = line.match(/^-\s+(.+)$/);
        if (simpleMatch) {
          items.push(simpleMatch[1].replace(/\*\*([^*]+)\*\*/g, '$1').trim());
        }
      }
    }
    if (items.length > 0) {
      parts.push(`**${sub.title.replace(/\*\*/g, '')}:** ${items.join('; ')}`);
    }
  }

  if (parts.length > 0) {
    return parts.join('\n\n');
  }

  // Fallback to main section prose
  return extractProse(accessSection);
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parse location overview.md file into structured data
 *
 * Extracts frontmatter, description, features, landmarks, personnel, history,
 * story role, hazards, connections, and accessibility from structured sections.
 *
 * @param slug - Location slug identifier
 * @param content - Raw markdown content
 * @returns Parsed location data
 */
export function parseLocationOverview(slug: string, content: string): ParsedLocation {
  const { frontmatter, body } = extractFrontmatter(content);
  const sections = parseSections(body);

  // Find specific sections
  const basicInfo = findSection(sections, /Basic Information/i);
  const quickDesc = findSection(sections, /Quick Description/i);
  const visualSummary = findSection(sections, /Visual Summary/i);
  const keyFeatures = findSection(sections, /Key Features/i);
  const keyPersonnel = findSection(sections, /Key Personnel/i);
  const _currentStatus = findSection(sections, /Current Status/i);
  const _notes = findSection(sections, /^Notes$/i);
  const history = findSection(sections, /History/i);

  // Parse basic info list items
  const basicItems = basicInfo ? parseListItems(basicInfo.content) : [];
  const featuresItems = keyFeatures ? parseListItems(keyFeatures.content) : [];

  // Determine location type from frontmatter or content
  let locationType = frontmatter?.type;
  if (!locationType) {
    const typeValue = getListItemValue(basicItems, 'Type');
    if (typeValue) {
      // Map common types
      const lowerType = typeValue.toLowerCase();
      if (
        lowerType.includes('government') ||
        lowerType.includes('military') ||
        lowerType.includes('complex')
      ) {
        locationType = 'building';
      } else if (lowerType.includes('medical') || lowerType.includes('facility')) {
        locationType = 'building';
      } else if (lowerType.includes('city')) {
        locationType = 'city';
      } else if (
        lowerType.includes('tavern') ||
        lowerType.includes('inn') ||
        lowerType.includes('hall')
      ) {
        locationType = 'building';
      } else if (lowerType.includes('region') || lowerType.includes('district')) {
        locationType = 'region';
      } else if (
        lowerType.includes('natural') ||
        lowerType.includes('canyon') ||
        lowerType.includes('forest')
      ) {
        locationType = 'natural';
      } else if (
        lowerType.includes('mine') ||
        lowerType.includes('lode') ||
        lowerType.includes('underground')
      ) {
        locationType = 'landmark';
      } else if (
        lowerType.includes('sanctuary') ||
        lowerType.includes('grove') ||
        lowerType.includes('temple')
      ) {
        locationType = 'landmark';
      } else if (
        lowerType.includes('library') ||
        lowerType.includes('academy') ||
        lowerType.includes('spire')
      ) {
        locationType = 'building';
      } else if (
        lowerType.includes('watchpost') ||
        lowerType.includes('outpost') ||
        lowerType.includes('fort')
      ) {
        locationType = 'building';
      } else if (lowerType.includes('warehouse') || lowerType.includes('dock')) {
        locationType = 'building';
      }
    }
  }

  // Parse visual summary - could be prose or bullet list
  let visualSummaryText: string | undefined;
  let atmosphereFromVisualSummary: string | undefined;

  if (visualSummary) {
    const content = visualSummary.content;

    // Extract "Atmospheric Progression" paragraph from Visual Summary
    const atmosphereMatch = content.match(
      /\*\*Atmospheric Progression\*\*:\s*([^]*?)(?=\n\n|\*\*[A-Z]|\n##|$)/i
    );
    if (atmosphereMatch) {
      atmosphereFromVisualSummary = atmosphereMatch[1].trim();
    }

    const prose = extractProse(visualSummary);
    if (prose) {
      visualSummaryText = prose;
    } else {
      // It's a bullet list - combine into prose
      const listItems = parseNestedList(visualSummary);
      if (listItems.length > 0) {
        visualSummaryText = listItems.join('; ');
      }
    }
  }

  // Get atmosphere from: frontmatter > featuresItems > visual summary extraction
  const atmosphere =
    frontmatter?.atmosphere ||
    getListItemValue(featuresItems, 'Atmosphere') ||
    atmosphereFromVisualSummary;

  // Extract significance level and first appearance from basic info
  const significanceLevel = getListItemValue(basicItems, 'Significance Level');
  const firstAppearance = getListItemValue(basicItems, 'First Appearance');

  return {
    slug,
    frontmatter: frontmatter || { name: slug },
    name:
      frontmatter?.name ||
      slug
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' '),
    locationType,
    region: frontmatter?.region || getListItemValue(basicItems, 'Region'),
    parentLocation: undefined, // Would need to be resolved from context
    quickDescription: extractProse(quickDesc),
    visualSummary: visualSummaryText,
    atmosphere,
    history: extractProse(history),
    notableLandmarks: parseNotableLandmarks(keyFeatures, sections),
    keyPersonnel: parseKeyPersonnel(keyPersonnel),
    // Extended fields
    storyRole: parseStoryRole(sections),
    hazardsDangers: parseHazardsDangers(sections),
    connections: parseConnections(sections),
    accessibility: parseAccessibility(sections),
    significanceLevel,
    firstAppearance,
  };
}

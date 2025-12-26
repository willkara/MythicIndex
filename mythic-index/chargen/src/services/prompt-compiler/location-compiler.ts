/**
 * Location Prompt Compiler
 *
 * Compiles location imagery.yaml into CompiledPromptIR structures
 * that can be rendered into final prompts.
 */

import type {
  CompiledPromptIR,
  ResolvedReference,
  ExtendedLocationImagery,
  ExtendedLocationOverview,
  ExtendedLocationZone,
  ZoneImageSpec,
  CompilerOptions,
  ImageType,
  LightingSpec,
  PaletteSpec,
} from '../../types/prompt-ir.js';
import {
  resolveConstraints,
  resolveLighting,
  resolvePalette,
  resolveRequiredElements,
  resolveNegativePrompt,
  type LocationPrecedenceSources,
} from './precedence.js';
import {
  readLocationImagery,
  getLocationReferencePaths,
  getCharacterReferencePaths,
  resolveAsset,
} from '../asset-registry.js';
import { buildZoneImageTargetId, getImagesDir } from '../imagery-yaml.js';
import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { logPhase, logStep, logDetail, logLocationResolution } from '../../ui/log.js';
import { showSuccess } from '../../ui/display.js';

function countKeywordMatches(haystack: string, keywords: string[]): number {
  const lower = haystack.toLowerCase();
  return keywords.reduce((sum, k) => (lower.includes(k) ? sum + 1 : sum), 0);
}

function getOverviewSlug(overview: ExtendedLocationOverview | undefined): string {
  if (overview?.slug) return overview.slug;
  return 'overview';
}

function getZoneSlug(zone: ExtendedLocationZone): string {
  return zone.slug || (zone as { zone_slug?: string }).zone_slug || zone.name;
}

function getZoneName(zone: ExtendedLocationZone): string {
  return zone.name || (zone as { zone_name?: string }).zone_name || zone.title || getZoneSlug(zone);
}

function inferFantasyCuesText(targetText: string): string {
  const urban = [
    'city',
    'district',
    'ward',
    'street',
    'alley',
    'market',
    'harbor',
    'dock',
    'pier',
    'port',
    'tavern',
    'inn',
    'shop',
    'guild',
    'warehouse',
    'watch',
    'headquarters',
    'hall',
    'library',
    'tower',
    'spire',
  ];
  const wild = [
    'forest',
    'grove',
    'canyon',
    'wilderness',
    'woods',
    'road',
    'trail',
    'mountain',
    'valley',
    'river',
    'swamp',
    'marsh',
  ];
  const interior = ['interior', 'hall', 'room', 'chamber', 'workshop', 'tavern', 'inn', 'guild'];

  const urbanScore = countKeywordMatches(targetText, urban);
  const wildScore = countKeywordMatches(targetText, wild);
  const interiorScore = countKeywordMatches(targetText, interior);

  if (wildScore > urbanScore) {
    return [
      'Faerûn high-fantasy worldbuilding cues (subtle, believable magic): ancient standing stones with worn runes, druidic wards, faint fey-lights in mist, slightly uncanny flora and leyline ambience',
    ].join(', ');
  }

  if (interiorScore >= 2) {
    return [
      'Faerûn high-fantasy interior cues (subtle, believable magic): enchanted lanterns/sconces, rune-inlaid beams, warding motifs worked into stone and metal, arcane guild seals and sigils as functional infrastructure',
    ].join(', ');
  }

  return [
    'Faerûn high-fantasy urban cues (subtle, believable magic): ward-lanterns/everburning lights, rune-carved signage and safety wards, alchemical-ink guild seals, mixed ancestries in the periphery (dwarf, tiefling, dragonborn, halfling) if people appear',
  ].join(', ');
}

function getLatestImageForTargetPrefixSync(imagesDir: string, prefix: string): string | null {
  if (!existsSync(imagesDir)) return null;
  try {
    const files = readdirSync(imagesDir).filter((f) => f.startsWith(prefix) && /\.png$/i.test(f));
    if (files.length === 0) return null;

    const withMtime = files
      .map((file) => {
        const full = join(imagesDir, file);
        const s = statSync(full);
        return { full, mtimeMs: s.mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    return withMtime[0]?.full ?? null;
  } catch {
    return null;
  }
}

// ============================================================================
// Main Compilation Functions
// ============================================================================

/**
 * Compile a location's overview into a PromptIR
 */
export async function compileLocationOverview(
  slug: string,
  options: CompilerOptions & { verbose?: boolean } = {}
): Promise<CompiledPromptIR | null> {
  const { verbose } = options;

  if (verbose) {
    logPhase('Loading location imagery...');
  }

  const imagery = await readLocationImagery(slug);
  if (!imagery || !imagery.overview) {
    return null;
  }

  if (verbose) {
    const anchor = imagery.location_visual_anchor;
    const zoneCount = imagery.zones?.length;
    logLocationResolution(slug, {
      name: imagery.overview.title || imagery.overview.name,
      signatureElements: anchor?.signature_elements?.length,
      materials: anchor?.materials ? Object.values(anchor.materials) : undefined,
      zoneCount,
    });
  }

  return compileOverviewSection(slug, imagery, options);
}

/**
 * Compile a specific location zone into a PromptIR
 */
export async function compileLocationZone(
  slug: string,
  zoneSlug: string,
  options: CompilerOptions & { verbose?: boolean } = {}
): Promise<CompiledPromptIR | null> {
  const { verbose } = options;

  if (verbose) {
    logPhase(`Loading location zone: ${zoneSlug}...`);
  }

  const imagery = await readLocationImagery(slug);
  const zones = imagery?.zones;
  if (!imagery || !zones) {
    return null;
  }

  const zone = zones.find(
    (p) => p.slug === zoneSlug || ('zone_slug' in p && (p as { zone_slug?: string }).zone_slug === zoneSlug)
  );
  if (!zone) {
    return null;
  }

  if (verbose) {
    logStep(`Zone: ${getZoneName(zone)}`);
    if (zone.visual_description) {
      logDetail(`Visual description: ${zone.visual_description.length} chars`);
    }
    if (zone.image_type) {
      logDetail(`Image type: ${zone.image_type}`);
    }
  }

  return compileZoneSection(slug, imagery, zone, options);
}

/**
 * Compile all targets for a location (overview + all zones)
 */
export async function compileAllLocationTargets(
  slug: string,
  options: CompilerOptions & { verbose?: boolean } = {}
): Promise<CompiledPromptIR[]> {
  const { verbose } = options;

  if (verbose) {
    logPhase('Loading location imagery...');
  }

  const imagery = await readLocationImagery(slug);
  if (!imagery) {
    return [];
  }

  if (verbose) {
    const anchor = imagery.location_visual_anchor;
    const zoneCount = imagery.zones?.length;
    logLocationResolution(slug, {
      name: imagery.overview?.title || imagery.overview?.name,
      signatureElements: anchor?.signature_elements?.length,
      materials: anchor?.materials ? Object.values(anchor.materials) : undefined,
      zoneCount,
    });
  }

  const results: CompiledPromptIR[] = [];

  // Compile overview
  if (imagery.overview) {
    const overview = await compileOverviewSection(slug, imagery, options);
    if (overview) {
      results.push(overview);
    }
  }

  // Compile all zones
  const zones = imagery.zones ?? [];
  if (zones.length > 0) {
    for (const zone of zones) {
      if (zone.images && zone.images.length > 0) {
        const zoneSlug = getZoneSlug(zone);
        for (const imageSpec of zone.images) {
          if (!imageSpec?.image_slug) continue;
          const compiled = await compileZoneImage(slug, zoneSlug, imageSpec.image_slug, options);
          if (compiled) {
            results.push(compiled);
          }
        }
      } else {
        const compiled = await compileZoneSection(slug, imagery, zone, options);
        if (compiled) {
          results.push(compiled);
        }
      }
    }
  }

  if (verbose) {
    showSuccess(`Compiled ${results.length} target(s) for location`);
  }

  return results;
}

/**
 * List available compilation targets for a location
 */
export async function listLocationTargets(slug: string): Promise<{
  overview: { slug: string; title: string } | null;
  zones: { slug: string; name: string; title: string; image_type?: string }[];
}> {
  const imagery = await readLocationImagery(slug);
  if (!imagery) {
    return { overview: null, zones: [] };
  }

  const zones = imagery.zones ?? [];
  const zoneTargets: { slug: string; name: string; title: string; image_type?: string }[] = [];

  for (const zone of zones) {
    if (zone.images && zone.images.length > 0) {
      const zoneSlug = getZoneSlug(zone);
      const zoneName = getZoneName(zone);
      for (const imageSpec of zone.images) {
        if (!imageSpec?.image_slug) continue;
        zoneTargets.push({
          slug: buildZoneImageTargetId(zoneSlug, imageSpec.image_slug),
          name: zoneName,
          title: imageSpec.description || `${zoneName} image`,
          image_type: imageSpec.image_type || zone.image_type,
        });
      }
    } else {
      zoneTargets.push({
        slug: getZoneSlug(zone),
        name: getZoneName(zone),
        title: zone.title || getZoneName(zone),
        image_type: zone.image_type,
      });
    }
  }

  return {
    overview: imagery.overview
      ? {
          slug: getOverviewSlug(imagery.overview),
          title: imagery.overview.title || imagery.overview.name || 'Overview',
        }
      : null,
    zones: zoneTargets,
  };
}

// ============================================================================
// Internal Compilation Logic
// ============================================================================

/**
 * Compile the overview section
 */
function compileOverviewSection(
  slug: string,
  imagery: ExtendedLocationImagery,
  options: CompilerOptions
): CompiledPromptIR {
  const overview = imagery.overview!;
  const overviewSlug = getOverviewSlug(overview);
  const overviewTitle = overview.title || overview.name || 'Overview';
  const anchor = imagery.location_visual_anchor;
  const metadata = imagery.metadata;

  // Build precedence sources
  const sources: LocationPrecedenceSources = {
    overview: {
      aspect_ratio: options.aspectRatio || overview.aspect_ratio,
      size: options.size || overview.size,
      orientation: overview.orientation,
      scene_mood: overview.scene_mood,
      lighting: overview.lighting,
      palette: overview.palette,
      required_elements: overview.required_elements,
      negative_prompt: overview.negative_prompt,
    },
    visual_anchor: anchor,
    metadata: metadata?.generation_defaults,
  };

  // Resolve values with precedence
  const constraints = resolveConstraints(sources);
  const lighting = resolveLighting(sources, overview.time_of_day);
  const palette = resolvePalette(sources);
  const requiredElements = resolveRequiredElements(sources);
  const negativeTerms = resolveNegativePrompt(sources);

  // Build positive prompt sections (with metadata for narrative fields)
  const positive = buildPositiveSections(overview, anchor, lighting, palette, requiredElements, metadata);

  // Resolve references
  // Include character portraits if depicts_characters is specified
  const depictsCharacters = 'depicts_characters' in overview
    ? (overview as { depicts_characters?: string[] }).depicts_characters
    : undefined;
  const references = resolveLocationReferences(slug, imagery, depictsCharacters);

  return {
    target_id: overviewSlug,
    entity_type: 'location',
    entity_slug: slug,
    image_type: (overview.image_type as ImageType) || 'establishing',
    title: overviewTitle,
    scene_mood: overview.scene_mood,
    mood_rationale: overview.mood_rationale,
    positive,
    negative: negativeTerms,
    references,
    constraints,
    lighting,
    palette,
    sources: {
      entity_defaults: { overview: overview, anchor },
      image_overrides: {},
      global_defaults: {},
    },
    compiled_at: new Date().toISOString(),
  };
}

/**
 * Compile a part section
 */
function compileZoneSection(
  slug: string,
  imagery: ExtendedLocationImagery,
  zone: ExtendedLocationZone,
  options: CompilerOptions
): CompiledPromptIR {
  const overview = imagery.overview;
  const anchor = imagery.location_visual_anchor;
  const metadata = imagery.metadata;
  const zoneSlug = getZoneSlug(zone);
  const zoneTitle = zone.title || getZoneName(zone);

  // Build precedence sources
  const sources: LocationPrecedenceSources = {
    zone: {
      aspect_ratio: options.aspectRatio || zone.aspect_ratio,
      size: options.size || zone.size,
      orientation: zone.orientation,
      scene_mood: zone.scene_mood,
      lighting: zone.lighting,
      palette: zone.palette,
      required_elements: zone.required_elements,
      negative_prompt: zone.negative_prompt,
    },
    overview: overview
      ? {
          aspect_ratio: overview.aspect_ratio,
          size: overview.size,
          orientation: overview.orientation,
          scene_mood: overview.scene_mood,
          lighting: overview.lighting,
          palette: overview.palette,
          required_elements: overview.required_elements,
          negative_prompt: overview.negative_prompt,
        }
      : undefined,
    visual_anchor: anchor,
    metadata: metadata?.generation_defaults,
  };

  // Resolve values with precedence
  const constraints = resolveConstraints(sources);
  const lighting = resolveLighting(sources, zone.time_of_day);
  const palette = resolvePalette(sources);
  const requiredElements = resolveRequiredElements(sources);
  const negativeTerms = resolveNegativePrompt(sources);

  // Build positive prompt sections (with metadata and zone anchor)
  const positive = buildPositiveSections(
    zone,
    anchor,
    lighting,
    palette,
    requiredElements,
    metadata,
    zone.zone_visual_anchor
  );

  // Resolve references (part may have its own or inherit from location)
  // Include character portraits if depicts_characters is specified
  const references = resolveLocationReferences(slug, imagery, zone.depicts_characters);

  return {
    target_id: zoneSlug,
    entity_type: 'location',
    entity_slug: slug,
    image_type: (zone.image_type as ImageType) || 'zone',
    title: zoneTitle,
    scene_mood: zone.scene_mood,
    mood_rationale: zone.mood_rationale,
    positive,
    negative: negativeTerms,
    references,
    constraints,
    lighting,
    palette,
    sources: {
      entity_defaults: { overview, anchor },
      image_overrides: { zone },
      global_defaults: {},
    },
    compiled_at: new Date().toISOString(),
  };
}

/**
 * Truncate text at sentence boundary
 */
function truncateToSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastPeriod = truncated.lastIndexOf('.');
  return lastPeriod > maxLen * 0.5 ? truncated.slice(0, lastPeriod + 1) : truncated + '...';
}

/**
 * Build the positive prompt sections with weights
 */
function buildPositiveSections(
  target: ExtendedLocationOverview | ExtendedLocationZone,
  anchor: ExtendedLocationImagery['location_visual_anchor'],
  lighting: LightingSpec | undefined,
  palette: PaletteSpec,
  requiredElements: string[],
  metadata?: ExtendedLocationImagery['metadata'],
  zoneAnchor?: ExtendedLocationZone['zone_visual_anchor'],
  imageSpec?: ZoneImageSpec
): CompiledPromptIR['positive'] {
  const sections: CompiledPromptIR['positive'] = {
    constraints: [],
    subject: [],
    composition: [],
    lighting: [],
    palette: [],
    style: [],
  };

  // Weight 1: Constraints (required elements + key_elements)
  const allRequiredElements = [
    ...requiredElements,
    ...(target.key_elements || []), // v2.0 field
  ];

  if (allRequiredElements.length > 0) {
    sections.constraints.push({
      weight: 1,
      content: allRequiredElements.join(', '),
      source: 'required_elements+key_elements',
    });
  }

  // Weight 2: Subject (visual description OR narrative context OR description)
  const description =
    target.visual_description ||
    target.narrative_context ||
    ('description' in target ? (target as any).description : undefined);

  if (description) {
    // Clean and condense the description
    const cleaned = cleanMultilineText(description);
    sections.subject.push({
      weight: 2,
      content: cleaned,
      source: target.visual_description
        ? 'visual_description'
        : target.narrative_context
          ? 'narrative_context'
          : 'description',
    });
  }

  // Add global high-fantasy cues (kept concise, but explicit).
  // This is a common missing ingredient across location specs; without it,
  // models tend to default to grounded medieval-Europe visuals.
  const fantasyCuesText = inferFantasyCuesText(
    [
      target.title,
      'name' in target ? target.name : undefined,
      description, // Use whichever description field we found
      allRequiredElements.join(', '), // Use merged elements
    ]
      .filter(Boolean)
      .join(' ')
  );
  sections.subject.push({
    weight: 2,
    content: fantasyCuesText,
    source: 'fantasy_cues',
  });

  // Add narrative significance if present (weight 2)
  if (target.narrative_significance) {
    const cleaned = cleanMultilineText(target.narrative_significance);
    sections.subject.push({
      weight: 2,
      content: `Narrative context: ${cleaned}`,
      source: 'narrative_significance',
    });
  }

  // Weight 3: Composition
  if (target.composition_notes) {
    const cleaned = cleanMultilineText(target.composition_notes);
    sections.composition.push({
      weight: 3,
      content: cleaned,
      source: 'composition_notes',
    });
  }

  // Add time/weather/season context (weight 3)
  const contextParts: string[] = [];
  if (target.time_of_day) contextParts.push(target.time_of_day);
  if (target.weather) contextParts.push(target.weather);
  if (target.season) contextParts.push(target.season);
  if (contextParts.length > 0) {
    sections.composition.push({
      weight: 3,
      content: contextParts.join(', '),
      source: 'time_weather_season',
    });
  }

  // Weight 4: Lighting
  if (lighting) {
    const lightingParts: string[] = [];
    if (lighting.primary_source) lightingParts.push(`light from ${lighting.primary_source}`);
    if (lighting.secondary_source) lightingParts.push(`secondary light from ${lighting.secondary_source}`); // v2.0
    if (lighting.quality) lightingParts.push(lighting.quality);
    if (lighting.direction) lightingParts.push(lighting.direction);
    if (lighting.color_temperature) lightingParts.push(`${lighting.color_temperature} tones`);
    if (lighting.shadow_depth) lightingParts.push(`${lighting.shadow_depth} shadows`);
    if (lighting.atmospheric) lightingParts.push(lighting.atmospheric);

    if (lightingParts.length > 0) {
      sections.lighting.push({
        weight: 4,
        content: lightingParts.join(', '),
        source: 'lighting',
      });
    }
  }

  // Weight 4: Palette
  const paletteParts: string[] = [];
  if (palette.dominant?.length) {
    paletteParts.push(`dominant colors: ${palette.dominant.join(', ')}`);
  }
  if (palette.accent?.length) {
    paletteParts.push(`accent colors: ${palette.accent.join(', ')}`);
  }
  if (paletteParts.length > 0) {
    sections.palette.push({
      weight: 4,
      content: paletteParts.join('; '),
      source: 'palette',
    });
  }

  // Weight 5: Style + mood intent
  // Keep this focused on narrative intent and location identity.
  // The global art-direction suffix is injected later by the image service.
  const styleParts: string[] = ['high fantasy'];

  // v2.0: Use mood or scene_mood
  const moodValue = ('mood' in target && (target as any).mood) || target.scene_mood;
  if (moodValue) {
    styleParts.push(`${moodValue} atmosphere`);
  }

  if (anchor?.materials) {
    const materialsList = Object.values(anchor.materials).slice(0, 3);
    if (materialsList.length > 0) {
      styleParts.push(`materials: ${materialsList.join(', ')}`);
    }
  }

  if (styleParts.length > 0) {
    sections.style.push({
      weight: 5,
      content: styleParts.join(', '),
      source: 'style_defaults',
    });
  }

  if (target.mood_rationale) {
    sections.style.push({
      weight: 5,
      content: `Mood intent: ${cleanMultilineText(target.mood_rationale)}`,
      source: 'mood_rationale',
    });
  }

  // Add narrative_soul from metadata (weight 5)
  if (metadata?.narrative_soul) {
    sections.style.push({
      weight: 5,
      content: `Location essence: ${truncateToSentence(cleanMultilineText(metadata.narrative_soul), 200)}`,
      source: 'narrative_soul',
    });
  }

  // Add one_line_essence from metadata (weight 5)
  if (metadata?.one_line_essence) {
    sections.style.push({
      weight: 5,
      content: `Thematic hook: ${metadata.one_line_essence}`,
      source: 'one_line_essence',
    });
  }

  // Add style_notes from image spec (weight 5)
  if (imageSpec?.style_notes) {
    sections.style.push({
      weight: 5,
      content: imageSpec.style_notes,
      source: 'style_notes',
    });
  }

  return sections;
}

/**
 * Resolve references for a location
 * @param slug - The location slug
 * @param imagery - The location imagery spec
 * @param depictsCharacters - Optional array of character slugs to resolve portraits for
 */
function resolveLocationReferences(
  slug: string,
  imagery: ExtendedLocationImagery,
  depictsCharacters?: string[]
): ResolvedReference[] {
  const references: ResolvedReference[] = [];

  // Check reference_defaults first
  if (imagery.reference_defaults?.overview) {
    const asset = resolveAsset(imagery.reference_defaults.overview);
    if (asset) {
      references.push({
        asset_id: asset.asset_id,
        role: 'location_overview',
        path: asset.path,
        exists: existsSync(asset.path),
      });
    }
  }

  // Check overview image_inventory for approved overview images
  if (imagery.overview?.image_inventory) {
    for (const item of imagery.overview.image_inventory) {
      if (item.status === 'approved' && item.content?.tags?.includes('overview')) {
        const asset = resolveAsset(item.id);
        if (asset && !references.some((r) => r.asset_id === item.id)) {
          references.push({
            asset_id: item.id,
            role: 'location_overview',
            path: asset.path,
            exists: existsSync(asset.path),
          });
        }
      }
    }
  }

  // Get any additional reference paths
  const alreadyHaveOverview = references.some((r) => r.role === 'location_overview' && r.exists);
  if (!alreadyHaveOverview && imagery.overview) {
    const overviewSlug = getOverviewSlug(imagery.overview);
    const imagesDir = getImagesDir('location', slug);
    // Prefer a fresh, location-specific anchor (newest image for the overview target).
    // This avoids arbitrarily picking an older/grounded "establishing" image.
    const latest = getLatestImageForTargetPrefixSync(imagesDir, `${overviewSlug}-`);
    if (latest) {
      references.push({
        asset_id: `latest-${overviewSlug}`,
        role: 'location_overview',
        path: latest,
        exists: true,
      });
    }
  }

  // Fallback: legacy default overview reference resolution.
  if (!references.some((r) => r.role === 'location_overview' && r.exists)) {
    const paths = getLocationReferencePaths(slug);
    for (const path of paths) {
      if (!references.some((r) => r.path === path)) {
        references.push({
          asset_id: `${slug}-file-ref`,
          role: 'location_overview',
          path,
          exists: existsSync(path),
        });
      }
    }
  }

  // Resolve character portrait references from depicts_characters
  if (depictsCharacters?.length) {
    for (const charSlug of depictsCharacters) {
      const portraitPaths = getCharacterReferencePaths(charSlug);
      if (portraitPaths.length > 0) {
        // Only add if not already in references
        if (!references.some((r) => r.path === portraitPaths[0])) {
          references.push({
            asset_id: `${charSlug}-portrait`,
            role: 'portrait',
            path: portraitPaths[0],
            exists: existsSync(portraitPaths[0]),
          });
        }
      }
    }
  }

  return references;
}

// ============================================================================
// Zone Image Compilation (v2.0)
// ============================================================================

/**
 * Compile a specific zone image from zones[].images[] specification
 *
 * @param slug - Location slug
 * @param zoneSlug - Zone slug (zones[].slug OR zones[].zone_slug)
 * @param imageSlug - Image slug (zones[].images[].image_slug)
 * @param options - Compiler options
 * @returns CompiledPromptIR or null if not found
 */
export async function compileZoneImage(
  slug: string,
  zoneSlug: string,
  imageSlug: string,
  options: CompilerOptions & { verbose?: boolean } = {}
): Promise<CompiledPromptIR | null> {
  const { verbose } = options;

  if (verbose) {
    logPhase(`Loading location imagery for ${slug}...`);
  }

  const imagery = await readLocationImagery(slug);
  if (!imagery || !imagery.zones) {
    return null;
  }

  // Find the zone (match slug or zone_slug)
  const zone = imagery.zones.find(
    (z) => z.slug === zoneSlug || ('zone_slug' in z && (z as any).zone_slug === zoneSlug)
  );
  if (!zone) {
    if (verbose) {
      console.error(`Zone not found: ${zoneSlug}`);
    }
    return null;
  }
  const resolvedZoneSlug = getZoneSlug(zone);
  const resolvedZoneName = getZoneName(zone);

  // Find the image spec within the zone
  const imageSpec = zone.images?.find((img) => img.image_slug === imageSlug);
  if (!imageSpec) {
    if (verbose) {
      console.error(`Image spec not found: ${zoneSlug}/${imageSlug}`);
    }
    return null;
  }

  if (verbose) {
    logPhase(`Compiling zone image: ${zoneSlug}/${imageSlug}`);
    logDetail(`Image type: ${imageSpec.image_type}`);
    logDetail(`Mood: ${imageSpec.scene_mood}`);
  }

  // Build precedence sources - image spec overrides zone fields
  const mergedZone: ExtendedLocationZone = {
    ...zone,
    // Override with image-specific fields
    visual_description: imageSpec.description || zone.visual_description,
    scene_mood: imageSpec.scene_mood || zone.scene_mood,
    lighting: imageSpec.lighting || zone.lighting,
    palette: imageSpec.palette || zone.palette,
    required_elements: imageSpec.key_elements || zone.required_elements || zone.key_elements,
    time_of_day: imageSpec.time_of_day || zone.time_of_day,
    weather: imageSpec.weather || zone.weather,
    composition_notes:
      imageSpec.composition
        ? Object.entries(imageSpec.composition)
            .filter(([_, v]) => v)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')
        : zone.composition_notes,
  };

  const sources: LocationPrecedenceSources = {
    zone: {
      aspect_ratio: options.aspectRatio || mergedZone.aspect_ratio,
      size: options.size || mergedZone.size,
      orientation: mergedZone.orientation,
      scene_mood: mergedZone.scene_mood,
      lighting: mergedZone.lighting,
      palette: mergedZone.palette,
      required_elements: mergedZone.required_elements,
      key_elements: mergedZone.key_elements, // v2.0
      negative_prompt: mergedZone.negative_prompt,
    },
    visual_anchor: imagery.location_visual_anchor,
    metadata: imagery.metadata?.generation_defaults || imagery.generation_defaults,
  };

  // Resolve with precedence
  const constraints = resolveConstraints(sources);
  const lighting = resolveLighting(sources);
  const palette = resolvePalette(sources);
  const requiredElements = resolveRequiredElements(sources);
  const negative = resolveNegativePrompt(sources);

  // Build positive sections (with metadata, zone anchor, and image spec for style_notes)
  const sections = buildPositiveSections(
    mergedZone,
    imagery.location_visual_anchor,
    lighting,
    palette,
    requiredElements,
    imagery.metadata,
    zone.zone_visual_anchor,
    imageSpec
  );

  // Resolve references (from zone's image_inventory, not images[])
  const references = resolveLocationReferences(slug, imagery, zone.depicts_characters || []);

  return {
    target_id: buildZoneImageTargetId(resolvedZoneSlug, imageSlug),
    entity_type: 'location',
    entity_slug: slug,
    image_type: (imageSpec.image_type as ImageType) || 'zone',
    title: `${resolvedZoneName} - ${imageSpec.description}`,
    scene_mood: imageSpec.scene_mood || zone.scene_mood,
    mood_rationale: zone.mood_rationale,
    positive: sections,
    negative,
    references,
    constraints,
    lighting,
    palette,
    sources: {
      entity_defaults: (sources.metadata as Record<string, unknown>) || {},
      image_overrides: {
        prompt_spec_slug: imageSlug,
        ...imageSpec,
      } as Record<string, unknown>,
      global_defaults: {},
    },
    compiled_at: new Date().toISOString(),
  };
}

/**
 * List all zone image specifications for a location
 *
 * @param slug - Location slug
 * @returns Array of image spec metadata
 */
export async function listZoneImageSpecs(slug: string): Promise<
  Array<{
    zoneSlug: string;
    zoneName: string;
    imageSlug: string;
    imageType: string;
    description: string;
  }>
> {
  const imagery = await readLocationImagery(slug);
  if (!imagery || !imagery.zones) {
    return [];
  }

  const specs: Array<{
    zoneSlug: string;
    zoneName: string;
    imageSlug: string;
    imageType: string;
    description: string;
  }> = [];

  for (const zone of imagery.zones) {
    if (zone.images && zone.images.length > 0) {
      for (const img of zone.images) {
        specs.push({
          zoneSlug: getZoneSlug(zone),
          zoneName: getZoneName(zone),
          imageSlug: img.image_slug,
          imageType: img.image_type || 'zone',
          description: img.description,
        });
      }
    }
  }

  return specs;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Clean multiline text for prompt inclusion
 */
function cleanMultilineText(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

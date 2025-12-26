-- ============================================================================
-- NEGATIVE PROMPT LIBRARY - SEED DATA
-- Based on chargen art direction (09-project-art-direction.yaml)
-- ============================================================================

-- Base Quality Filters (Priority 1 - Always Applied)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-base-quality',
  'Base Quality Filters',
  'base-quality',
  'base',
  'Universal quality and technical filters applied to all generations',
  json_array(
    'low quality',
    'blurry',
    'distorted',
    'AI artifacts',
    'text',
    'subtitles',
    'logos',
    'watermarks',
    'signatures',
    'frames'
  ),
  1,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Character Anatomy Filters (Priority 2 - Character-Specific)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-char-anatomy',
  'Character Anatomy Filters',
  'character-anatomy',
  'character',
  'Prevents common anatomy and proportion issues in character generation',
  json_array(
    'distorted anatomy',
    'extra fingers',
    'extra limbs',
    'missing fingers',
    'malformed hands',
    'deformed',
    'disfigured',
    'poorly drawn face',
    'poorly drawn hands',
    'duplicated faces',
    'face-cloned background figures'
  ),
  2,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Style/Rendering Filters (Priority 3 - Art Direction)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-style-rendering',
  'Style & Rendering Filters',
  'style-rendering',
  'base',
  'Enforces painterly style and prevents unwanted rendering approaches',
  json_array(
    'cartoon',
    'anime',
    'manga',
    'cel-shaded',
    'plastic',
    'glossy',
    'CGI',
    '3D render',
    'video game screenshot',
    'photorealistic camera look',
    'stock photo',
    'airbrushed skin',
    'perfect studio lighting',
    'beauty editorial'
  ),
  3,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Modern/Anachronistic Elements (Priority 4 - Fantasy Grounding)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-modern-elements',
  'Modern & Anachronistic Elements',
  'modern-elements',
  'base',
  'Filters out modern and futuristic elements that break fantasy immersion',
  json_array(
    'modern elements',
    'futuristic elements',
    'guns',
    'firearms',
    'modern architecture',
    'contemporary fashion',
    'electric lights',
    'smartphones',
    'technology',
    'machinery'
  ),
  4,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Color & Lighting Filters (Priority 5 - Art Direction)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-color-lighting',
  'Color & Lighting Filters',
  'color-lighting',
  'base',
  'Prevents oversaturated colors and improper lighting (per art direction)',
  json_array(
    'neon colors',
    'oversaturated glow',
    'sparkles',
    'glitter',
    'fairy-dust',
    'twinkle',
    'rainbow bokeh',
    'high-key overbright lighting',
    'overexposed highlights',
    'pure black shadows',
    'pure white highlights',
    'uncontrolled rainbow palettes',
    'sparkly particle effects',
    'candy-bright spell glow'
  ),
  5,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Character-Specific: Costume & Appearance (Priority 6)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-char-costume',
  'Character Costume Filters',
  'character-costume',
  'character',
  'Enforces worn, practical costumes per art direction',
  json_array(
    'pristine cosplay',
    'perfect costume',
    'fashion model',
    'runway',
    'mannequin pose',
    'catalog pose',
    'flawless makeup',
    'glamour shot',
    'airbrushed',
    'editorial styling'
  ),
  6,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Location-Specific: Perspective & Scale (Priority 7)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-loc-perspective',
  'Location Perspective Filters',
  'location-perspective',
  'location',
  'Prevents perspective and scale issues in location generation',
  json_array(
    'warped perspective',
    'skewed',
    'incorrect scale',
    'fisheye distortion',
    'tilted horizon',
    'impossible geometry',
    'floating objects',
    'disconnected architecture',
    'no sense of depth',
    'flat rendering'
  ),
  7,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Scene-Specific: Composition Issues (Priority 8)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-scene-composition',
  'Scene Composition Filters',
  'scene-composition',
  'scene',
  'Prevents composition and staging issues in multi-character scenes',
  json_array(
    'cluttered composition',
    'busy background',
    'no focal point',
    'competing elements',
    'unclear staging',
    'awkward framing',
    'cut-off important elements',
    'tangents',
    'overlapping confusion',
    'visual noise'
  ),
  8,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- Horror/Gore Filters (Priority 9 - Content Rating)
INSERT INTO negative_prompt_preset (id, name, slug, category, description, prompts, priority, status, created_at, updated_at)
VALUES (
  'neg-horror-gore',
  'Horror & Gore Filters',
  'horror-gore',
  'base',
  'Prevents excessive horror/gore unless story demands (per art direction)',
  json_array(
    'excessive gore',
    'graphic violence',
    'body horror',
    'disturbing imagery',
    'nightmare fuel',
    'grotesque',
    'viscera',
    'mutilation',
    'explicit violence'
  ),
  9,
  'active',
  unixepoch() * 1000,
  unixepoch() * 1000
);

-- ============================================================================
-- USAGE NOTES
-- ============================================================================
--
-- Priority Order:
-- 1-5: Base filters (always applied)
-- 6: Character-specific costume
-- 7: Location-specific perspective
-- 8: Scene-specific composition
-- 9: Content rating filters
--
-- Categories:
-- - base: Applied to all generations
-- - character: Applied only to character portraits
-- - location: Applied only to location overviews
-- - scene: Applied only to scene compositions
--
-- The PromptCompiler will merge these based on entity type and priority order.
-- Higher priority (lower number) presets are applied first.

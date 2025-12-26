-- ============================================================================
-- Seed Data: Default Prompt Templates
-- ============================================================================
-- This file populates the database with default, working prompt templates
-- for character portraits, location overviews, and scene generation.
-- ============================================================================

-- ============================================================================
-- STYLE PRESETS
-- ============================================================================

INSERT INTO style_preset (id, name, slug, category, style_description, negative_prompts, artist_references, is_master_style, priority, status, created_at, updated_at) VALUES
('style-master-character', 'Master Character Style', 'master-character', 'character',
 'Heroic fantasy portrait, expressive face with distinct features, ornate attire with rich textures, painterly style, dramatic composition',
 '["modern clothing", "contemporary technology", "cartoon", "anime", "3D render", "CGI", "low quality", "blurry", "distorted"]',
 NULL,
 1, 100, 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

('style-master-location', 'Master Location Style', 'master-location', 'location',
 'High-fantasy establishing shot, rich environmental detail, atmospheric depth, epic scale, painterly composition',
 '["modern architecture", "cars", "contemporary elements", "low quality", "blurry"]',
 NULL,
 1, 100, 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

('style-master-scene', 'Master Scene Style', 'master-scene', 'scene',
 'Narrative storytelling moment, emotional lighting, character-environment interaction, cinematic composition',
 '["face cloning", "identical faces", "merged identities", "low quality"]',
 NULL,
 1, 100, 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ============================================================================
-- NEGATIVE PROMPT PRESETS
-- ============================================================================

INSERT INTO negative_prompt_preset (id, name, slug, category, prompts, description, is_default, priority, status, created_at, updated_at) VALUES
('neg-base', 'Base Quality', 'base-quality', 'base',
 '["low quality", "blurry", "distorted", "watermark", "text", "signature"]',
 'Core quality control negatives', 1, 100, 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

('neg-character', 'Character Specific', 'character-specific', 'character',
 '["modern clothing", "contemporary fashion", "sunglasses", "modern hairstyles", "tattoos"]',
 'Prevents modern elements in character portraits', 1, 90, 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

('neg-location', 'Location Specific', 'location-specific', 'location',
 '["modern architecture", "cars", "traffic lights", "power lines", "contemporary signage"]',
 'Prevents modern elements in locations', 1, 90, 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ============================================================================
-- PROMPT COMPONENTS (Reusable Partials)
-- ============================================================================

INSERT INTO prompt_component (id, name, slug, category, content, description, variables, status, created_at, updated_at) VALUES
('comp-infer-expression', 'Infer Expression', 'infer-expression', 'expression',
 '{{#if entity.personality}}{{inferExpression entity.personality}}{{else}}neutral, composed expression{{/if}}',
 'Infers facial expression from personality traits',
 '["entity.personality"]',
 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

('comp-fantasy-urban', 'Fantasy Urban Cues', 'fantasy-urban', 'composition',
 'Faerûn high-fantasy urban setting: ward-lanterns with everburning flames, rune-carved signage and safety wards, alchemical-ink guild seals, mixed ancestries in background (dwarf, tiefling, dragonborn, halfling) if people appear',
 'Adds subtle fantasy elements to urban scenes',
 NULL,
 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

('comp-fantasy-wilderness', 'Fantasy Wilderness Cues', 'fantasy-wilderness', 'composition',
 'Faerûn high-fantasy wilderness: ancient standing stones with worn runes, druidic wards woven into trees, faint fey-lights in mist, slightly uncanny flora hinting at magical leylines',
 'Adds subtle fantasy elements to wilderness scenes',
 NULL,
 'active', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- ============================================================================
-- CHARACTER PORTRAIT TEMPLATE (Default)
-- ============================================================================

INSERT INTO prompt_template (id, name, slug, category, subcategory, description, template_type, status, is_default, version, created_by, created_at, updated_at) VALUES
('tpl-char-portrait-default', 'Character Portrait (Default)', 'character-portrait-default', 'character', 'portrait',
 'Default template for generating character portrait images. Includes appearance, personality-driven expression, and fantasy styling.',
 'full', 'active', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- Sections for character portrait template
INSERT INTO prompt_template_section (id, template_id, name, weight, sort_order, content, condition, notes, created_at, updated_at) VALUES
-- Weight 2: Subject - Character Appearance
('sec-char-portrait-appearance', 'tpl-char-portrait-default', 'Character Appearance', 2, 1,
 '{{#if entity.species}}{{entity.species}}{{/if}}{{#if entity.age}}, {{entity.age}} years old{{/if}}{{#if entity.hair}}, {{entity.hair}} hair{{/if}}{{#if entity.eyes}}, {{entity.eyes}} eyes{{/if}}{{#if entity.distinguishingFeatures}}, {{entity.distinguishingFeatures}}{{/if}}{{#if entity.clothing}}, wearing {{entity.clothing}}{{/if}}',
 'entity.species || entity.age || entity.hair || entity.eyes',
 'Builds character appearance from structured fields',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 2: Subject - Expression
('sec-char-portrait-expression', 'tpl-char-portrait-default', 'Facial Expression', 2, 2,
 '{{> infer-expression}}',
 'entity.personality',
 'Uses personality to infer appropriate expression',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 3: Composition
('sec-char-portrait-composition', 'tpl-char-portrait-default', 'Composition', 3, 1,
 'medium portrait, head and shoulders, centered composition, clear facial features, sharp focus on face',
 NULL,
 'Standard portrait composition',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 4: Lighting
('sec-char-portrait-lighting', 'tpl-char-portrait-default', 'Lighting', 4, 1,
 'warm atmospheric lighting, soft shadows defining features, three-quarter lighting from upper left, ambient fantasy glow',
 NULL,
 'Default portrait lighting',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- Variables documentation for character portrait
INSERT INTO prompt_template_variable (id, template_id, name, variable_type, description, example_value, is_required, created_at) VALUES
('var-char-species', 'tpl-char-portrait-default', 'entity.species', 'string', 'Character species/race', 'human, elf, dwarf, gnome', 0, strftime('%s', 'now') * 1000),
('var-char-age', 'tpl-char-portrait-default', 'entity.age', 'number', 'Character age in years', '25, 150', 0, strftime('%s', 'now') * 1000),
('var-char-hair', 'tpl-char-portrait-default', 'entity.hair', 'string', 'Hair color and style', 'auburn shoulder-length hair', 0, strftime('%s', 'now') * 1000),
('var-char-eyes', 'tpl-char-portrait-default', 'entity.eyes', 'string', 'Eye color and description', 'bright green eyes', 0, strftime('%s', 'now') * 1000),
('var-char-features', 'tpl-char-portrait-default', 'entity.distinguishingFeatures', 'string', 'Distinguishing marks, scars, etc.', 'scar across left cheek', 0, strftime('%s', 'now') * 1000),
('var-char-clothing', 'tpl-char-portrait-default', 'entity.clothing', 'string', 'Typical attire', 'leather armor with brass buckles', 0, strftime('%s', 'now') * 1000),
('var-char-personality', 'tpl-char-portrait-default', 'entity.personality', 'string', 'Personality traits for expression', 'cheerful, friendly, optimistic', 0, strftime('%s', 'now') * 1000);

-- ============================================================================
-- LOCATION OVERVIEW TEMPLATE (Default)
-- ============================================================================

INSERT INTO prompt_template (id, name, slug, category, subcategory, description, template_type, status, is_default, version, created_by, created_at, updated_at) VALUES
('tpl-loc-overview-default', 'Location Overview (Default)', 'location-overview-default', 'location', 'overview',
 'Default template for generating location establishing shots. Wide environmental view with fantasy atmosphere.',
 'full', 'active', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

INSERT INTO prompt_template_section (id, template_id, name, weight, sort_order, content, condition, notes, created_at, updated_at) VALUES
-- Weight 2: Subject - Location Description
('sec-loc-overview-desc', 'tpl-loc-overview-default', 'Location Description', 2, 1,
 '{{entity.name}}{{#if entity.description}}, {{entity.description}}{{/if}}',
 'entity.name',
 'Core location identity',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 2: Subject - Features
('sec-loc-overview-features', 'tpl-loc-overview-default', 'Key Features', 2, 2,
 '{{#if entity.features}}featuring {{join entity.features ", "}}{{/if}}',
 'entity.features',
 'Highlights key visual elements',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 2: Subject - Fantasy Cues
('sec-loc-overview-fantasy', 'tpl-loc-overview-default', 'Fantasy Elements', 2, 3,
 '{{> fantasy-urban}}',
 NULL,
 'Adds subtle high-fantasy atmosphere',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 3: Composition
('sec-loc-overview-composition', 'tpl-loc-overview-default', 'Composition', 3, 1,
 'wide establishing shot, environmental storytelling, showing depth and scale, architectural detail in foreground, atmospheric perspective in background',
 NULL,
 'Epic establishing composition',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 4: Lighting
('sec-loc-overview-lighting', 'tpl-loc-overview-default', 'Lighting', 4, 1,
 'golden hour lighting, warm ambient atmosphere, dramatic shadows creating depth, subtle magical glow from architectural elements',
 NULL,
 'Atmospheric location lighting',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

-- Variables for location overview
INSERT INTO prompt_template_variable (id, template_id, name, variable_type, description, example_value, is_required, created_at) VALUES
('var-loc-name', 'tpl-loc-overview-default', 'entity.name', 'string', 'Location name', 'The Undershade Canyon', 1, strftime('%s', 'now') * 1000),
('var-loc-desc', 'tpl-loc-overview-default', 'entity.description', 'string', 'Location description', 'a massive chasm cutting through ancient bedrock', 0, strftime('%s', 'now') * 1000),
('var-loc-features', 'tpl-loc-overview-default', 'entity.features', 'object', 'Array of key features', '["rope bridges", "carved staircases", "glowing crystals"]', 0, strftime('%s', 'now') * 1000);

-- ============================================================================
-- SCENE COMPOSITE TEMPLATE
-- ============================================================================

INSERT INTO prompt_template (id, name, slug, category, subcategory, description, template_type, status, is_default, version, created_by, created_at, updated_at) VALUES
('tpl-scene-composite-default', 'Scene Composite (Default)', 'scene-composite-default', 'scene', 'composite',
 'Template for scene illustrations with multiple characters in a location. Maintains character consistency via references.',
 'full', 'active', 1, 1, 'system', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

INSERT INTO prompt_template_section (id, template_id, name, weight, sort_order, content, condition, notes, created_at, updated_at) VALUES
-- Weight 1: Constraints
('sec-scene-consistency', 'tpl-scene-composite-default', 'Identity Lock', 1, 1,
 'IDENTITY LOCK: Maintain exact character appearances from reference images. Each character must have distinct, recognizable features matching their references. Do not clone faces or merge identities.',
 'metadata.hasReferences',
 'Critical for multi-character consistency',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 2: Subject - Scene Moment
('sec-scene-moment', 'tpl-scene-composite-default', 'Scene Moment', 2, 1,
 '{{metadata.moment}}',
 'metadata.moment',
 'The actual story moment being illustrated',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 2: Subject - Location Context
('sec-scene-location', 'tpl-scene-composite-default', 'Location Context', 2, 2,
 '{{#if metadata.location}}in {{metadata.location.name}}, {{metadata.location.description}}{{/if}}',
 'metadata.location',
 'Sets environmental context',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000),

-- Weight 3: Composition
('sec-scene-composition', 'tpl-scene-composite-default', 'Composition', 3, 1,
 'narrative scene composition, character interaction as focal point, environmental context establishing setting, cinematic framing',
 NULL,
 'Storytelling composition',
 strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000);

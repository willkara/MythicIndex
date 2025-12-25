-- ============================================================================
-- Image Generation System - Comprehensive Schema
-- Migration: 0008_image_generation_system.sql
-- ============================================================================

-- ============================================================================
-- PROMPT TEMPLATES
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_template (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,                -- 'character', 'location', 'scene'
  subcategory TEXT,                      -- 'portrait', 'overview', 'composite'

  description TEXT,

  template_type TEXT NOT NULL DEFAULT 'full',  -- 'full' | 'partial' | 'component'
  status TEXT NOT NULL DEFAULT 'draft',        -- 'draft', 'active', 'archived'
  is_default INTEGER DEFAULT 0,                -- boolean

  version INTEGER NOT NULL DEFAULT 1,
  parent_template_id TEXT REFERENCES prompt_template(id),

  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_category ON prompt_template(category, subcategory);
CREATE INDEX IF NOT EXISTS idx_template_status ON prompt_template(status);
CREATE INDEX IF NOT EXISTS idx_template_slug ON prompt_template(slug);

-- ============================================================================
-- TEMPLATE SECTIONS (Weighted Components)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_template_section (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES prompt_template(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  weight INTEGER NOT NULL,               -- 1-5 (1 = highest priority)
  sort_order INTEGER NOT NULL DEFAULT 0,

  content TEXT NOT NULL,                 -- Template with {{variables}}
  condition TEXT,                        -- Optional JavaScript expression

  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_section_template ON prompt_template_section(template_id);
CREATE INDEX IF NOT EXISTS idx_section_weight ON prompt_template_section(weight, sort_order);

-- ============================================================================
-- TEMPLATE VARIABLES (Documentation & Validation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_template_variable (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES prompt_template(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  variable_type TEXT NOT NULL,           -- 'string', 'number', 'boolean', 'object'

  description TEXT NOT NULL,
  example_value TEXT,

  is_required INTEGER DEFAULT 0,
  default_value TEXT,
  validation_pattern TEXT,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_variable_template ON prompt_template_variable(template_id);

-- ============================================================================
-- REUSABLE COMPONENTS (Partials)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_component (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,

  category TEXT NOT NULL,                -- 'expression', 'lighting', 'composition'
  content TEXT NOT NULL,
  description TEXT,

  variables TEXT,                        -- JSON array of variable names
  usage_count INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_component_category ON prompt_component(category);
CREATE INDEX IF NOT EXISTS idx_component_slug ON prompt_component(slug);

-- ============================================================================
-- STYLE PRESETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS style_preset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,

  category TEXT NOT NULL,                -- 'character', 'location', 'scene'

  style_description TEXT NOT NULL,
  negative_prompts TEXT,                 -- JSON array

  artist_references TEXT,                -- JSON array
  aesthetic_notes TEXT,

  is_master_style INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_style_category ON style_preset(category);
CREATE INDEX IF NOT EXISTS idx_style_master ON style_preset(is_master_style);

-- ============================================================================
-- NEGATIVE PROMPT LIBRARY
-- ============================================================================

CREATE TABLE IF NOT EXISTS negative_prompt_preset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,

  category TEXT NOT NULL,                -- 'base', 'character', 'location', 'quality'
  prompts TEXT NOT NULL,                 -- JSON array of negative prompts

  description TEXT,
  is_default INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,

  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_negative_category ON negative_prompt_preset(category);

-- ============================================================================
-- PROMPT IR STORAGE
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_ir (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,             -- 'character', 'location', 'chapter', 'scene'
  entity_slug TEXT NOT NULL,
  target_id TEXT NOT NULL,

  ir_data TEXT NOT NULL,                 -- JSON.stringify(CompiledPromptIR)
  ir_hash TEXT NOT NULL UNIQUE,

  image_type TEXT,
  scene_mood TEXT,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_ir_entity ON prompt_ir(entity_type, entity_slug);
CREATE INDEX IF NOT EXISTS idx_prompt_ir_hash ON prompt_ir(ir_hash);

-- ============================================================================
-- PROMPT HISTORY (Rendered Prompts + Results)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_history (
  id TEXT PRIMARY KEY,
  ir_id TEXT REFERENCES prompt_ir(id),
  ir_hash TEXT NOT NULL,

  rendered_prompt TEXT NOT NULL,
  rendered_negative TEXT,
  char_count INTEGER NOT NULL,
  trimmed INTEGER DEFAULT 0,             -- boolean

  aspect_ratio TEXT,
  size TEXT,
  quality TEXT,

  result_asset_id TEXT REFERENCES image_asset(id),
  workflow_instance_id TEXT,             -- Cloudflare Workflow ID

  provider TEXT,
  model TEXT,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_prompt_history_ir ON prompt_history(ir_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_workflow ON prompt_history(workflow_instance_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_asset ON prompt_history(result_asset_id);

-- ============================================================================
-- REFERENCE IMAGE METADATA
-- ============================================================================

CREATE TABLE IF NOT EXISTS image_reference_metadata (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES image_asset(id) ON DELETE CASCADE,

  entity_type TEXT NOT NULL,
  entity_slug TEXT NOT NULL,

  is_canonical INTEGER DEFAULT 0,        -- boolean
  reference_quality TEXT,                -- 'high', 'medium', 'low'
  use_for_consistency INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,

  face_reference INTEGER DEFAULT 1,
  body_reference INTEGER DEFAULT 0,
  clothing_reference INTEGER DEFAULT 0,
  environment_reference INTEGER DEFAULT 0,

  notes TEXT,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ref_meta_entity ON image_reference_metadata(entity_type, entity_slug);
CREATE INDEX IF NOT EXISTS idx_ref_meta_asset ON image_reference_metadata(asset_id);

-- ============================================================================
-- PROMPT REFERENCES (Which images were used as references)
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_reference (
  id TEXT PRIMARY KEY,
  prompt_history_id TEXT REFERENCES prompt_history(id),
  asset_id TEXT REFERENCES image_asset(id),
  role TEXT NOT NULL,                    -- 'portrait', 'location_overview', etc.
  sort_order INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_prompt_ref_history ON prompt_reference(prompt_history_id);
CREATE INDEX IF NOT EXISTS idx_prompt_ref_asset ON prompt_reference(asset_id);

-- ============================================================================
-- ENTITY-SPECIFIC OVERRIDES
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_template_override (
  id TEXT PRIMARY KEY,

  entity_type TEXT NOT NULL,
  entity_slug TEXT NOT NULL,

  template_id TEXT REFERENCES prompt_template(id),
  section_name TEXT,

  override_content TEXT NOT NULL,
  override_weight INTEGER,

  reason TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_override_entity ON prompt_template_override(entity_type, entity_slug);
CREATE INDEX IF NOT EXISTS idx_override_template ON prompt_template_override(template_id);

-- ============================================================================
-- TEMPLATE USAGE TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS prompt_template_usage (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES prompt_template(id),

  entity_type TEXT NOT NULL,
  entity_slug TEXT NOT NULL,

  prompt_history_id TEXT REFERENCES prompt_history(id),
  result_asset_id TEXT REFERENCES image_asset(id),

  user_rating INTEGER,                   -- 1-5 stars
  admin_notes TEXT,

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_template ON prompt_template_usage(template_id);
CREATE INDEX IF NOT EXISTS idx_usage_entity ON prompt_template_usage(entity_type, entity_slug);

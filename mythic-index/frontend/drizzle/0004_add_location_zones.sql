-- Migration: Add location zone tracking tables
-- Date: 2025-12-23
-- Description: Adds location_zone table for zone entities, scene_zone junction table
--              for scene-zone relationships, and zone_id field to image_link table

-- ============================================================================
-- CREATE LOCATION_ZONE TABLE
-- ============================================================================

CREATE TABLE location_zone (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  location_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  zone_type TEXT,
  location_within TEXT,
  parent_zone_id TEXT,
  physical_description TEXT,
  narrative_function TEXT,
  emotional_register TEXT,
  signature_details TEXT,
  mood_affinity TEXT,
  character_associations TEXT,
  light_conditions TEXT,
  first_appearance TEXT,
  story_significance TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (location_id) REFERENCES location(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_zone_id) REFERENCES location_zone(id) ON DELETE SET NULL
);

-- ============================================================================
-- CREATE SCENE_ZONE JUNCTION TABLE
-- ============================================================================

CREATE TABLE scene_zone (
  id TEXT PRIMARY KEY,
  scene_id TEXT NOT NULL,
  zone_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (scene_id) REFERENCES scene(id) ON DELETE CASCADE,
  FOREIGN KEY (zone_id) REFERENCES location_zone(id) ON DELETE CASCADE
);

-- ============================================================================
-- UPDATE IMAGE_LINK TABLE
-- ============================================================================

ALTER TABLE image_link ADD COLUMN zone_id TEXT;

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Location zone indexes
CREATE INDEX ix_location_zone_location_slug ON location_zone(location_id, slug);
CREATE INDEX ix_location_zone_type ON location_zone(zone_type);
CREATE INDEX ix_location_zone_parent ON location_zone(parent_zone_id);

-- Scene zone indexes
CREATE INDEX ix_scene_zone_scene ON scene_zone(scene_id);
CREATE INDEX ix_scene_zone_zone ON scene_zone(zone_id);

-- Image link zone index
CREATE INDEX ix_image_link_zone ON image_link(zone_id);

-- Migration: Update scene table for direct content storage with Tiptap
-- Replaces contentId/revisionId with chapterId, adds content and wordCount fields

-- Step 1: Create new scene table with updated schema
CREATE TABLE scene_new (
  id TEXT PRIMARY KEY,
  chapter_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT,
  sequence_order INTEGER NOT NULL,
  synopsis TEXT,
  content TEXT,
  scene_when TEXT,
  primary_location_id TEXT,
  pov_entity_id TEXT,
  word_count INTEGER,
  est_read_seconds INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Step 2: Copy existing data (if any) - map content_id to chapter_id
-- Note: This assumes content_id was storing chapter IDs
INSERT INTO scene_new SELECT
  id,
  content_id as chapter_id,
  'default' as workspace_id,
  slug,
  title,
  sequence_order,
  synopsis,
  NULL as content,
  scene_when,
  primary_location_id,
  pov_entity_id,
  NULL as word_count,
  est_read_seconds,
  created_at,
  updated_at
FROM scene;

-- Step 3: Drop old table and rename new table
DROP TABLE scene;
ALTER TABLE scene_new RENAME TO scene;

-- Step 4: Recreate indexes
CREATE INDEX ix_scene_chapter ON scene(chapter_id);
CREATE INDEX ix_scene_sequence ON scene(chapter_id, sequence_order);

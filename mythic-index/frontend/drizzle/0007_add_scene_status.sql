-- Migration: Add status field to scene table
-- Scenes can be 'draft' or 'done' (ready for publishing with chapter)

ALTER TABLE scene ADD COLUMN status TEXT NOT NULL DEFAULT 'draft';

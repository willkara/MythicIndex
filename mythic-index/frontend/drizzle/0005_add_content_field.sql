-- Migration: Add content field to content_item table for rich text HTML storage
-- This supports the Tiptap rich text editor for chapters and scenes

ALTER TABLE content_item ADD COLUMN content TEXT;

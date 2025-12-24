-- Drop all existing tables for clean migration
PRAGMA foreign_keys=OFF;

DROP TABLE IF EXISTS workspace;
DROP TABLE IF EXISTS content_item;
DROP TABLE IF EXISTS content_revision;
DROP TABLE IF EXISTS content_section;
DROP TABLE IF EXISTS content_block;
DROP TABLE IF EXISTS scene;
DROP TABLE IF EXISTS scene_segment;
DROP TABLE IF EXISTS lore_entity;
DROP TABLE IF EXISTS entity_link;
DROP TABLE IF EXISTS content_snapshot;
DROP TABLE IF EXISTS editor_lock;
DROP TABLE IF EXISTS image_asset;
DROP TABLE IF EXISTS image_derivative;
DROP TABLE IF EXISTS image_link;
DROP TABLE IF EXISTS unified_content;
DROP TABLE IF EXISTS embedding;
DROP TABLE IF EXISTS entity;
DROP TABLE IF EXISTS image;
DROP TABLE IF EXISTS character;
DROP TABLE IF EXISTS character_relationship;
DROP TABLE IF EXISTS location;
DROP TABLE IF EXISTS scene_character;
DROP TABLE IF EXISTS scene_tag;
DROP TABLE IF EXISTS __drizzle_migrations;

PRAGMA foreign_keys=ON;

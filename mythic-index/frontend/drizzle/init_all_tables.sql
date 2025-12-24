-- Initial schema: All tables for MythicIndex
-- Generated from schema.ts

-- Workspace table
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`plan` text DEFAULT 'standard' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `workspace_slug_unique` ON `workspace` (`slug`);
CREATE INDEX `ix_workspace_created_at` ON `workspace` (`created_at`);
CREATE INDEX `ix_workspace_updated_at` ON `workspace` (`updated_at`);

-- Content item table
CREATE TABLE `content_item` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`default_revision_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`word_count` integer,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_content_item_kind_slug` ON `content_item` (`kind`,`slug`);
CREATE INDEX `ix_content_item_kind_created` ON `content_item` (`kind`,`created_at`);
CREATE INDEX `ix_content_item_status` ON `content_item` (`status`);
CREATE INDEX `ix_content_item_updated_at` ON `content_item` (`updated_at`);

-- Content revision table
CREATE TABLE `content_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`state` text NOT NULL,
	`author_id` text NOT NULL,
	`based_on_revision_id` text,
	`note` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_content_revision_state` ON `content_revision` (`state`);
CREATE INDEX `ix_content_revision_created_at` ON `content_revision` (`created_at`);
CREATE INDEX `ix_content_revision_updated_at` ON `content_revision` (`updated_at`);

-- Content section table
CREATE TABLE `content_section` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`section_type` text NOT NULL,
	`title` text,
	`position` integer NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_content_section_type` ON `content_section` (`section_type`);
CREATE INDEX `ix_content_section_revision` ON `content_section` (`revision_id`);

-- Content block table
CREATE TABLE `content_block` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`block_type` text NOT NULL,
	`position` integer NOT NULL,
	`text_payload` text,
	`rich_payload` text,
	`word_count` integer,
	`is_scene_anchor` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_content_block_type` ON `content_block` (`block_type`);
CREATE INDEX `ix_content_block_section` ON `content_block` (`section_id`);
CREATE INDEX `ix_content_block_scene_anchor` ON `content_block` (`is_scene_anchor`);

-- Scene table
CREATE TABLE `scene` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`revision_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text,
	`sequence_order` integer NOT NULL,
	`synopsis` text,
	`scene_when` text,
	`primary_location_id` text,
	`pov_entity_id` text,
	`est_read_seconds` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_scene_revision` ON `scene` (`revision_id`);
CREATE INDEX `ix_scene_sequence` ON `scene` (`content_id`,`sequence_order`);

-- Scene segment table
CREATE TABLE `scene_segment` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`block_id` text NOT NULL,
	`span_order` integer NOT NULL,
	`inline_range` text,
	`narration_tone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_scene_segment_scene` ON `scene_segment` (`scene_id`);
CREATE INDEX `ix_scene_segment_block` ON `scene_segment` (`block_id`);

-- Unified content view (virtual table for convenience)
CREATE TABLE `unified_content` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text,
	`type` text,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`word_count` integer,
	`markdown_content` text,
	`created_at` text,
	`updated_at` text
);

-- Lore entity table
CREATE TABLE `lore_entity` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`content_id` text,
	`entity_type` text NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`short_blurb` text,
	`portrait_asset_id` text,
	`origin_scene_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `lore_entity_slug_unique` ON `lore_entity` (`slug`);
CREATE INDEX `ix_lore_entity_type` ON `lore_entity` (`entity_type`);
CREATE INDEX `ix_lore_entity_workspace` ON `lore_entity` (`workspace_id`);

-- Entity link table
CREATE TABLE `entity_link` (
	`id` text PRIMARY KEY NOT NULL,
	`source_entity_id` text NOT NULL,
	`target_entity_id` text NOT NULL,
	`relationship` text NOT NULL,
	`strength` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_entity_link_source` ON `entity_link` (`source_entity_id`);
CREATE INDEX `ix_entity_link_target` ON `entity_link` (`target_entity_id`);
CREATE INDEX `ix_entity_link_relationship` ON `entity_link` (`relationship`);

-- Entity table (for characters, locations, etc.)
CREATE TABLE `entity` (
	`id` text PRIMARY KEY NOT NULL,
	`content_item_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`name` text NOT NULL,
	`aliases` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);

-- Embedding table
CREATE TABLE `embedding` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`embedding_vector` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL
);

-- Image table (legacy)
CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`content_item_id` text,
	`cloudflare_id` text NOT NULL,
	`filename` text NOT NULL,
	`alt_text` text,
	`width` integer,
	`height` integer,
	`created_at` text NOT NULL
);

-- Image asset table (new imagery pipeline)
CREATE TABLE `image_asset` (
	`id` text PRIMARY KEY NOT NULL,
	`source_path` text NOT NULL,
	`storage_path` text NOT NULL,
	`file_hash` text NOT NULL,
	`file_size_bytes` integer NOT NULL,
	`mime_type` text NOT NULL,
	`width` integer,
	`height` integer,
	`generated_by_provider` text,
	`generated_prompt` text,
	`metadata_json` text,
	`cloudflare_image_id` text,
	`cloudflare_base_url` text,
	`cloudflare_variant_names` text,
	`cloudflare_default_variant` text,
	`cloudflare_uploaded_at` text,
	`created_at` text,
	`updated_at` text
);
CREATE INDEX `ix_image_asset_cloudflare` ON `image_asset` (`cloudflare_image_id`);
CREATE INDEX `ix_image_asset_hash` ON `image_asset` (`file_hash`);

-- Image derivative table (resized versions)
CREATE TABLE `image_derivative` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`format` text NOT NULL,
	`width` integer,
	`height` integer,
	`file_size_bytes` integer,
	`storage_path` text NOT NULL,
	`quality` integer,
	`lqip` text,
	`created_at` text
);
CREATE INDEX `ix_image_derivative_asset` ON `image_derivative` (`asset_id`);

-- Image link table (connects images to content)
CREATE TABLE `image_link` (
	`id` text PRIMARY KEY NOT NULL,
	`asset_id` text NOT NULL,
	`content_id` text NOT NULL,
	`scene_id` text,
	`role` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`caption` text,
	`alt_text` text,
	`display_style` text DEFAULT 'float',
	`created_at` text
);
CREATE INDEX `ix_image_link_content` ON `image_link` (`content_id`);
CREATE INDEX `ix_image_link_asset` ON `image_link` (`asset_id`);
CREATE INDEX `ix_image_link_scene` ON `image_link` (`scene_id`);

-- ============================================================================
-- NEW DEDICATED ENTITY TABLES (Schema Redesign)
-- ============================================================================

-- Character table - dedicated table for character entities with typed columns
CREATE TABLE `character` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`content_item_id` text,
	`name` text NOT NULL,
	`aliases` text,
	`race` text,
	`character_class` text,
	`role` text,
	`status` text DEFAULT 'alive',
	`first_appearance` text,
	`appearance_age` text,
	`appearance_height` text,
	`appearance_build` text,
	`appearance_hair` text,
	`appearance_eyes` text,
	`appearance_distinguishing_features` text,
	`appearance_clothing` text,
	`visual_summary` text,
	`personality_archetype` text,
	`personality_temperament` text,
	`personality_positive_traits` text,
	`personality_negative_traits` text,
	`personality_moral_alignment` text,
	`background` text,
	`motivations` text,
	`fears` text,
	`secrets` text,
	`primary_weapons` text,
	`fighting_style` text,
	`tactical_role` text,
	`speech_style` text,
	`signature_phrases` text,
	`faction` text,
	`occupation` text,
	`notes` text,
	`portrait_image_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `character_slug_unique` ON `character` (`slug`);
CREATE INDEX `ix_character_workspace` ON `character` (`workspace_id`);
CREATE INDEX `ix_character_role` ON `character` (`role`);
CREATE INDEX `ix_character_status` ON `character` (`status`);
CREATE INDEX `ix_character_faction` ON `character` (`faction`);

-- Location table - dedicated table for location entities with typed columns
CREATE TABLE `location` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`slug` text NOT NULL,
	`content_item_id` text,
	`name` text NOT NULL,
	`location_type` text,
	`region` text,
	`parent_location_id` text,
	`quick_description` text,
	`visual_summary` text,
	`atmosphere` text,
	`history` text,
	`notable_landmarks` text,
	`key_personnel` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `location_slug_unique` ON `location` (`slug`);
CREATE INDEX `ix_location_workspace` ON `location` (`workspace_id`);
CREATE INDEX `ix_location_type` ON `location` (`location_type`);
CREATE INDEX `ix_location_parent` ON `location` (`parent_location_id`);

-- Character relationship table - relationships between characters
CREATE TABLE `character_relationship` (
	`id` text PRIMARY KEY NOT NULL,
	`source_character_id` text NOT NULL,
	`target_character_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`description` text,
	`strength` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE INDEX `ix_char_rel_source` ON `character_relationship` (`source_character_id`);
CREATE INDEX `ix_char_rel_target` ON `character_relationship` (`target_character_id`);
CREATE INDEX `ix_char_rel_type` ON `character_relationship` (`relationship_type`);

-- Scene-character junction table - tracks which characters appear in which scenes
CREATE TABLE `scene_character` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`character_id` text NOT NULL,
	`role` text,
	`created_at` text NOT NULL
);
CREATE INDEX `ix_scene_char_scene` ON `scene_character` (`scene_id`);
CREATE INDEX `ix_scene_char_character` ON `scene_character` (`character_id`);

-- Scene tag table - tags for scenes (for searchability)
CREATE TABLE `scene_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` text NOT NULL
);
CREATE INDEX `ix_scene_tag_scene` ON `scene_tag` (`scene_id`);
CREATE INDEX `ix_scene_tag_tag` ON `scene_tag` (`tag`);

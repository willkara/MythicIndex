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
--> statement-breakpoint
CREATE UNIQUE INDEX `character_slug_unique` ON `character` (`slug`);--> statement-breakpoint
CREATE INDEX `ix_character_workspace` ON `character` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `ix_character_role` ON `character` (`role`);--> statement-breakpoint
CREATE INDEX `ix_character_status` ON `character` (`status`);--> statement-breakpoint
CREATE INDEX `ix_character_faction` ON `character` (`faction`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `ix_char_rel_source` ON `character_relationship` (`source_character_id`);--> statement-breakpoint
CREATE INDEX `ix_char_rel_target` ON `character_relationship` (`target_character_id`);--> statement-breakpoint
CREATE INDEX `ix_char_rel_type` ON `character_relationship` (`relationship_type`);--> statement-breakpoint
CREATE TABLE `embedding` (
	`id` text PRIMARY KEY NOT NULL,
	`block_id` text NOT NULL,
	`embedding_vector` text NOT NULL,
	`model` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `ix_image_asset_cloudflare` ON `image_asset` (`cloudflare_image_id`);--> statement-breakpoint
CREATE INDEX `ix_image_asset_hash` ON `image_asset` (`file_hash`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `ix_image_derivative_asset` ON `image_derivative` (`asset_id`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE INDEX `ix_image_link_content` ON `image_link` (`content_id`);--> statement-breakpoint
CREATE INDEX `ix_image_link_asset` ON `image_link` (`asset_id`);--> statement-breakpoint
CREATE INDEX `ix_image_link_scene` ON `image_link` (`scene_id`);--> statement-breakpoint
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
--> statement-breakpoint
CREATE UNIQUE INDEX `location_slug_unique` ON `location` (`slug`);--> statement-breakpoint
CREATE INDEX `ix_location_workspace` ON `location` (`workspace_id`);--> statement-breakpoint
CREATE INDEX `ix_location_type` ON `location` (`location_type`);--> statement-breakpoint
CREATE INDEX `ix_location_parent` ON `location` (`parent_location_id`);--> statement-breakpoint
CREATE TABLE `scene_character` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`character_id` text NOT NULL,
	`role` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_scene_char_scene` ON `scene_character` (`scene_id`);--> statement-breakpoint
CREATE INDEX `ix_scene_char_character` ON `scene_character` (`character_id`);--> statement-breakpoint
CREATE TABLE `scene_tag` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`tag` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_scene_tag_scene` ON `scene_tag` (`scene_id`);--> statement-breakpoint
CREATE INDEX `ix_scene_tag_tag` ON `scene_tag` (`tag`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_content_block` (
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
--> statement-breakpoint
INSERT INTO `__new_content_block`("id", "section_id", "block_type", "position", "text_payload", "rich_payload", "word_count", "is_scene_anchor", "created_at", "updated_at") SELECT "id", "section_id", "block_type", "position", "text_payload", "rich_payload", "word_count", "is_scene_anchor", "created_at", "updated_at" FROM `content_block`;--> statement-breakpoint
DROP TABLE `content_block`;--> statement-breakpoint
ALTER TABLE `__new_content_block` RENAME TO `content_block`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `ix_content_block_type` ON `content_block` (`block_type`);--> statement-breakpoint
CREATE INDEX `ix_content_block_section` ON `content_block` (`section_id`);--> statement-breakpoint
CREATE INDEX `ix_content_block_scene_anchor` ON `content_block` (`is_scene_anchor`);--> statement-breakpoint
CREATE TABLE `__new_content_item` (
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
--> statement-breakpoint
INSERT INTO `__new_content_item`("id", "workspace_id", "kind", "slug", "title", "summary", "status", "default_revision_id", "metadata_json", "word_count", "created_by", "updated_by", "created_at", "updated_at") SELECT "id", "workspace_id", "kind", "slug", "title", "summary", "status", "default_revision_id", "metadata_json", "word_count", "created_by", "updated_by", "created_at", "updated_at" FROM `content_item`;--> statement-breakpoint
DROP TABLE `content_item`;--> statement-breakpoint
ALTER TABLE `__new_content_item` RENAME TO `content_item`;--> statement-breakpoint
CREATE INDEX `ix_content_item_kind_slug` ON `content_item` (`kind`,`slug`);--> statement-breakpoint
CREATE INDEX `ix_content_item_kind_created` ON `content_item` (`kind`,`created_at`);--> statement-breakpoint
CREATE INDEX `ix_content_item_status` ON `content_item` (`status`);--> statement-breakpoint
CREATE INDEX `ix_content_item_updated_at` ON `content_item` (`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_content_revision` (
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
--> statement-breakpoint
INSERT INTO `__new_content_revision`("id", "content_id", "revision_number", "state", "author_id", "based_on_revision_id", "note", "created_at", "updated_at") SELECT "id", "content_id", "revision_number", "state", "author_id", "based_on_revision_id", "note", "created_at", "updated_at" FROM `content_revision`;--> statement-breakpoint
DROP TABLE `content_revision`;--> statement-breakpoint
ALTER TABLE `__new_content_revision` RENAME TO `content_revision`;--> statement-breakpoint
CREATE INDEX `ix_content_revision_state` ON `content_revision` (`state`);--> statement-breakpoint
CREATE INDEX `ix_content_revision_created_at` ON `content_revision` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_content_revision_updated_at` ON `content_revision` (`updated_at`);--> statement-breakpoint
CREATE TABLE `__new_content_section` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`section_type` text NOT NULL,
	`title` text,
	`position` integer NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_content_section`("id", "revision_id", "section_type", "title", "position", "metadata_json", "created_at", "updated_at") SELECT "id", "revision_id", "section_type", "title", "position", "metadata_json", "created_at", "updated_at" FROM `content_section`;--> statement-breakpoint
DROP TABLE `content_section`;--> statement-breakpoint
ALTER TABLE `__new_content_section` RENAME TO `content_section`;--> statement-breakpoint
CREATE INDEX `ix_content_section_type` ON `content_section` (`section_type`);--> statement-breakpoint
CREATE INDEX `ix_content_section_revision` ON `content_section` (`revision_id`);--> statement-breakpoint
CREATE TABLE `__new_entity_link` (
	`id` text PRIMARY KEY NOT NULL,
	`source_entity_id` text NOT NULL,
	`target_entity_id` text NOT NULL,
	`relationship` text NOT NULL,
	`strength` integer,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_entity_link`("id", "source_entity_id", "target_entity_id", "relationship", "strength", "notes", "created_at", "updated_at") SELECT "id", "source_entity_id", "target_entity_id", "relationship", "strength", "notes", "created_at", "updated_at" FROM `entity_link`;--> statement-breakpoint
DROP TABLE `entity_link`;--> statement-breakpoint
ALTER TABLE `__new_entity_link` RENAME TO `entity_link`;--> statement-breakpoint
CREATE INDEX `ix_entity_link_source` ON `entity_link` (`source_entity_id`);--> statement-breakpoint
CREATE INDEX `ix_entity_link_target` ON `entity_link` (`target_entity_id`);--> statement-breakpoint
CREATE INDEX `ix_entity_link_relationship` ON `entity_link` (`relationship`);--> statement-breakpoint
CREATE TABLE `__new_lore_entity` (
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
--> statement-breakpoint
INSERT INTO `__new_lore_entity`("id", "workspace_id", "content_id", "entity_type", "slug", "display_name", "short_blurb", "portrait_asset_id", "origin_scene_id", "created_at", "updated_at") SELECT "id", "workspace_id", "content_id", "entity_type", "slug", "display_name", "short_blurb", "portrait_asset_id", "origin_scene_id", "created_at", "updated_at" FROM `lore_entity`;--> statement-breakpoint
DROP TABLE `lore_entity`;--> statement-breakpoint
ALTER TABLE `__new_lore_entity` RENAME TO `lore_entity`;--> statement-breakpoint
CREATE UNIQUE INDEX `lore_entity_slug_unique` ON `lore_entity` (`slug`);--> statement-breakpoint
CREATE INDEX `ix_lore_entity_type` ON `lore_entity` (`entity_type`);--> statement-breakpoint
CREATE INDEX `ix_lore_entity_workspace` ON `lore_entity` (`workspace_id`);--> statement-breakpoint
CREATE TABLE `__new_scene` (
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
--> statement-breakpoint
INSERT INTO `__new_scene`("id", "content_id", "revision_id", "slug", "title", "sequence_order", "synopsis", "scene_when", "primary_location_id", "pov_entity_id", "est_read_seconds", "created_at", "updated_at") SELECT "id", "content_id", "revision_id", "slug", "title", "sequence_order", "synopsis", "scene_when", "primary_location_id", "pov_entity_id", "est_read_seconds", "created_at", "updated_at" FROM `scene`;--> statement-breakpoint
DROP TABLE `scene`;--> statement-breakpoint
ALTER TABLE `__new_scene` RENAME TO `scene`;--> statement-breakpoint
CREATE INDEX `ix_scene_revision` ON `scene` (`revision_id`);--> statement-breakpoint
CREATE INDEX `ix_scene_sequence` ON `scene` (`content_id`,`sequence_order`);--> statement-breakpoint
CREATE TABLE `__new_scene_segment` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`block_id` text NOT NULL,
	`span_order` integer NOT NULL,
	`inline_range` text,
	`narration_tone` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_scene_segment`("id", "scene_id", "block_id", "span_order", "inline_range", "narration_tone", "created_at", "updated_at") SELECT "id", "scene_id", "block_id", "span_order", "inline_range", "narration_tone", "created_at", "updated_at" FROM `scene_segment`;--> statement-breakpoint
DROP TABLE `scene_segment`;--> statement-breakpoint
ALTER TABLE `__new_scene_segment` RENAME TO `scene_segment`;--> statement-breakpoint
CREATE INDEX `ix_scene_segment_scene` ON `scene_segment` (`scene_id`);--> statement-breakpoint
CREATE INDEX `ix_scene_segment_block` ON `scene_segment` (`block_id`);--> statement-breakpoint
CREATE TABLE `__new_unified_content` (
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
--> statement-breakpoint
INSERT INTO `__new_unified_content`("id", "kind", "type", "slug", "title", "summary", "word_count", "markdown_content", "created_at", "updated_at") SELECT "id", "kind", "type", "slug", "title", "summary", "word_count", "markdown_content", "created_at", "updated_at" FROM `unified_content`;--> statement-breakpoint
DROP TABLE `unified_content`;--> statement-breakpoint
ALTER TABLE `__new_unified_content` RENAME TO `unified_content`;--> statement-breakpoint
CREATE TABLE `__new_workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`plan` text DEFAULT 'standard' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_workspace`("id", "slug", "name", "description", "plan", "created_at", "updated_at") SELECT "id", "slug", "name", "description", "plan", "created_at", "updated_at" FROM `workspace`;--> statement-breakpoint
DROP TABLE `workspace`;--> statement-breakpoint
ALTER TABLE `__new_workspace` RENAME TO `workspace`;--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_slug_unique` ON `workspace` (`slug`);--> statement-breakpoint
CREATE INDEX `ix_workspace_created_at` ON `workspace` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_workspace_updated_at` ON `workspace` (`updated_at`);
CREATE TABLE `content_block` (
	`id` text PRIMARY KEY NOT NULL,
	`section_id` text NOT NULL,
	`block_type` text NOT NULL,
	`position` integer NOT NULL,
	`text_payload` text,
	`rich_payload` text,
	`word_count` integer,
	`is_scene_anchor` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`section_id`) REFERENCES `content_section`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_content_block_type` ON `content_block` (`block_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_block_section_id_position_unique` ON `content_block` (`section_id`,`position`);--> statement-breakpoint
CREATE TABLE `content_item` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`kind` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`default_revision_id` text,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_content_item_kind` ON `content_item` (`kind`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_item_workspace_id_kind_slug_unique` ON `content_item` (`workspace_id`,`kind`,`slug`);--> statement-breakpoint
CREATE TABLE `content_revision` (
	`id` text PRIMARY KEY NOT NULL,
	`content_id` text NOT NULL,
	`revision_number` integer NOT NULL,
	`state` text NOT NULL,
	`author_id` text NOT NULL,
	`based_on_revision_id` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `content_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `content_revision_content_id_revision_number_unique` ON `content_revision` (`content_id`,`revision_number`);--> statement-breakpoint
CREATE TABLE `content_section` (
	`id` text PRIMARY KEY NOT NULL,
	`revision_id` text NOT NULL,
	`section_type` text NOT NULL,
	`title` text,
	`position` integer NOT NULL,
	`metadata_json` text DEFAULT '{}',
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`revision_id`) REFERENCES `content_revision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ix_content_section_type` ON `content_section` (`section_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `content_section_revision_id_section_type_position_unique` ON `content_section` (`revision_id`,`section_type`,`position`);--> statement-breakpoint
CREATE TABLE `entity_link` (
	`id` text PRIMARY KEY NOT NULL,
	`source_entity_id` text NOT NULL,
	`target_entity_id` text NOT NULL,
	`relationship` text NOT NULL,
	`strength` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`source_entity_id`) REFERENCES `lore_entity`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_entity_id`) REFERENCES `lore_entity`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entity_link_source_entity_id_target_entity_id_relationship_unique` ON `entity_link` (`source_entity_id`,`target_entity_id`,`relationship`);--> statement-breakpoint
CREATE TABLE `lore_entity` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`content_id` text,
	`entity_type` text NOT NULL,
	`slug` text NOT NULL,
	`display_name` text NOT NULL,
	`short_blurb` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`content_id`) REFERENCES `content_item`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lore_entity_content_id_unique` ON `lore_entity` (`content_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `lore_entity_slug_unique` ON `lore_entity` (`slug`);--> statement-breakpoint
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
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`content_id`) REFERENCES `content_item`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`revision_id`) REFERENCES `content_revision`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scene_content_id_slug_unique` ON `scene` (`content_id`,`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `scene_content_id_sequence_order_unique` ON `scene` (`content_id`,`sequence_order`);--> statement-breakpoint
CREATE TABLE `scene_segment` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`block_id` text NOT NULL,
	`span_order` integer NOT NULL,
	`inline_range` text,
	`narration_tone` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`scene_id`) REFERENCES `scene`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `content_block`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scene_segment_scene_id_block_id_span_order_unique` ON `scene_segment` (`scene_id`,`block_id`,`span_order`);--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`plan` text DEFAULT 'standard' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_slug_unique` ON `workspace` (`slug`);
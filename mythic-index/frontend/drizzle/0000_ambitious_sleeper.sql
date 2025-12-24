CREATE TABLE `unified_content` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text(13) NOT NULL,
	`slug` text(255) NOT NULL,
	`title` text(500) NOT NULL,
	`markdown_content` text,
	`word_count` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ix_unified_content_created_at` ON `unified_content` (`created_at`);--> statement-breakpoint
CREATE INDEX `ix_unified_content_updated_at` ON `unified_content` (`updated_at`);--> statement-breakpoint
CREATE INDEX `ix_unified_content_slug` ON `unified_content` (`slug`);--> statement-breakpoint
CREATE INDEX `ix_unified_content_type` ON `unified_content` (`type`);--> statement-breakpoint
CREATE INDEX `uq_content_type_slug` ON `unified_content` (`type`,`slug`);
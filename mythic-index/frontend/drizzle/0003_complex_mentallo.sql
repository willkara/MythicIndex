DROP INDEX `ix_content_block_section`;--> statement-breakpoint
CREATE INDEX `ix_content_block_section` ON `content_block` (`section_id`,`position`);--> statement-breakpoint
DROP INDEX `ix_content_section_revision`;--> statement-breakpoint
CREATE INDEX `ix_content_section_revision` ON `content_section` (`revision_id`,`position`);--> statement-breakpoint
DROP INDEX `ix_image_link_content`;--> statement-breakpoint
CREATE INDEX `ix_image_link_content` ON `image_link` (`content_id`,`sort_order`);--> statement-breakpoint
DROP INDEX `ix_scene_segment_scene`;--> statement-breakpoint
CREATE INDEX `ix_scene_segment_scene` ON `scene_segment` (`scene_id`,`span_order`);
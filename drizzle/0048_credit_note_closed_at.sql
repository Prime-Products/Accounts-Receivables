ALTER TABLE `credit_notes` ADD `closedAt` bigint;--> statement-breakpoint
CREATE INDEX `idx_credit_notes_closedAt` ON `credit_notes` (`closedAt`);

CREATE INDEX `idx_tasks_customerId` ON `tasks` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `idx_tasks_assigneeId` ON `tasks` (`assigneeId`);--> statement-breakpoint
CREATE INDEX `idx_tasks_dueDate` ON `tasks` (`dueDate`);
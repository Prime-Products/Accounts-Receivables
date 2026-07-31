CREATE TABLE `task_watchers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`memberId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_watchers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_task_watchers_taskId` ON `task_watchers` (`taskId`);
CREATE TABLE `task_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`authorId` int,
	`authorName` varchar(191) NOT NULL DEFAULT '',
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_comments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `task_invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_task_comments_taskId` ON `task_comments` (`taskId`);--> statement-breakpoint
CREATE INDEX `idx_task_invoices_taskId` ON `task_invoices` (`taskId`);
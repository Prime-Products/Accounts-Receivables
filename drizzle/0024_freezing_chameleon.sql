CREATE TABLE `request_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`userId` int NOT NULL,
	`isRead` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `request_notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `request_responses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`requestId` int NOT NULL,
	`respondedBy` int NOT NULL,
	`response` text NOT NULL,
	`respondedAt` bigint NOT NULL,
	CONSTRAINT `request_responses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int,
	`groupName` varchar(255),
	`createdBy` int NOT NULL,
	`requestedDepartment` enum('Contracts','Logistics','Operations','Finance','Legal','Sales','Other') NOT NULL,
	`question` text NOT NULL,
	`status` enum('Open','Answered','Closed','Cancelled') NOT NULL DEFAULT 'Open',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_requestNotifications_requestId` ON `request_notifications` (`requestId`);--> statement-breakpoint
CREATE INDEX `idx_requestNotifications_userId` ON `request_notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_requestNotifications_isRead` ON `request_notifications` (`isRead`);--> statement-breakpoint
CREATE INDEX `idx_requestResponses_requestId` ON `request_responses` (`requestId`);--> statement-breakpoint
CREATE INDEX `idx_requestResponses_respondedBy` ON `request_responses` (`respondedBy`);--> statement-breakpoint
CREATE INDEX `idx_requests_customerId` ON `requests` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_requests_groupName` ON `requests` (`groupName`);--> statement-breakpoint
CREATE INDEX `idx_requests_createdBy` ON `requests` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_requests_status` ON `requests` (`status`);
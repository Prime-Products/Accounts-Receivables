CREATE TABLE `app_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `app_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `app_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `forecast_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`customerId` int NOT NULL,
	`dueAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`overdueAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`aiSuggestedAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`aiReasoning` text,
	`expectedAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`userAdjusted` int NOT NULL DEFAULT 0,
	`adjustedBy` int,
	`adjustmentNote` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `forecast_entries_id` PRIMARY KEY(`id`)
);

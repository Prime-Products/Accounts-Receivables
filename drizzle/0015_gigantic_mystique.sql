CREATE TABLE `group_confirmation_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupName` varchar(255) NOT NULL,
	`status` enum('Not Contacted','Confirmed','Pending Follow-up','Broken') NOT NULL DEFAULT 'Not Contacted',
	`amount` decimal(14,2) NOT NULL DEFAULT '0',
	`followUpDate` bigint,
	`notes` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `group_confirmation_status_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_confirmation_status_groupName_unique` UNIQUE(`groupName`)
);

CREATE TABLE `group_watch_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupName` varchar(255) NOT NULL,
	`status` enum('Auto','Problematic','On Watch') NOT NULL DEFAULT 'Auto',
	`updatedBy` int,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `group_watch_status_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_watch_status_groupName_unique` UNIQUE(`groupName`)
);

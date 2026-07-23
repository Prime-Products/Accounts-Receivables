CREATE TABLE `group_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupName` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`createdBy` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `group_notes_id` PRIMARY KEY(`id`)
);

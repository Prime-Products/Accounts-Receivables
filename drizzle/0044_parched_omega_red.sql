CREATE TABLE `note_mentions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`memberId` int NOT NULL,
	`groupName` varchar(255) NOT NULL,
	`source` enum('call','collectionNotes','groupNote') NOT NULL,
	`activityId` int,
	`excerpt` varchar(500),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	CONSTRAINT `note_mentions_id` PRIMARY KEY(`id`)
);

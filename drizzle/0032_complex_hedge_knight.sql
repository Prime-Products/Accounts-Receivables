CREATE TABLE `group_collection_profile` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupName` varchar(255) NOT NULL,
	`notes` text NOT NULL,
	`updatedBy` int,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `group_collection_profile_id` PRIMARY KEY(`id`),
	CONSTRAINT `group_collection_profile_groupName_unique` UNIQUE(`groupName`)
);

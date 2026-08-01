CREATE TABLE `gift_import_review` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`sourceName` varchar(255) NOT NULL,
	`sourceGroup` varchar(255),
	`region` varchar(120),
	`tier` enum('Small','Medium','Special','Super Special','Whiskey') NOT NULL DEFAULT 'Small',
	`comment` varchar(500),
	`matchKind` varchar(32) NOT NULL,
	`candidates` text,
	`status` enum('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
	`resolvedContactId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gift_import_review_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `gift_review_year_status_idx` ON `gift_import_review` (`year`,`status`);
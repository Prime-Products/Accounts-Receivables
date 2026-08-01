CREATE TABLE `contact_gifts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`year` int NOT NULL,
	`tier` enum('Small','Medium','Special','Super Special','Whiskey') NOT NULL DEFAULT 'Small',
	`region` varchar(120),
	`sourceName` varchar(255),
	`sourceGroup` varchar(255),
	`notes` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contact_gifts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contact_gifts_contact_year_idx` UNIQUE(`contactId`,`year`)
);
--> statement-breakpoint
CREATE INDEX `contact_gifts_year_idx` ON `contact_gifts` (`year`);
CREATE TABLE `vessels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(191) NOT NULL,
	`customerId` int,
	`imo` varchar(32),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vessels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `vesselId` int;--> statement-breakpoint
CREATE INDEX `idx_vessels_name` ON `vessels` (`name`);--> statement-breakpoint
CREATE INDEX `idx_vessels_customerId` ON `vessels` (`customerId`);
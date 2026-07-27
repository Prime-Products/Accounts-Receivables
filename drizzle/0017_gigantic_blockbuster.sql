CREATE TABLE `wire_transfers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`currency` varchar(8) NOT NULL DEFAULT 'EUR',
	`transferDate` bigint NOT NULL,
	`status` enum('Pending','Received') NOT NULL DEFAULT 'Pending',
	`receivedDate` bigint,
	`referenceNumber` varchar(255),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wire_transfers_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_wire_transfers_customerId` ON `wire_transfers` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_wire_transfers_status` ON `wire_transfers` (`status`);--> statement-breakpoint
CREATE INDEX `idx_wire_transfers_transferDate` ON `wire_transfers` (`transferDate`);
CREATE TABLE `wire_transfer_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`wireTransferId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wire_transfer_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_wta_wireTransferId` ON `wire_transfer_allocations` (`wireTransferId`);--> statement-breakpoint
CREATE INDEX `idx_wta_invoiceId` ON `wire_transfer_allocations` (`invoiceId`);
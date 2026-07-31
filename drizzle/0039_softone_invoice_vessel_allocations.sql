CREATE TABLE `invoice_vessel_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`invoiceId` int NOT NULL,
	`vesselId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`softoneInstallmentId` varchar(64) NOT NULL,
	`contractSoftoneId` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoice_vessel_allocations_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoice_vessel_allocations_softoneInstallmentId_unique` UNIQUE(`softoneInstallmentId`)
);
--> statement-breakpoint
CREATE INDEX `idx_iva_invoiceId` ON `invoice_vessel_allocations` (`invoiceId`);
--> statement-breakpoint
CREATE INDEX `idx_iva_vesselId` ON `invoice_vessel_allocations` (`vesselId`);

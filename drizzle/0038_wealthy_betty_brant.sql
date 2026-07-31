CREATE TABLE `credit_note_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creditNoteId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `credit_note_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `credit_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`docNumber` varchar(64) NOT NULL,
	`docDate` bigint NOT NULL,
	`branch` varchar(128),
	`currency` varchar(8) NOT NULL DEFAULT 'EUR',
	`amount` decimal(14,2) NOT NULL,
	`openAmount` decimal(14,2) NOT NULL,
	`openAmountEur` decimal(14,2),
	`vesselId` int,
	`contractNo` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `credit_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_cna_creditNoteId` ON `credit_note_allocations` (`creditNoteId`);--> statement-breakpoint
CREATE INDEX `idx_cna_invoiceId` ON `credit_note_allocations` (`invoiceId`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_customerId` ON `credit_notes` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_docNumber` ON `credit_notes` (`docNumber`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_docDate` ON `credit_notes` (`docDate`);--> statement-breakpoint
CREATE INDEX `idx_credit_notes_branch` ON `credit_notes` (`branch`);
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
CREATE TABLE `custom_field_defs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` enum('group','customer','vessel','contact') NOT NULL,
	`fieldKey` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`fieldType` enum('text','longtext','number','date','select','checkbox','email','phone','url') NOT NULL DEFAULT 'text',
	`options` text,
	`helpText` varchar(255),
	`required` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`archived` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_defs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_custom_field_entity_key` UNIQUE(`entity`,`fieldKey`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fieldId` int NOT NULL,
	`entity` enum('group','customer','vessel','contact') NOT NULL,
	`recordKey` varchar(255) NOT NULL,
	`value` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_custom_value_field_record` UNIQUE(`fieldId`,`recordKey`)
);
--> statement-breakpoint
CREATE TABLE `list_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`listKey` varchar(64) NOT NULL,
	`config` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `list_layouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_list_layout_user_list` UNIQUE(`userId`,`listKey`)
);
--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` enum('group','customer','vessel','contact') NOT NULL,
	`name` varchar(128) NOT NULL,
	`config` text NOT NULL,
	`shared` int NOT NULL DEFAULT 0,
	`ownerId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `payment_contacts` ADD `archived` int DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `payment_contacts` ADD `archivedAt` timestamp;
--> statement-breakpoint
ALTER TABLE `payment_contacts` ADD `mergedIntoId` int;
--> statement-breakpoint
CREATE INDEX `idx_cna_creditNoteId` ON `credit_note_allocations` (`creditNoteId`);
--> statement-breakpoint
CREATE INDEX `idx_cna_invoiceId` ON `credit_note_allocations` (`invoiceId`);
--> statement-breakpoint
CREATE INDEX `idx_credit_notes_customerId` ON `credit_notes` (`customerId`);
--> statement-breakpoint
CREATE INDEX `idx_credit_notes_docNumber` ON `credit_notes` (`docNumber`);
--> statement-breakpoint
CREATE INDEX `idx_credit_notes_docDate` ON `credit_notes` (`docDate`);
--> statement-breakpoint
CREATE INDEX `idx_credit_notes_branch` ON `credit_notes` (`branch`);
--> statement-breakpoint
CREATE INDEX `idx_custom_value_entity_record` ON `custom_field_values` (`entity`,`recordKey`);
--> statement-breakpoint
CREATE INDEX `idx_saved_views_entity` ON `saved_views` (`entity`);

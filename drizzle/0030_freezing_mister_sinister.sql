-- In-place compatibility migration for installations that previously used
-- the Prime Products custom 0010 migration. The upstream project rewrote
-- migrations 0010-0029, so those older timestamps are skipped by Drizzle on
-- an existing hub_prime database. All additions below are idempotent.

ALTER TABLE `group_watch_status` MODIFY COLUMN `status` enum('Auto','Problematic','On Watch','Normal','Critical','Legal','Resolved','Under Review','On Hold') NOT NULL DEFAULT 'Auto';--> statement-breakpoint
ALTER TABLE `forecast_entries` ADD COLUMN IF NOT EXISTS `initialForecast` decimal(14,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `group_watch_status` ADD COLUMN IF NOT EXISTS `problematicSince` bigint;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `email_history` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` int NOT NULL,
  `recipientEmail` varchar(320) NOT NULL,
  `recipientName` varchar(255),
  `templateType` enum('Friendly Reminder','Final Notice','Statement','Custom') NOT NULL,
  `subject` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `status` enum('Sent','Failed','Pending') NOT NULL DEFAULT 'Pending',
  `sentAt` bigint,
  `errorMessage` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `attachmentUrl` varchar(2048),
  CONSTRAINT `email_history_id` PRIMARY KEY(`id`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `activity_log` (
  `id` int AUTO_INCREMENT NOT NULL,
  `groupName` varchar(255) NOT NULL,
  `customerId` int,
  `activityType` enum('note','task','promise','email','call','status_change') NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `metadata` text,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_contacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(320) NOT NULL,
  `phone` varchar(20),
  `title` varchar(255),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `payment_contacts_id` PRIMARY KEY(`id`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `group_confirmation_status` (
  `id` int AUTO_INCREMENT NOT NULL,
  `groupName` varchar(255) NOT NULL,
  `status` enum('Not Contacted','Confirmed','Pending Follow-up','Broken') NOT NULL DEFAULT 'Not Contacted',
  `amount` decimal(14,2) NOT NULL DEFAULT '0',
  `followUpDate` bigint,
  `notes` text,
  `updatedBy` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `group_confirmation_status_id` PRIMARY KEY(`id`),
  CONSTRAINT `group_confirmation_status_groupName_unique` UNIQUE(`groupName`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `payment_bank_details` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` int NOT NULL,
  `iban` varchar(34),
  `accountNumber` varchar(64),
  `bankName` varchar(255),
  `swiftCode` varchar(11),
  `beneficiaryName` varchar(255),
  `currency` varchar(8) NOT NULL DEFAULT 'EUR',
  `isDefault` int NOT NULL DEFAULT 1,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedBy` int,
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `payment_bank_details_id` PRIMARY KEY(`id`),
  CONSTRAINT `payment_bank_details_customerId_unique` UNIQUE(`customerId`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bank_details_customerId` ON `payment_bank_details` (`customerId`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `wire_transfers` (
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
  `branch` varchar(128),
  `isInternal` boolean DEFAULT false NOT NULL,
  `sourceWireTransferId` int,
  `sourceAllocationId` int,
  `fromBranch` varchar(128),
  `toBranch` varchar(128),
  CONSTRAINT `wire_transfers_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wire_transfers_customerId` ON `wire_transfers` (`customerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wire_transfers_status` ON `wire_transfers` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wire_transfers_transferDate` ON `wire_transfers` (`transferDate`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wire_transfers_sourceWireTransferId` ON `wire_transfers` (`sourceWireTransferId`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `wire_transfer_allocations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `wireTransferId` int NOT NULL,
  `invoiceId` int NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `wire_transfer_allocations_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wta_wireTransferId` ON `wire_transfer_allocations` (`wireTransferId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_wta_invoiceId` ON `wire_transfer_allocations` (`invoiceId`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `vessels` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(191) NOT NULL,
  `customerId` int,
  `imo` varchar(32),
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `vesselType` varchar(64),
  `flag` varchar(64),
  CONSTRAINT `vessels_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_vessels_name` ON `vessels` (`name`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_vessels_customerId` ON `vessels` (`customerId`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `team_members` (
  `id` int AUTO_INCREMENT NOT NULL,
  `name` varchar(191) NOT NULL,
  `email` varchar(320),
  `phone` varchar(64),
  `title` varchar(128),
  `userId` int,
  `active` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `team_members_id` PRIMARY KEY(`id`)
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `request_notifications` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requestId` int NOT NULL,
  `userId` int NOT NULL,
  `isRead` boolean NOT NULL DEFAULT false,
  `createdAt` bigint NOT NULL,
  CONSTRAINT `request_notifications_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `request_responses` (
  `id` int AUTO_INCREMENT NOT NULL,
  `requestId` int NOT NULL,
  `respondedBy` int NOT NULL,
  `response` text NOT NULL,
  `respondedAt` bigint NOT NULL,
  CONSTRAINT `request_responses_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `customerId` int,
  `groupName` varchar(255),
  `createdBy` int NOT NULL,
  `requestedDepartment` enum('Contracts','Logistics','Operations','Finance','Legal','Sales','Other') NOT NULL,
  `question` text NOT NULL,
  `status` enum('Open','Answered','Closed','Cancelled') NOT NULL DEFAULT 'Open',
  `createdAt` bigint NOT NULL,
  `updatedAt` bigint NOT NULL,
  CONSTRAINT `requests_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requestNotifications_requestId` ON `request_notifications` (`requestId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requestNotifications_userId` ON `request_notifications` (`userId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requestNotifications_isRead` ON `request_notifications` (`isRead`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requestResponses_requestId` ON `request_responses` (`requestId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requestResponses_respondedBy` ON `request_responses` (`respondedBy`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requests_customerId` ON `requests` (`customerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requests_groupName` ON `requests` (`groupName`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requests_createdBy` ON `requests` (`createdBy`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_requests_status` ON `requests` (`status`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `task_comments` (
  `id` int AUTO_INCREMENT NOT NULL,
  `taskId` int NOT NULL,
  `authorId` int,
  `authorName` varchar(191) NOT NULL DEFAULT '',
  `body` text NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `task_comments_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `task_invoices` (
  `id` int AUTO_INCREMENT NOT NULL,
  `taskId` int NOT NULL,
  `invoiceId` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `task_invoices_id` PRIMARY KEY(`id`)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_task_comments_taskId` ON `task_comments` (`taskId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_task_invoices_taskId` ON `task_invoices` (`taskId`);--> statement-breakpoint

ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `vesselId` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD COLUMN IF NOT EXISTS `isContractInstallment` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `accountManagerId` int;--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `collectorId` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD COLUMN IF NOT EXISTS `assigneeId` int;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_customerId` ON `tasks` (`customerId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_status` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_assigneeId` ON `tasks` (`assigneeId`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_tasks_dueDate` ON `tasks` (`dueDate`);--> statement-breakpoint

ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `masterSoftoneId` varchar(64);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `turnoverTwoYearsAgo` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `balance` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `uncovered` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `unpaid` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `overdue` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `overdueEndOfMonth` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `averageOverdueDays` decimal(12,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `openOrders` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `ordersAmount` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `collections` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD COLUMN IF NOT EXISTS `softoneSyncedAt` timestamp;

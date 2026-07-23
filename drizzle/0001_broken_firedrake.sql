CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(255),
	`action` varchar(128) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` varchar(64),
	`details` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `collection_plans` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`targetAmount` decimal(14,2) NOT NULL,
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `collection_plans_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contract_installments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contractId` int NOT NULL,
	`installmentNumber` int NOT NULL,
	`dueDate` bigint NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`status` enum('Upcoming','Invoiced','Paid','Overdue') NOT NULL DEFAULT 'Upcoming',
	`invoiceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contract_installments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`contractNumber` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`totalValue` decimal(14,2) NOT NULL,
	`startDate` bigint NOT NULL,
	`endDate` bigint NOT NULL,
	`status` enum('Active','Expiring Soon','Expired','Terminated') NOT NULL DEFAULT 'Active',
	`expiryNotified` int NOT NULL DEFAULT 0,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contracts_id` PRIMARY KEY(`id`),
	CONSTRAINT `contracts_contractNumber_unique` UNIQUE(`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`vatNumber` varchar(32),
	`email` varchar(320),
	`phone` varchar(64),
	`contactPerson` varchar(255),
	`tier` enum('Platinum','Gold','Silver','Bronze','New') NOT NULL DEFAULT 'New',
	`creditLimit` decimal(14,2) NOT NULL DEFAULT '0',
	`paymentTermsDays` int NOT NULL DEFAULT 30,
	`onHoldStatus` enum('Active','Under Review','Eligible for On Hold','On Hold','Legal') NOT NULL DEFAULT 'Active',
	`softoneId` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `customers_id` PRIMARY KEY(`id`),
	CONSTRAINT `customers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`invoiceNumber` varchar(64) NOT NULL,
	`issueDate` bigint NOT NULL,
	`dueDate` bigint NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`paidAmount` decimal(14,2) NOT NULL DEFAULT '0',
	`status` enum('Open','Partially Paid','Paid','Overdue','Disputed') NOT NULL DEFAULT 'Open',
	`contractInstallmentId` int,
	`softoneId` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`),
	CONSTRAINT `invoices_invoiceNumber_unique` UNIQUE(`invoiceNumber`)
);
--> statement-breakpoint
CREATE TABLE `on_hold_proposals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`status` enum('Under Review','Eligible for On Hold','On Hold','Legal','Rejected','Resolved') NOT NULL DEFAULT 'Under Review',
	`reason` text NOT NULL,
	`totalOverdue` decimal(14,2) NOT NULL,
	`overdueInvoiceCount` int NOT NULL,
	`oldestOverdueDays` int NOT NULL,
	`supportingData` text,
	`submittedBy` int NOT NULL,
	`decidedBy` int,
	`decisionNotes` text,
	`decidedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `on_hold_proposals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `promises_to_pay` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`invoiceId` int,
	`promisedDate` bigint NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`status` enum('Pending','Kept','Broken') NOT NULL DEFAULT 'Pending',
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `promises_to_pay_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receipt_allocations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`receiptId` int NOT NULL,
	`invoiceId` int NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receipt_allocations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`receiptNumber` varchar(64) NOT NULL,
	`receiptDate` bigint NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`method` enum('Bank Transfer','Cash','Cheque','Card') NOT NULL DEFAULT 'Bank Transfer',
	`softoneId` varchar(64),
	`notes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `receipts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`direction` enum('Pull','Push') NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`recordCount` int NOT NULL DEFAULT 0,
	`status` enum('Success','Failed','Partial') NOT NULL,
	`message` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`invoiceId` int,
	`contractId` int,
	`type` enum('Follow-up +2','Follow-up +15','Follow-up +20 SOA','Escalation +30','Contract Expiry','Manual') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`dueDate` bigint NOT NULL,
	`status` enum('Pending','In Progress','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
	`assignedTo` int,
	`completedAt` bigint,
	`completionNotes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`appRole` enum('Administrator','Accounting','Credit Controller','Management') NOT NULL DEFAULT 'Accounting',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_profiles_userId_unique` UNIQUE(`userId`)
);

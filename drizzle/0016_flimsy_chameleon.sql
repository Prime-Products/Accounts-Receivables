CREATE TABLE `payment_bank_details` (
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
);
--> statement-breakpoint
CREATE INDEX `idx_bank_details_customerId` ON `payment_bank_details` (`customerId`);
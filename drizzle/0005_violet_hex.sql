CREATE TABLE `payment_behavior` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`payments` int NOT NULL DEFAULT 0,
	`totalPaid` double NOT NULL DEFAULT 0,
	`avgDaysLate` double NOT NULL DEFAULT 0,
	`medianDaysLate` double NOT NULL DEFAULT 0,
	`avgDaysFromInvoice` double NOT NULL DEFAULT 0,
	`medianDaysFromInvoice` double NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_behavior_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_behavior_customerId_unique` UNIQUE(`customerId`)
);

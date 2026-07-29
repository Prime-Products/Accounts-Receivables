CREATE TABLE `email_history` (
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
	CONSTRAINT `email_history_id` PRIMARY KEY(`id`)
);

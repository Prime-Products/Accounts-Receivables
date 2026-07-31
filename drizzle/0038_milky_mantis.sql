CREATE TABLE `email_templates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`templateType` enum('SOA','Payment Reminder','Overdue Notice','Friendly Reminder','Final Notice','Statement','Custom') NOT NULL,
	`subject` varchar(500) NOT NULL,
	`body` text NOT NULL,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `email_templates_id` PRIMARY KEY(`id`),
	CONSTRAINT `email_templates_templateType_unique` UNIQUE(`templateType`)
);

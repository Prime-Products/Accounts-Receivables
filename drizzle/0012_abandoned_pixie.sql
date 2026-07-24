CREATE TABLE `activity_log` (
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
);

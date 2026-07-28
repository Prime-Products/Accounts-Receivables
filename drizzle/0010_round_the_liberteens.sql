ALTER TABLE `customers` ADD `masterSoftoneId` varchar(64);--> statement-breakpoint
ALTER TABLE `customers` ADD `turnoverTwoYearsAgo` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `balance` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `uncovered` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `unpaid` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `overdue` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `overdueEndOfMonth` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `averageOverdueDays` decimal(12,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `openOrders` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `ordersAmount` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `collections` decimal(18,4);--> statement-breakpoint
ALTER TABLE `customers` ADD `softoneSyncedAt` timestamp;
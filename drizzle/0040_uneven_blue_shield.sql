ALTER TABLE `payment_contacts` ADD `archived` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `payment_contacts` ADD `archivedAt` timestamp;--> statement-breakpoint
ALTER TABLE `payment_contacts` ADD `mergedIntoId` int;
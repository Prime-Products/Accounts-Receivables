ALTER TABLE `customers` ADD `customerGroup` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `company` varchar(128);--> statement-breakpoint
ALTER TABLE `invoices` ADD `currency` varchar(8) DEFAULT 'EUR' NOT NULL;
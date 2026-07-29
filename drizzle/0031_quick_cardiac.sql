ALTER TABLE `invoices` DROP INDEX `invoices_invoiceNumber_unique`;--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_softoneId_unique` UNIQUE(`softoneId`);
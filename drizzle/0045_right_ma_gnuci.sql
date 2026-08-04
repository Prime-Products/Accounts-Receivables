CREATE INDEX `idx_activity_group_created` ON `activity_log` (`groupName`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_activity_type_created` ON `activity_log` (`activityType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_customers_customerGroup` ON `customers` (`customerGroup`);--> statement-breakpoint
CREATE INDEX `idx_customers_name` ON `customers` (`name`);--> statement-breakpoint
CREATE INDEX `idx_group_notes_groupName` ON `group_notes` (`groupName`);--> statement-breakpoint
CREATE INDEX `idx_payment_contacts_customerId` ON `payment_contacts` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_payment_contacts_email` ON `payment_contacts` (`email`);--> statement-breakpoint
CREATE INDEX `idx_payment_contacts_archived` ON `payment_contacts` (`archived`);--> statement-breakpoint
CREATE INDEX `idx_promises_customerId` ON `promises_to_pay` (`customerId`);--> statement-breakpoint
CREATE INDEX `idx_promises_status` ON `promises_to_pay` (`status`);--> statement-breakpoint
CREATE INDEX `idx_promises_promisedDate` ON `promises_to_pay` (`promisedDate`);
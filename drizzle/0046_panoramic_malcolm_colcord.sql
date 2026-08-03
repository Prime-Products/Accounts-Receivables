ALTER TABLE `tasks` ADD `customerGroup` varchar(255);--> statement-breakpoint
ALTER TABLE `tasks` ADD `promiseId` int;--> statement-breakpoint
CREATE INDEX `idx_tasks_customerGroup` ON `tasks` (`customerGroup`);
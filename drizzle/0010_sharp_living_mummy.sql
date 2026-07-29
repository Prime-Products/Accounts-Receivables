ALTER TABLE `group_watch_status` MODIFY COLUMN `status` enum('Auto','Problematic','On Watch','Normal','Critical','Legal','Resolved') NOT NULL DEFAULT 'Auto';--> statement-breakpoint
ALTER TABLE `forecast_entries` ADD `initialForecast` decimal(14,2) DEFAULT '0';--> statement-breakpoint
ALTER TABLE `group_watch_status` ADD `problematicSince` bigint;
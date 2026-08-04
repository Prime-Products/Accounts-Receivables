CREATE TABLE `custom_field_defs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` enum('group','customer','vessel','contact') NOT NULL,
	`fieldKey` varchar(64) NOT NULL,
	`label` varchar(128) NOT NULL,
	`fieldType` enum('text','longtext','number','date','select','checkbox','email','phone','url') NOT NULL DEFAULT 'text',
	`options` text,
	`helpText` varchar(255),
	`required` int NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	`archived` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_defs_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_custom_field_entity_key` UNIQUE(`entity`,`fieldKey`)
);
--> statement-breakpoint
CREATE TABLE `custom_field_values` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fieldId` int NOT NULL,
	`entity` enum('group','customer','vessel','contact') NOT NULL,
	`recordKey` varchar(255) NOT NULL,
	`value` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_field_values_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_custom_value_field_record` UNIQUE(`fieldId`,`recordKey`)
);
--> statement-breakpoint
CREATE TABLE `list_layouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`listKey` varchar(64) NOT NULL,
	`config` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `list_layouts_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_list_layout_user_list` UNIQUE(`userId`,`listKey`)
);
--> statement-breakpoint
CREATE TABLE `saved_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`entity` enum('group','customer','vessel','contact') NOT NULL,
	`name` varchar(128) NOT NULL,
	`config` text NOT NULL,
	`shared` int NOT NULL DEFAULT 0,
	`ownerId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `saved_views_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_custom_value_entity_record` ON `custom_field_values` (`entity`,`recordKey`);--> statement-breakpoint
CREATE INDEX `idx_saved_views_entity` ON `saved_views` (`entity`);
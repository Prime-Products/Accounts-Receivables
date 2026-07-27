ALTER TABLE `wire_transfers` ADD `isInternal` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `wire_transfers` ADD `sourceWireTransferId` int;--> statement-breakpoint
ALTER TABLE `wire_transfers` ADD `sourceAllocationId` int;--> statement-breakpoint
ALTER TABLE `wire_transfers` ADD `fromBranch` varchar(128);--> statement-breakpoint
ALTER TABLE `wire_transfers` ADD `toBranch` varchar(128);--> statement-breakpoint
CREATE INDEX `idx_wire_transfers_sourceWireTransferId` ON `wire_transfers` (`sourceWireTransferId`);
ALTER TABLE `credit_notes` ADD `softoneId` varchar(64);
ALTER TABLE `credit_notes` ADD CONSTRAINT `credit_notes_softoneId_unique` UNIQUE(`softoneId`);

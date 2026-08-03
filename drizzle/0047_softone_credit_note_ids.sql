-- MariaDB DDL auto-commits. IF NOT EXISTS makes this migration safe when an
-- earlier attempt applied only the column before failing on the index step.
ALTER TABLE `credit_notes` ADD COLUMN IF NOT EXISTS `softoneId` varchar(64);
CREATE UNIQUE INDEX IF NOT EXISTS `credit_notes_softoneId_unique`
  ON `credit_notes` (`softoneId`);

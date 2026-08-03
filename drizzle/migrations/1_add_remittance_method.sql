-- Remittances (formerly "wire transfers"): a customer can remit by bank wire,
-- cheque or credit card. Existing rows are bank wires, hence the default.
ALTER TABLE `wire_transfers`
  ADD COLUMN `method` enum('Wire transfer','Cheque','Credit card') NOT NULL DEFAULT 'Wire transfer' AFTER `branch`;

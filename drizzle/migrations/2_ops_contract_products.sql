-- Contracts card redesign: one contract = one product list + its own financials.
-- Applied manually via webdev_execute_sql because drizzle-kit generate cannot run
-- non-interactively in this project (it prompts about unrelated table renames).

-- Statuses: Draft/Sent/Terminated -> Offer/Active/Expired/Cancelled
ALTER TABLE `ops_contracts` MODIFY COLUMN `status` enum('Offer','Active','Expired','Cancelled') NOT NULL DEFAULT 'Offer';

-- Financials live on the contract: price agreed per vessel, split into installments
ALTER TABLE `ops_contracts` ADD COLUMN `pricePerVessel` decimal(12,2) NOT NULL DEFAULT '0';
ALTER TABLE `ops_contracts` ADD COLUMN `installmentCount` int NOT NULL DEFAULT 1;

-- One unified product list: natural natures instead of Service/Asset/Consumable
ALTER TABLE `ops_contract_library` MODIFY COLUMN `itemType` enum('Instrument','Cylinder','Ampoule','Service','Other') NOT NULL;
-- Products can be typed inline, no catalog entry required
ALTER TABLE `ops_contract_library` MODIFY COLUMN `catalogId` int NULL;
-- Per-unit pricing so the offer is produced from the contract itself
ALTER TABLE `ops_contract_library` ADD COLUMN `unitCost` decimal(12,2) NOT NULL DEFAULT '0';
ALTER TABLE `ops_contract_library` ADD COLUMN `sellingPrice` decimal(12,2) NOT NULL DEFAULT '0';

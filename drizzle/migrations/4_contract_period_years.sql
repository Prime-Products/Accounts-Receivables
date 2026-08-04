-- Contract period (Prime 247).
-- The agreement is sold as a 3, 4 or 5-year commitment, so the length is stored on the
-- contract instead of being inferred from the start/end dates. Existing rows are
-- back-filled from the span they already have, defaulting to 3 years.
ALTER TABLE ops_contracts
  ADD COLUMN contractPeriodYears int NOT NULL DEFAULT 3 AFTER paymentMethod;

UPDATE ops_contracts
SET contractPeriodYears = LEAST(5, GREATEST(1, ROUND((endDate - startDate) / 31557600000)))
WHERE endDate > startDate;


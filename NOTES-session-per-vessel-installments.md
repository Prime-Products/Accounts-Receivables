# Session note — per-vessel installments (4 Aug)

User rule: each vessel on a contract has its OWN installments, starting from that vessel's
shipment/activation date. Installments are never one shared set across the fleet.

## Implemented
- DB: `ops_vessel_assignments.shipmentDate` (bigint, nullable), `ops_payment_schedule.vesselId`
  (int, nullable for legacy rows). Columns are camelCase in MySQL — queries must quote them as
  `vesselId`, `contractId`, `shipmentDate`, NOT snake_case.
- `server/routers/operations.ts`: `generateVesselSchedule()` splits `pricePerVessel` (not the
  contract total) into `installmentCount` yearly steps from the vessel's shipmentDate.
  `syncVesselSchedule()` regenerates one vessel (skips vessels with non-Pending rows),
  `syncAllVesselSchedules()` does the fleet and clears legacy fleet-wide rows.
  `recalcContractTotal()` now only fixes totalValue, never touches installments.
- New procedure `opsContracts.setVesselShipment({ assignmentId, shipmentDate|null })` —
  records/clears the date, regenerates that vessel's schedule, logs vessel history (Shipment).
  Refuses if the vessel already has Invoiced/Paid rows.
- `opsContracts.get` labels each installment with `vesselName` and sorts by vessel + number.
- `removeVessel` deletes only that vessel's Pending installments.
- UI `OpsContractDetail.tsx`: Financials schedule is grouped per vessel with a header band
  (vessel name, shipment date, subtotal, paid), plus explicit rows for vessels not shipped yet.
  Vessels tab has a "Shipped / Activated" column with inline date editing ("Record shipment").

## Data migration done
- Deleted the 3 legacy fleet-wide Pending rows (30001-30003, 11300 each) on contract 1.
- Fixed contract 1 totalValue to pricePerVessel x fleet size = 16950 x 2 = 33900.
- Contract 1 (CO2-2026-SPRING-001) vessel assignments: id 1 -> vessel 5340001 CHA CHA CHA,
  id 30001 -> vessel 2430131 APPALOOSA. Neither has a shipmentDate yet, so no installments
  exist — expected: schedule shows both as "not shipped yet".

## Route note
Contract detail route is `/ops/contracts/:id` (plural), not `/ops/contract/:id`.

## Remaining
- Tests for per-vessel generation + UI grouping, then full suite, then checkpoint.

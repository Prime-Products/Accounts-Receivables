# Contracts card — simplification spec (user request, 4 Aug 2026)

User feedback: the current Operations module is confusing ("ειναι μπερδεμενο, να το
κανουμε απλο"). The contract is the single entry point; everything else hangs off it.

## Required flow

1. Open a contract (one place, one dialog).
2. Inside the contract, register **all products in ONE single list** — instruments
   (όργανα, serial + certificate), cylinders (μπουκάλες), ampoules (αμπούλες).
   No separate tabs/types visible to the user; the item just has a nature.
3. Pick the **customer** (one) and the **vessels** (5-10) covered by the contract.
4. **Financials**: the offer (προσφορά) is produced FROM the contract — not from a
   separate Quotations page (that page was already removed in an earlier session).
5. Contract **status vocabulary must be**: `Offer`, `Active`, `Expired`, `Cancelled`.

## Current DB state (before change)

- `ops_contracts.status` enum = Draft, Sent, Active, Expired, Terminated  → must become
  Offer, Active, Expired, Cancelled.
- `ops_contract_library` already holds the per-contract product list with
  `itemType` (Service | Asset | Consumable), `catalogId` (NOT NULL — blocks free-text
  entry), `quantity`, `quotaType` (Annual | ContractLife), `quotaLimit`.
- `ops_vessel_assignments` links vessels to a contract (already multi-vessel).
- `ops_payment_schedule` holds installments (Pending | Invoiced | Paid).
- All ops tables are EMPTY: 0 contracts, 0 assets, 0 catalog rows.

## Key blockers to fix

- `catalogId` is NOT NULL in the library, so a product cannot be typed directly into
  the contract; the user must pre-fill Catalog first. Make it nullable so items can be
  added inline (and optionally linked to a catalog entry later).
- Statuses must be renamed/remapped (Draft→Offer, Sent→Offer, Terminated→Cancelled).
- Pricing lives only on quotation items today; the library needs unit cost / selling
  price so the offer can be produced from the contract itself.

## Real contract reference (CHACHACHA / Spring Marine, CO2 2026)

- 247 Service Agreement, 3 years, signed with the MANAGEMENT COMPANY, vessels listed in Annex 1.
- 16,950 EUR per vessel, in 3 annual installments of 5,650 EUR, first installment 30 days credit.
- Activation is PER VESSEL, starting at the first equipment exchange — installments run
  from each vessel's activation date, not from contract start.
- Equipment per vessel mixes the three natures: instruments (e.g. 4x RIKEN KEIKI GX-3R,
  serial + certificate), cylinders (calibration gas), ampoules (CO2 calibration, annual quota).

## Implementation decisions (agreed approach)

Quotations page was already deleted from App.tsx / DashboardLayout in an earlier session,
but `opsQuotationsRouter`, `ops_quotations*` tables and `OpsQuotations.tsx` still exist.
The offer now lives ON the contract, so:

1. `ops_contract_library` becomes the single product list:
   - `catalogId` → nullable (type products inline, no Catalog pre-fill needed)
   - add `unitCost` and `sellingPrice` decimals (reuse the quotation pricing math:
     total = sum(price * qty); margin = (sell - cost) / sell * 100)
   - keep `quantity`, `quotaType`, `quotaLimit`, `notes`
   - `itemType` extended so a user sees natural natures instead of Service/Asset/Consumable:
     Instrument (serial + certificate), Cylinder, Ampoule, Service, Other
2. `ops_contracts.status`: Draft/Sent/Terminated → Offer/Active/Expired/Cancelled.
   Migration remap: Draft→Offer, Sent→Offer, Terminated→Cancelled.
3. Financials on the contract: pricePerVessel + installmentCount, contract total derived
   as pricePerVessel * vesselCount (CHACHACHA: 5,650 x 3 per vessel).
4. Payment-schedule generation stays as-is (annual installments from startDate).
5. `assignVessel` automation (auto-generating asset rows from library) must key off the new
   nature list: only `Instrument` rows generate serial-tracked assets.

## STATUS: IMPLEMENTED (4 Aug 2026)

- Schema migrated and applied to the live DB; SQL recorded in
  `drizzle/migrations/2_ops_contract_products.sql`.
  * `opsContractStatuses` = Offer | Active | Expired | Cancelled
  * `ops_contracts` gained `pricePerVessel`, `installmentCount`
  * `opsLibraryItemTypes` = Instrument | Cylinder | Ampoule | Service | Other
  * `opsSerialTrackedTypes` = ["Instrument"] only
  * `ops_contract_library` gained `unitCost`, `sellingPrice`; `catalogId` nullable
- Server: `generateSchedule()` + `recalcContractTotal()` helpers; total = pricePerVessel x
  max(vessels,1); new `removeVessel`, `updateLibraryItem`, `removeLibraryItem` procedures;
  schedule rebuilt only while every installment is still Pending; `get` returns
  `totals { costPerVessel, listPricePerVessel, margin }`.
- Contract detail page: 5 KPI cards, ONE Products table (nature badge, qty, cost, price,
  line total, quota) with per-vessel totals + margin row, Vessels card with searchable add /
  remove, Financials dialog, status actions Activate / Mark Expired / Cancel / Reactivate.
- Contracts list: New Contract dialog asks Price per Vessel with a live contract-value
  preview; status filter uses the new vocabulary; default 3 installments.
- Tests: `server/opsContractModel.test.ts` (16 tests). Full suite 850 passing, tsc clean.

Reference data: customer 607 = SPRING MARINE MANAGEMENT S.A., 608 = SPRING MARINE BULK S.A.
184 vessels in DB, none named "CHA CHA CHA" (vessel list is ERP-sourced, not user-editable).
`client/src/pages/ops/OpsQuotations.tsx` is orphaned (no route, absent from sidebar); its
`convertToContract` path still works and maps Asset→Instrument, Consumable→Ampoule, Offer status.

## SEEDED REAL DATA (4 Aug 2026) — CHACHACHA contract

- vessel id 5340001 = "CHA CHA CHA", customerId 607 (added manually, Annex 1 vessel)
- ops_contracts id 1 = `CO2-2026-SPRING-001`, status Active,
  title "SPRING MARINE MANAGEMENT | 1 VESSEL | GAS DETECTION & CALIBRATION | 2026",
  02 Jul 2026 → 01 Jul 2029, pricePerVessel 16,950, totalValue 16,950, installmentCount 3
- 17 products in ops_contract_library: 6 Instrument, 4 Other, 2 Cylinder (Annual quota),
  1 Ampoule (ContractLife quota 100), 4 Service (zero-priced, included in the fee)
  → per-vessel cost 7,733 / list price 12,248 (margin ~37%)
- 3 installments of 5,650 EUR: 01 Aug 2026 (first, 30 days credit), 02 Jul 2027, 02 Jul 2028

### Verified in the UI
Contracts list shows 1 contract, €16,950, 0/3 installments. Detail page renders the 5 KPI
cards, the single Products table with nature badges + per-vessel totals row, the CHA CHA CHA
vessel row, and the 3-installment schedule with Invoice buttons.

### KNOWN GAP found while seeding
Equipment page still shows 0 units: serial-tracked rows are only generated by the
`assignVessel` mutation, so a vessel attached at contract-creation time (`vesselIds` in
`create`) or seeded via SQL never triggers generation. Either `create` should reuse the same
automation, or the contract needs an explicit "Generate equipment for vessel" action.

# Session working notes — contract card restructure (4 Aug)

## User requests (verbatim intent)
1. Inside the Prime 247 contract card, the product list must be grouped by nature:
   Instruments first, then Cylinders, then Ampoules, then everything else.
2. Split the card into tabs. A Financials tab with the commercial data and the
   payment method; the payment schedule lives INSIDE the Financials tab.
3. Vessels must be their own tab, not stacked under the products.
4. Orders (Consumable Orders) is NOT needed in this app — orders will come from
   the ERP, which holds all orders. Remove it from the Prime 247 menu but keep
   the tables/procedures for a future ERP feed.

## Decisions / state
- Schema: `ops_contracts` gained `paymentMethod` (enum Bank Transfer / Cheque /
  Credit Card / Cash / Letter of Credit, default Bank Transfer),
  `paymentTermsDays` (int, default 30), `paymentNotes` (text). Enum constant
  `opsPaymentMethods` in `drizzle/schema.ts`. ALTER TABLE already applied to the
  live DB via webdev_execute_sql (drizzle-kit generate hangs in this sandbox —
  do not retry it, apply SQL manually and keep schema.ts in sync).
- Product natures already exist as `itemType`: Instrument, Cylinder, Ampoule,
  Service, Other (see `productTypes` in OpsContractDetail.tsx).
- Page to restructure: `client/src/pages/ops/OpsContractDetail.tsx` (~690 lines).
  Contains: header + status actions, 5 KPI cards, Products card, Vessels card,
  Payment Schedule card, and 3 dialogs (Add Vessel, Financials, Product).
- `data` from `trpc.opsContracts.get` = { contract, library, schedule,
  assignments, customer, totals }.
- Sidebar: `client/src/components/DashboardLayout.tsx` line ~97 area holds the
  Prime 247 entries; Orders entry must be removed there.

## Still open with the user
- Duplicate Contracts menu entries (CRM /contracts with 1 ALMI contract vs
  Prime 247 /ops/contracts). User has not answered yet; options offered were
  relabel / hide / merge / leave.

## Earlier this session (already delivered, checkpoint 59197425)
- Sidebar section renamed Prime 247, Ops Contracts -> Contracts, active-highlight
  bug fixed.
- Certificate expiry tracking: 60/15-day reminders, shared helper
  `shared/certificateExpiry.ts`, engine `server/lib/certificateReminders.ts`,
  cron endpoint `/api/scheduled/certificateReminders`, heartbeat task_uid
  a7nAk7XwbXvWnLzeGCD3cV (daily 06:00 UTC), stored in app_settings key
  `cron_certificate_reminders_task_uid`.

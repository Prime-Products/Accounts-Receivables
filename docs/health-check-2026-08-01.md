# AR Pro health check — 1 Aug 2026

Checked after the contact-collapse change (uncommitted at time of check).

## Clean

- TypeScript: no errors. LSP: no errors. Dependencies: OK. Dev server running.
- Browser console: 0 errors in the last 20 minutes. Earlier errors in the log
  (12:30 `monthEndLabel is not defined`, 12:42 `AssistantWidget` HMR failure) are
  stale — `monthEndLabel` is defined at Home.tsx:37 and AssistantWidget.tsx no
  longer exists.

## Pages verified rendering

Dashboard, Collections Desk (`/customers`), Address Book (all four tabs),
Invoices, Vessels, Contracts, Tasks, Wire Transfers, Reports, Team, Settings.
No error boundaries triggered, no blank screens.

## Real gaps found (data, not code)

| Area | Observation |
|---|---|
| Receipts | Paid this month EUR 0; Collections History all 12 months zero — no receipts recorded |
| Wire transfers | EUR 125,615 of EUR 138,094 unallocated across 4 of 5 transfers |
| DSO | 87 days, computed without receipts, so unreliable |
| Softone | Settings shows "Demo mode — SOFTONE_* secrets not set"; data is imported, not live-synced |
| Contracts | Only 1 contract in the system |

## Notes

- Contacts tab badge now 7,491 (unique people) vs 7,762 raw rows — expected, the
  list collapses a person repeated across a group's companies.
- Groups 3,135 / Companies 3,583 / Vessels 184.
- `/collections` is not a route; Collections Desk lives at `/customers`.
- Uncommitted at check time: contact collapse (server/routers/addressBook.ts,
  client/src/pages/AddressBook.tsx, server/contactCollapse.test.ts). Full test
  suite not run since that change; the 4 related suites pass (56 tests).

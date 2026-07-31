# Net Open Balance feature — state notes (30/7/2026)

## Feature (user: "προχωρά το 2") — DONE, needs checkpoint+delivery
- server/routers/ar.ts: `listOpenWireTransfers` rows now include `unallocatedEur` (via `toEur` from lib/arLogic).
- groupDetail `totals` now include `unallocatedPayments` and `netOpenBalance` (openBalance − unallocatedPayments).
- get360 returns `unallocatedPayments` (sum of unallocatedEur of openTransfers).
- GroupDetail.tsx + CustomerDetail.tsx Open Balance KPI: show NET value, plus emerald breakdown line "X inv − Y on acct" only when unallocatedPayments > 0.005.
- Test: server/netOpenBalance.test.ts (2 tests, pass; uses testFixtures fx.id + createWireTransferAllocation with invoiceId).
- Full suite: 42 files / 235 tests ALL PASS. tsc clean.
- Screenshots verified: /groups/CHANDRIS shows "€141,380 inv − €23,286 on acct" → Open Balance €118,094; /customers/96 shows €100,822 − €23,286 → €77,536. Both correct.

## Post-suite data checks
- fixture_customers=0, pending_promises=0 → test isolation OK.
- open_tasks=0: user cancelled ALL his open tasks himself earlier today at 11:46 (verified in audit before) + latest tasks show Cancelled (user actions + old test artifacts already cancelled). NOT test pollution — do not "restore".
  - Wait: earlier there were 3 open tasks (MSC 5310001 etc.). Recent list shows MSC follow-up 5790001 Cancelled (customerId 393 = fixture? no, 393 real?). User has been actively using the app (created MSC call → task 5790001, then cancelled?). Treat current state as user-driven; do NOT modify.
- orphan_transfers=39: OLD test artifacts from allocation tests ("Alloc Sister Test", isInternal=1, customerIds ~2.7M deleted fixture customers). They are invisible in UI (listOpenWireTransfers filters isInternal; group pages resolve by real customer ids). Harmless but could be cleaned. Optional cleanup: DELETE FROM wire_transfers WHERE customerId NOT IN (SELECT id FROM customers) AND notes LIKE '%Alloc%Test%'.

## Remaining steps
1. Optionally clean the 39 orphan internal transfers (test artifacts).
2. todo.md: mark net-balance items [x].
3. webdev_save_checkpoint + git push github main + deliver result message (Greek).

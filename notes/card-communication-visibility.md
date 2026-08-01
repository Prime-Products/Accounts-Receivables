# Where the communication flow sits on the card today (observed 2026-08-02)

Screenshot of `/groups/MSC SHIPMANAGEMENT LTD` (Receivables tab), top to bottom:

1. Header: back link, group name, rating `C · 62`, `Problem` badge, `Not Contacted`
   badge (with phone icon), manager `Faye Vanou`, collector `Kostas Vanos`
2. Action row: **Log Call** (green), Actions, AI Summary, SOA (PDF), SOA (Excel),
   company/branch/status filters
3. Tab bar: Receivables | Details
4. 6 KPI cards (Open Balance, Overdue, Forecast, Paid, Remain, Turnover)
5. Yellow hint strip: "Add collection notes — call preferences & particularities"
6. Aging (current scope) — 6 buckets
7. Transactions (Whole group) — the dominant block, 760 invoices
8. **Activity Log** — "No activities recorded yet" (very far down the page)
9. **Group activity** — separate card with tabs: Payment History (0),
   Contracts (0), Tasks (0), Emails (5)

## Problems for the "who did we talk to / what was said" flow
- The communication history (**Activity Log**) is at the very bottom, below a
  760-row invoice table. Requires long scrolling; effectively invisible.
- There are TWO history blocks (Activity Log + Group activity tabs) that split
  the same story: calls/notes in one, emails/tasks in the other.
- Nothing near the top answers "when did we last speak and what was said".
  The header only shows the status badge (`Not Contacted`).
- Notes are `line-clamp-2` in ActivityLog.tsx (line 91) → long notes silently cut.
- The Details tab has NO activity/communication at all.
- Company card (`/customers/:id`) has no activity timeline at all.

## Component facts
- `client/src/components/ActivityLog.tsx` — used ONLY by GroupDetail.tsx:1139.
  Props: `activities: ActivityLogType[]`. Card with `max-h-96 overflow-y-auto`,
  icon+title+description rows, type badge, date/time. `line-clamp-2` on desc.
- Activity types configured: note, task, promise, email, call, status_change.

## Code landmarks for the rebuild (verified 2026-08-02)

### GroupDetail.tsx
- L690-691: top tabs `receivables` / `details`
- L698: `<TabsContent value="receivables" className="mt-4 space-y-4">`
- L711-822: 6 KPI cards grid
- L824-825: `<CollectionNotesBox group={group} />` (collection notes hint strip)
- L827+: Aging card (`Aging (current scope)`, title at L830)
- L867: `{filteredTotals.count} invoice(s) shown`
- L923: `Transactions ({scopeLabel})` card title
- L1126-1132: `<InvoicesTable ... maxHeight="480px" />`
- L1138-1139: `{data?.activityLogs && <ActivityLog activities={data.activityLogs} />}`
- L1142: `<GroupActivityTabs group={group} />`
- L1159-1176: `GroupActivityTabs` — `trpc.customers.groupActivity.useQuery({group})`,
  tabs receipts / contracts / tasks / emails

**Insertion point for the unified timeline: right after L825 (CollectionNotesBox),
before the Aging card** — i.e. above Aging + Transactions, below the KPIs.

### Server data available
- `customers.groupDetail` returns `activityLogs` — `db.listActivityLog(group, 200)`
  (ar.ts:1532, exposed at ar.ts:1632)
- `customers.groupActivity` (ar.ts:1647-1677) returns:
  * `receipts[]` — filtered by member ids, sorted by `receiptDate` desc, max 300, `+customerName`
  * `contracts[]` — `+customerName`
  * `tasks[]` — sorted by `dueDate` desc, max 300, `+customerName`
  * `emails[]` — from `db.listEmailHistory(customerId, 300)`, sorted by `createdAt` desc, max 300, `+customerName`
- `customers.groupPromises` (ar.ts:1636) — all promises for member companies, `+customerName`
- `customers.groupNotes` (ar.ts:1679) — group notes with `authorName`

### Status/cycle helpers to surface (see notes/monthly-cycle.md)
- `effectiveConfirmation(row)` → `{ status, amount, stale, carriedOver }` (ar.ts:160)
- `isTaskOverdue(task)` (ar.ts:152) → red badge

## DONE so far (2026-08-02)
1. `server/db.ts` → added `listActivityLogWithAuthors(groupName, limit)`.
2. `server/routers/ar.ts:1532` now calls it, so `activityLogs[]` carries `authorName`.
3. NEW `client/src/components/CommunicationTimeline.tsx` — one card, grouped by
   calendar month (current cycle expanded, earlier months collapsed), type filter
   pills (call/note/promise/email/task/status/payment), note search box, and
   "Show more" expansion for bodies over 180 chars. Exports `TimelineEntry`.
4. NEW `client/src/lib/timeline.ts` — `buildTimeline(sources)` merges
   activityLogs + groupNotes + emails + tasks + receipts, drops zero timestamps,
   de-duplicates on `kind|minute|title.slice(0,60)`.
   Verified column names: email_history has `subject/body/status/sentAt/createdAt`
   (no sentBy name); receipts have `receiptNumber/receiptDate/amount/method`;
   tasks have no assignee name in this payload.

## Group header already has (GroupDetail.tsx:579-595)
- `GroupConfirmationBadge` (clickable status, opens Log Call) — L579-587
- `confirmationCarriedOver` → "↻ Carried over" amber hint — L588-595 (ALREADY SHOWN)
  So the carried-over marker exists on the group card header; still missing on the
  Collections Desk list and the company card.

## REMAINING edits
## Edits completed (2026-08-02)
- [x] GroupDetail: `<CommunicationTimeline>` inserted right after
      `<CollectionNotesBox group={group} />`, above the Aging card. Page-level
      `groupActivity` + `groupNotes` queries feed `buildTimeline`, and the card
      header carries a `TimelineLogCallButton` (routes through LogCallLauncher so
      an active case offers its task instead of a parallel one).
- [x] Old `<ActivityLog>` removed; `client/src/components/ActivityLog.tsx` deleted
      (no remaining references).
- [x] "Last contact" line under the group title (`LastContactLine`), fed by new
      `groupDetail` fields `lastCallAt / lastCallBy / lastCallOutcome /
      lastCallNote / callCount / noAnswerCount` (from `db.callSummaryByGroup()`).
      Reads "Never contacted" in amber when nothing has been logged.
- [x] CustomerDetail: same timeline above the Aging card. Calls are logged per
      group, so the company card shows the group's history plus this company's own
      tasks and receipts; title reads "Communication — <group> (group)".
- [x] Collections Desk carried-over marker: ALREADY present (Customers.tsx
      L1016-1021, "↻ Carried over" under the badge). No change needed.

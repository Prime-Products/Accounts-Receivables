# Sidebar rework + certificate expiry (user request 4 Aug 2026)

## User request (verbatim intent)
1. Add certificate expiry date on equipment, with reminders at 60 and 15 days.
2. "menus sidebar at operations doesn't work very well" — fix it.
3. Rename sidebar section "Operations" → **Prime 247**.
4. Rename "Ops Contracts" → **Contracts**.

## Sidebar structure found (client/src/components/DashboardLayout.tsx, navSections ~line 69)
- (no label): Dashboard `/`
- Collections: Collections Desk `/customers`, Invoices `/invoices`, Remittances `/remittances`, Tasks `/tasks`
- CRM: Address Book `/address-book`, Vessels `/vessels`, Contracts `/contracts`
- Operations: Ops Dashboard `/ops`, Ops Contracts `/ops/contracts`, Equipment `/ops/assets`,
  Certificates `/ops/certificates`, Orders `/ops/orders`, Returns `/ops/returns`, Catalog `/ops/catalog`
- Management: Reports `/reports`, Team `/team`, Settings `/settings`

## ROOT CAUSE of "doesn't work very well"
Active/section matching uses `path.startsWith(item.path)` (lines ~135 and ~362):
- `/ops` is a prefix of EVERY ops route, so "Ops Dashboard" highlights as active on
  `/ops/contracts`, `/ops/assets`, etc. — two items look active at once.
- `sectionOfPath` returns the FIRST matching section: `/contracts` matches CRM Contracts, but
  `/ops/contracts` also starts with... (no) — however CRM `/contracts` vs ops `/ops/contracts`
  are distinct. The real collision is `/ops` prefix within the Operations section.
- Consequence: the section holding the current page cannot be collapsed (`holdsCurrentPage`
  forces open), so while browsing any ops page the Operations section is stuck open AND
  Ops Dashboard is permanently highlighted → feels broken.

Fix: exact match for index routes; prefix match only with a following `/` boundary.

## Duplicate Contracts concern
There are TWO contract features: CRM `contracts` table (1 row, legacy page
`client/src/pages/Contracts.tsx`, 685 lines, "Service agreements with annual installment
schedules") and the rebuilt ops `ops_contracts` (1 row = CO2-2026-SPRING-001).
After renaming "Ops Contracts" → "Contracts" there will be two identical labels in the
sidebar (CRM + Prime 247). Must be raised with the user — the CRM one is likely obsolete.

## Certificate tables (already exist, 0 rows)
`ops_certificates` — hangs off an asset/equipment row, has an expiry date; Ops Dashboard
already surfaces "expired certificates". Contract text requires an automated reminder
2 months (60 days) before expiry; user now also wants 15 days.

## SECOND BUG (found in screenshots after the rename) — section headers overlap items
The section header is `SidebarGroupLabel` with `className="px-2 pt-3"`. shadcn's
SidebarGroupLabel is `h-8` with NO bottom margin and the group has `py-0`, so the header
sits ON TOP of the first menu row. Visible in every screenshot:
- "CRM" label overlaps the "Tasks" row (reads "CRM"+"Tasks" on the same line)
- "PRIME 247" label overlaps the "Contracts" row
- "MANAGEMENT" label overlaps the "Catalog" row
This is the main reason the user says the sidebar "doesn't work very well" — the section
headers are unreadable and unclickable where they overlap.
Fix: give the group vertical rhythm (label gets its own block with margin-bottom, group
gets padding) instead of `pt-3` on an absolutely-sized label inside a `py-0` group.

### Attempts and the ACTUAL cause
1. Added `mt-3` to group + `mb-1 h-auto` to label → no change.
2. Replaced `SidebarGroupLabel asChild` with a plain `<div className="mb-1 px-2 ...">`
   (removed the shadcn label component entirely) → STILL overlapping identically.
Because the overlap survives removal of SidebarGroupLabel, the header markup is NOT the
cause. What remains: the SECTION ITEMS are absolutely/negatively offset, i.e. the
collapsible wrapper around `SidebarGroupContent`/`SidebarMenu` overlays the header.
In DashboardLayout the items live in a `div id={`nav-section-${label}`}` whose collapse is
animated with `grid-template-rows` or `max-h`+`-mt`. NEXT: read the collapsible wrapper
JSX right after the header block (approx lines 360-400) and look for negative margin /
absolute positioning / `h-0 overflow-hidden` combined with a transform.

3. Restored group padding (`SidebarContent gap-1 py-1`, group `px-0 pt-2 pb-0`) → the
   overlap MOVED slightly (labels shifted a few px) but headers still collide with the
   row above. So it is a spacing-only symptom that padding cannot cure.

### SOLVED — root cause was flex compression, not the label component
`SidebarContent` is `flex min-h-0 flex-1 flex-col overflow-auto`. With 20 nav items across
4 sections the content is TALLER than the viewport, and because every child defaulted to
`flex-shrink: 1`, flexbox compressed each group below its natural height instead of letting
`overflow-auto` scroll. The `h-10` buttons kept their height, so the squeeze landed on the
section header rows — which then rendered on top of the row above.
Note `client/src/index.css` overrides `.flex { min-height: 0 }` globally, which removes the
automatic min-content floor that would normally prevent this.
FIX: `shrink-0` on the `SidebarGroup`, on the header `div`, and on the `SidebarMenu`.
Verified in screenshots: all four headers (COLLECTIONS, CRM, PRIME 247, MANAGEMENT) now sit
on their own rows, and the sidebar scrolls instead of compressing.

### Superseded note (kept for history): screenshots may be lying
`webdev_take_screenshot` forces every below-full-opacity in-flow element to full opacity
and freezes transitions at one frame. The section headers are `text-muted-foreground/70`
and the collapsible sections animate. It is plausible the "overlap" is a screenshot
artifact of the capture snapping mid-transition, and that the live sidebar is fine.
The tell: the labels look VERTICALLY CENTERED on the row above, exactly what you would
see if a `-mt-8` icon-mode rule were applied for one frame during capture.
MUST verify in the real browser (needs auth) before spending more effort. Ask the user.

### Current committed state of the sidebar work (independent of the overlap question)
DONE and verified working in screenshots:
- Section renamed "Operations" → "PRIME 247"; item "Ops Contracts" → "Contracts";
  "Ops Dashboard" → "Overview".
- Page headers: "Prime 247 Overview" (OpsDashboard), "Prime 247 Contracts"
  (OpsContractsList), Reports section "Prime 247 Overview".
- `matchesNavPath()` exported from DashboardLayout.tsx fixes the real navigation bug:
  `/ops` no longer highlights on `/ops/contracts` (only ONE item is active now — visible
  in the screenshots, "Contracts" highlighted alone on /ops/contracts, "Overview" alone
  on /ops). Index routes get exact match; deeper paths match on a "/" boundary.
- shadcn `SidebarGroupLabel` replaced by a plain `<div>` (import removed).
## Certificate reminders — implementation plan (phase 2)

### What already exists
- `ops_certificates` table: assetId, certificateNumber, issueDate, expiryDate (bigint ms), fileUrl, notes.
  Index on expiryDate. Full CRUD in `server/opsDb.ts` + `opsCertificatesRouter` (list/create/update/delete).
- `/ops/certificates` page: read-only table, colour urgency at <=0 / <=30 / <=60 days. NO create dialog.
- Ops dashboard already computes `expiringCerts30`, `expiringCerts60`, `expiredCerts`.

### Gaps to close
1. No way to ADD a certificate from the UI at all (only via SQL) — needs a New Certificate dialog
   on `/ops/certificates`, and a certificate expiry field inside the New Equipment dialog so the
   cert is captured at the same moment the serial number is typed in.
2. Reminder thresholds are 30/60 in code, but the CHACHACHA contract requires **60 and 15 days**.
   Needs a shared helper (single source of truth) used by page colours, dashboard KPIs and the job.
3. No actual reminder delivery — needs a task/notification when a cert crosses 60 or 15 days.

### Heartbeat facts (from webdev-periodic-updates skill)
- NEVER use setInterval/node-cron. Cloud Run kills idle instances.
- Callback path MUST start with `/api/scheduled/`. Mount explicitly in `server/_core/index.ts`
  BEFORE the Vite/static fallthrough (not auto-registered).
- Cron is 6-field UTC with seconds: `0 0 6 * * *` = daily 06:00 UTC.
- Project-level job (no end-user) is created from the sandbox CLI:
  `manus-heartbeat create --name cert-expiry-reminders --cron "0 0 6 * * *" --path /api/scheduled/certReminders`
- Handler must authenticate with `sdk.authenticateRequest(req)` and check `user.isCron && user.taskUid`.
- Handler must be IDEMPOTENT (platform retries 5xx/429 up to 3 times). Timeout 2 min.
- Site must be DEPLOYED before the cron can be created — bizserver posts to the production URL.
  Workflow: save checkpoint (auto-publishes here) → then create the cron.
- `server/_core/heartbeat.ts` already exists → no bootstrap-legacy-project needed.

### Decision
Reminders are surfaced as rows in the existing AR task system (the user already lives in Tasks),
not as email. Deterministic dedupe key per (certificateId, threshold) so re-runs cannot duplicate.

## Implementation state (certificate reminders)

Applied so far:
- `shared/certificateExpiry.ts` — single source of truth: `CERT_REMINDER_DAYS = [60, 15]`,
  `daysUntilExpiry`, `certUrgency` (expired/final/warning/ok), `reachedReminderThreshold`,
  `certUrgencyClass`.
- `server/lib/certificateReminders.ts` — `runCertificateReminders(now)`; dedupe marker
  `(Cert #<id> @<threshold>d)` parsed from `task.description`; skips certs whose equipment
  has no contract (no customer to file against).
- `tasks.type` enum gained `Certificate Expiry` (live DB altered + `drizzle/schema.ts`
  + `drizzle/migrations/3_certificate_expiry_task_type.sql`).
- `opsCertificates.list` now returns `daysLeft` + `urgency`; new
  `opsCertificates.runReminders` mutation.
- `opsAssets.list` returns `certificateNumber/Expiry/DaysLeft/Urgency` (latest cert per item).
- `opsAssets.create` accepts optional `certificateNumber` / `certificateIssueDate` /
  `certificateExpiryDate` and writes the certificate row.
- Dashboard summary: `expiringCerts30` REPLACED by `expiringCerts15` (60/15 windows).

Remaining:
- `client/src/pages/ops/OpsDashboard.tsx` still reads `expiringCerts30` (4 TS errors).
- Certificate fields in the New Equipment dialog UI.
- New/Edit Certificate dialog on `/ops/certificates` + urgency colours + Run reminders button.
- Heartbeat daily schedule calling the reminder engine.
- Tests.

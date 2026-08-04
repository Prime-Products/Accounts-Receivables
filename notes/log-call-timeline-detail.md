# Log Call timeline entry — reported issue (2 Aug 2026)

User (Kostas) set the CLIPPER GOUMAS group to **Pending Follow-up** from Log Call.
The Communication timeline showed only:

> Call logged — Reached
> Aug 2 · 03:46 AM · Kostas Vanos

No company, no contact, no status, no amount, no date, no note.

## Findings
- `LogCallDialog.handleSubmit` sends `contactId` when a saved contact is picked
  from the list; the `calls.logCall` input has **no `contactId` field**, so the
  contact silently disappears (only the manual "other" path sets `contactName`).
- The entry the user saw was written before the "single entry" change (title
  `Call logged — Reached`), so it predates the outcome label — but the missing
  company/contact/amount/note is a real gap regardless.
- Timeline UI (`client/src/components/CommunicationTimeline.tsx`) renders
  `title`, `body` (= activity_log.description), author and optional company.

## Required
Single timeline entry per call carrying: company name, contact, collection
status, amount, promised/follow-up date, and the free-text note.

# Log Call dialog — compact layout notes

## Problem reported
- Dialog was too tall: user had to scroll to reach Save.
- Selecting **Pending Follow-up** / **Promise to Pay** added fields and pushed the Log Call button out of view.

## Fix applied (client/src/components/LogCallDialog.tsx)
- `DialogContent`: `sm:max-w-3xl max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden`.
- Header `shrink-0 border-b px-5 py-3`; body `flex-1 overflow-y-auto`; footer `shrink-0 border-t bg-muted/30`.
  Only the body scrolls, so Cancel / Log Call are always visible in every response state.
- Fields moved to a 2-column grid (Company / Contact person / Outcome / Customer Response),
  and the expanded response panels use a 3-column grid (amount / date / assignee).
- Broken state: reason textarea merged with the shared notes field (no duplicate Textarea bound to `notes`).

## Verification helpers added
- `GroupDetail.tsx`: `?logCall=1` opens the Log Call dialog directly.
- `LogCallDialog.tsx`: `?response=Confirmed|Pending Follow-up|Broken` preselects the customer response.
- `LogCallLauncher.tsx`: when `?response=` is present the "active communication" pre-step is skipped.

## Verified screenshots (1280x720 viewport)
- Default state: whole form + footer visible, no scrolling.
- `?response=Pending Follow-up`: open-follow-up banner + 3 fields + notes + footer all visible.
- `?response=Confirmed`: open-promise banner + reschedule radios + 3 fields + notes + footer all visible.

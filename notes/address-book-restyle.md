# Address Book visual alignment — observed differences (1 Aug)

Compared `/address-book` against `/customers` (Collections Desk), `/invoices`,
`/tasks`, `/vessels`, `/contracts`, `/wire-transfers` at 1280x720.

## What the rest of the app does

- Page header: icon + bold title on one line, muted subtitle underneath, primary
  action button top-right (`New Task`, `New Contract`, `Record Receipt`,
  `Forecast (already run)`).
- Segmented switcher (Collections Desk): compact pills, icon + label, active pill
  on `bg-background`, count as plain muted text next to the label.
- Filter row: search input first, then `Select` dropdowns, all on the same line,
  **no surrounding card** — the controls sit directly on the page background.
- Summary strip: single muted rounded bar, `N invoice(s) shown` + totals, actions
  right-aligned inside the same bar.
- Table: wrapped in a `Card`, muted header, hover rows, sortable arrows.

## What the Address Book does differently

1. Entity switcher is visually heavier: taller pills, count rendered as a sky
   badge (`bg-sky-100 text-sky-700`) — nothing else in the app uses count badges
   inside tabs.
2. Toolbar is wrapped in its own `rounded-lg border bg-card p-3` panel and spills
   over three rows (search + group filter / Data quality + Fields + Columns +
   Export / Filters), plus a fourth "Save current view" row. No other page boxes
   its filters.
3. Summary strip has its own look and sits outside that panel, so the page shows
   three stacked containers before the table.
4. Row links are sky-blue (`text-sky-700`) while the rest of the app uses the
   default foreground with the accent reserved for amounts/actions. Vessels page
   also uses sky links, so keep links but align the weight.
5. Loading state is a bare centred "Loading..." string; other pages render the
   table shell/skeleton.

## Plan

- Keep functionality identical; only restyle: header, switcher, toolbar layout,
  summary strip, loading state.
- Reuse the Collections Desk switcher markup and the Invoices summary strip
  classes so future pages inherit one pattern.
- Update `server/addressBookStyling.test.ts` to assert the new shared contract.

## Round 1 result (after removing the toolbar panel)

Header, switcher and search now read the same as the Collections Desk. Remaining
problems visible at 1280px:

1. The group `Select` wraps onto its own second line because the switcher + search
   already fill the first row. Collections Desk keeps search narrower so selects
   stay on the same line — give the search a `sm:max-w-72` instead of `flex-1`.
2. Four stacked rows before the table (filters / tools / Filters button / Save
   current view). Merge the `Filters` (FieldFilterBar) and `Save current view`
   (SavedViewsBar) controls into the tools row so the page has: header → filter
   row → tools row → summary strip → table, i.e. the Invoices rhythm.
3. Row links stay sky-blue, consistent with the Vessels page — keep.

## Round 2 result

Layout now reads: header (title + contacts actions on the same line) → switcher +
search + group select → filter selects → tools row (Filters / Data quality /
Fields / Save current view, Columns + Export right-aligned) → summary strip →
table card. This matches Invoices/Collections Desk rhythm on all four tabs.

Other changes:
- Tab counts render as plain muted mono numbers (was a sky pill).
- Title icon uses the default foreground (was sky-600) like every other page icon.
- Subtitle shortened to one line so it never pushes the action buttons down.
- Route-level `PageFallback` in `App.tsx` now renders a title + filter + table
  skeleton instead of the bare "Loading…" text (benefits every lazy page).

Remaining nit: on the group/vessel tabs the group select sits on the second line
because the switcher is wide; acceptable since Collections Desk wraps the same
way at this width.

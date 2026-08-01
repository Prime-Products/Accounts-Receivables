# Address Book — implementation notes (working file)

## Agreed scope
- Contacts menu entry becomes "Address Book" with 4 tabs: Groups, Customers, Vessels, Contacts.
- The collections screen stays separate and is now named **Collections Desk** (`/customers`).
- Phases: 1) shell + tabs + cross-entity search + column visibility, 2) record cards, 3) custom fields, 4) filters/saved views/export, 5) data quality/import.

## Data counts (01/08/2026)
customers ~2500 (`customers`), groups 474 (distinct `customerGroup`), vessels 184 (`vessels`), contacts 7762 (`payment_contacts`).

## Existing pieces to reuse
- `client/src/components/ResizableTable.tsx` → `useResizableColumns(key, defaults)`, `ColResizer`.
- `client/src/components/ui/table.tsx` → `Table` now accepts `containerClassName` / `containerStyle`; the container is the scroller, so `TableHeader` with `sticky top-0` pins.
- `InvoicesTable` has `maxHeight` prop; sticky header pattern lives there.
- Exports: `server/lib/exports.ts` → `buildExcel(spec)`, `buildPdf(spec)` with `TableSpec`; used by `reports.export` (`server/routers/ar.ts` ~line 4378).
- Routers all live in `server/routers/ar.ts` (5332 lines) and are registered in `server/routers.ts`.
- Vessel modal already exists: `client/src/components/VesselDetailDialog.tsx`.
- Contacts page today: `client/src/pages/Contacts.tsx` (492 lines), uses `trpc.paymentContacts.listAll`.

## New tables (migration 0039, applied)
- `custom_field_defs` (entity, fieldKey, label, fieldType, options JSON, helpText, required, sortOrder, archived)
- `custom_field_values` (fieldId, entity, recordKey, value) — recordKey = numeric id as text, or group name for groups
- `saved_views` (entity, name, config JSON, shared, ownerId)
- `list_layouts` (userId, listKey, config JSON {hidden, order})

Schema enums: `addressBookEntities = ["group","customer","vessel","contact"]`, `customFieldTypes = ["text","longtext","number","date","select","checkbox","email","phone","url"]`.

## Design system reminders (ar-pro-design-system skill)
- Semantic colors only; status badge colors: Confirmed/green, Broken/red, Pending/amber, Kept/blue.
- Amounts right-aligned monospace, dates dd/mm/yyyy centered, Actions right-aligned icon buttons.
- Lists load first 100 rows with a "Show all" button.
- Vessels are ERP/invoice-derived — vessel core data is not user-editable.
- Company name shown on the right, group name above it.

## Backend built (phase 3/4)
`server/routers/addressBook.ts` registered as `addressBook` in `server/routers.ts`:
`counts`, `groups`, `customers`, `vessels`, `contacts` (each row carries `recordKey` + `custom` map),
`search` (cross-entity), `fields` / `createField` / `updateField` / `archiveField` / `setFieldValue` / `recordFields`,
`views` / `saveView` / `deleteView`, `layout` / `saveLayout`, and `export` (xlsx/pdf/csv from client-sent columns+rows).

DB helpers added at the end of `server/db.ts`: `listCustomFieldDefs`, `getCustomFieldDef`, `createCustomFieldDef`,
`updateCustomFieldDef`, `archiveCustomFieldDef`, `listCustomFieldValues`, `setCustomFieldValue`,
`listSavedViews`, `getSavedView`, `createSavedView`, `updateSavedView`, `deleteSavedView`, `getListLayout`, `setListLayout`.

## Frontend components built
- `client/src/components/AddressBookTable.tsx` — generic list: `ColumnDef<Row>` (`key,label,width,value,render,align,sortable,readOnly`), `SortState`, `compareValues`, sticky header via `containerClassName/containerStyle`, first 100 rows + "Show 200 more"/"Show all".
- `client/src/components/AddressBookToolbar.tsx` — `ColumnPicker` (visibility + up/down order, Reset) and `ExportMenu` (xlsx/csv/pdf via `addressBook.export`).
- `client/src/components/SavedViewsBar.tsx` — `SavedViewsBar` chips + save dialog with shared toggle.
- `client/src/components/CustomFieldsManager.tsx` — `CustomFieldsManager` (Fields button/dialog: add + archive).
- `client/src/components/CustomFieldsBlock.tsx` — `CustomFieldsBlock` for record cards, saves on blur.

## Page + wiring (done)
- `client/src/pages/AddressBook.tsx` — 4 tabs, search, group filter + tab-specific second filter (position/type/tier),
  Fields / Columns / Export toolbar, SavedViewsBar, sticky table, row click → record dialog.
- `client/src/components/AddressBookRecordDialog.tsx` — one card for all entities; identity + related (companies/vessels/contacts) + custom fields;
  re-opens on related records via the `address-book:open` window event.
- `client/src/components/ContactFormDialog.tsx` — extracted from the old Contacts page, `onSaved` callback added.
- Route `/address-book` (legacy `/contacts` points to the same page), menu item renamed to "Address Book"; `client/src/pages/Contacts.tsx` deleted.

Live counts observed: 3,078 groups / 3,526 companies / 184 vessels / 7,762 contacts.

## Phase 5 (filters / card visibility / quality / archive) — built
- `client/src/components/AddressBookFilters.tsx` — `FieldFilter{key,op,value}`, ops contains/equals/gt/lt/empty/notEmpty,
  `applyFieldFilters(rows, filters, columns)`, `opNeedsValue(op)`, `FieldFilterBar`. Filters persist inside saved views (`config.filters`).
- Card field visibility: per-user layout under listKey `address-book-card-<entity>`; `recordFields` filters hidden fieldKeys.
  Toggle lives in `CustomFieldsManager`.
- Migration 0040 applied: `payment_contacts.archived` (int default 0), `archivedAt` (timestamp), `mergedIntoId` (int).
  DB helpers `archivePaymentContact(id, mergedIntoId?)`, `restorePaymentContact(id)` (both use `requireDb`).
- Router additions: `quality` (duplicate emails, duplicate name-in-company, invalid emails, missing phone,
  orphan contacts, companies without contact, vessels without IMO, vessels without owner, plus totals),
  `archiveContact`, `restoreContact`, `mergeContacts({survivorId, loserIds, fields})` — merge copies missing
  custom values from losers and archives them with `mergedIntoId`.
  `contacts` now takes `{archived?: boolean}` (defaults to live only); `search` skips archived.
- `client/src/components/DataQualityPanel.tsx` (dialog, expandable sections, Merge buttons) and
  `client/src/components/MergeContactsDialog.tsx` (survivor radio + per-field value picking).
- Contacts tab: checkbox select column → "Merge selected" bar, Archive button toggles the archive view,
  per-row Archive / Restore actions.
- Tests: `server/addressBookFilters.test.ts`.

## Phase 6 (Excel import) — built
- Router: `importInspect` (headers + 5-row sample + rowCount), `importPreview` (plan only, no writes),
  `importApply({fileBase64, mapping, skipRowIndexes})`. Helpers `parseSheet` (exceljs, first sheet, first
  non-empty row = header, values coerced to trimmed strings) and `planContactImport`.
- Matching rule: existing live contact with the same email → update (only real differences are listed as
  `changes`, otherwise "Already up to date"); no email match + resolvable company (code, then name) → create;
  unresolvable company or empty name+email → skip with a reason.
- `client/src/components/ImportContactsDialog.tsx` — 3 steps (file → map columns → review plan), header
  auto-guessing by regex, custom-field targets included, per-row checkbox to exclude rows, only `.xlsx`.
- Active tab now lives in the URL: `/address-book?tab=group|customer|vessel|contact`.
- Tests: `server/addressBookQuality.test.ts` (19) covering quality checks, archive, merge and import contract.

Verified counts in UI: Groups 3,085 / Companies 3,533 / Vessels 184 / Contacts 7,762.

## Record card sizing (user report 1 Aug: "το παράθυρο του group είναι μικρό")
- `AddressBookRecordDialog` now uses the shared `ResizableDialogContent` (storageKey `address-book-record`,
  default ~1100x760 capped to 92%/88% of the viewport, min 520x360). Header is a fixed bar, body scrolls,
  related lists grew from `max-h-40` to `max-h-64` and no longer truncate to the first 12 items.
- Deep link: `/address-book?tab=<entity>&record=<recordKey>` opens a card directly.

Still to do: full suite + checkpoint + GitHub push.

## Vessels page vs Address Book vessels tab (user question, 1 Aug)
Decision: keep the standalone `/vessels` page — it is the AR view (`vessels.listWithStats` in
`server/routers/ar.ts:2578`: invoiceCount, openBalance, overdueAmount, overdueCount, maxDaysOverdue),
while the Address Book vessels tab is the identity/directory view (imo, vesselType, flag, ownerName,
ownerGroup + custom fields). Contacts as a separate menu entry is already gone.
Link them instead of duplicating: the Address Book vessel card gets AR figures + a button that opens
`VesselDetailDialog` (props: vesselId, open, onOpenChange).

## Restyle plan (match AR Pro look, cf. /customers, /invoices, /vessels screenshots)
- Page header: icon + 2xl bold title + muted subtitle (same as Vessels/Invoices).
- Summary strip: bordered `bg-muted/30` row with counts (like the Vessels totals strip).
- Entity tabs: segmented control styled like the Collections Desk Groups/Companies switch.
- Toolbar: search + selects on one row, action buttons on a second row, all inside the card region.
- Table wrapped in `<Card><CardContent className="p-0">` like every other list page.

### Restyle done (1 Aug)
- `client/src/pages/AddressBook.tsx`: sky-600 header icon; segmented TabsList (`bg-muted/60 p-1`,
  active `bg-background shadow-sm`, count pill sky-100/sky-700); toolbar in one `rounded-lg border bg-card p-3`
  panel (filters row / tools row / FieldFilterBar / SavedViewsBar); summary strip `bg-muted/30` with
  "N groups shown", archive badge, hidden-column count and a Reset filters link; helpers `entityNoun`,
  `resetAll`, `hiddenCount`; name cells now sky-700 with entity icon (Users/Building2/Ship/Contact).
- `client/src/components/AddressBookTable.tsx`: wrapped in Card/CardContent p-0, header `bg-muted/60`
  semibold, rows `hover:bg-muted/40 transition-colors`, footer bar `border-t bg-muted/20 px-4 py-2.5`.
- Remaining: vessel card → AR figures + "Open AR card" button using VesselDetailDialog.

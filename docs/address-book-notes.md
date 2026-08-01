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

Still to do: vitest coverage for the address book contract, screenshots per tab, todo.md update, checkpoint + GitHub push.

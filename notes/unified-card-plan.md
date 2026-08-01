# Unified customer/group card — working notes (1 Aug)

Goal: one card per company/group with two top-level tabs.
- **Receivables** = everything the current group card / Customer 360 shows (KPIs, aging,
  transactions, promises, tasks, activity, payment history, contracts, emails,
  bank details, wire transfers).
- **Details** = the Address Book record content (identity fields, related
  companies/vessels/contacts deduped per person, gift badges, custom fields).

## Code landmarks

| Piece | File | Notes |
|---|---|---|
| Group card page | `client/src/pages/GroupDetail.tsx` (~1308 lines) | header + KPI cards + aging + transactions + `GroupActivityTabs` (line ~1112) + lower `Tabs defaultValue="receipts"` (line ~1135: Payment History / Contracts / Tasks / Emails) |
| Company card page | `client/src/pages/CustomerDetail.tsx` (~594 lines) | `Tabs defaultValue="invoices"` line ~357: Transactions / Payment History / Contracts / Tasks / Bank Details / Wire Transfers |
| Address Book record card | `client/src/components/AddressBookRecordDialog.tsx` (368 lines) | `RecordTarget = { entity, recordKey, title, subtitle }`; sections: Details (identity per entity), Related (companies/vessels/contacts via `RelatedList`), Custom fields (`CustomFieldsBlock`); dedupes contacts by email/name; "Open in Collections Desk" navigates to `/groups/:name`; fires window event `address-book:open` to swap records |
| Address Book page | `client/src/pages/AddressBook.tsx` (~1041 lines) | opens the dialog at line ~1013 with `target`/`dialogOpen` |
| Routes | `client/src/App.tsx` lines 40-59 | `/customers`, `/customers/:id`, `/groups/:name`, `/address-book`, `/contacts` |
| tRPC directory data | `trpc.addressBook.groups/customers/vessels/contacts` | already cached by the Address Book page |
| tRPC receivables data | `trpc.customers.groupDetail`, `customers.get360`, `customers.groupForecast` | group/company scoped |

## Approach

1. Extract the Address Book record content into a reusable `RecordDetailsPanel`
   component (props: entity, recordKey) so it can render both inside the dialog and
   inside a page tab.
2. Add a `Details` tab next to the existing receivables content on `GroupDetail`
   and `CustomerDetail`, driven by a `?tab=` query param so links can deep-link.
3. From the Address Book, group/company rows open the same card page (keeping the
   dialog for vessels/contacts, which have no receivables page).
4. Tests: routing + the presence of both tabs, and the deduped contacts list.

## Progress (1 Aug)

- `client/src/components/RecordDetailsPanel.tsx` created: holds the identity /
  Related / Custom-fields body, props `entity`, `recordKey`, `enabled`,
  `onOpenRecord`, `showCollectionsLink`. Falls back to navigating to
  `/address-book?tab=<entity>&record=<key>` when no `onOpenRecord` is given.
- `AddressBookRecordDialog.tsx` rewritten as a thin modal shell around it.
- `GroupDetail.tsx` + `CustomerDetail.tsx` now wrap their content in top-level
  `Receivables` / `Details` tabs, state synced to `?tab=details` via
  `history.replaceState`. Group recordKey = group name; company recordKey =
  `String(customer.id)`.
- Verified on screen: `/groups/MSC%20SHIPMANAGEMENT%20LTD?tab=details` shows
  Details (1 company, 13 vessels, 4 contacts, ERP code) + Related lists + custom fields.
- Still to do: Address Book group/company rows should open these pages; update the
  tests that still point at `AddressBookRecordDialog.tsx`
  (`server/addressBook.test.ts` ~134-186, `server/addressBookStyling.test.ts` ~67-87,
  `server/groupContactDedup.test.ts` ~32-35).

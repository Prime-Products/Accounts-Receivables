# Collection Notes feature — implementation notes (30/7)

User request: per-group particularities (best call times etc.) always visible on group card,
shown in Log Call dialog, feed into AI Summary. User wants to SEE how it looks (screenshot).

## Done so far
- Schema: `group_collection_profile` table (groupName unique, notes text, updatedBy, updatedAt) — migration 0032 applied to DB.
- db.ts: getGroupCollectionProfile / upsertGroupCollectionProfile helpers (schema import added).
- Router: customers.getCollectionProfile (query) + customers.setCollectionProfile (mutation, addActivityLog "note"/"Collection notes updated", audit). tsc passes.
- AI summary: facts.collectionNotes injected + system prompt updated to use it in the recommended action.
- GroupDetail.tsx: CollectionNotesBox rendered between KPI grid and Aging card (import added line ~4).
- New component client/src/components/CollectionNotesBox.tsx (amber box, inline edit, empty-state dashed button).

## LogCallDialog notes
- Component props: { group, ... } at line ~33; queries enabled by `open` flag (e.g. getOpenPromise line 67).
- Add: `const { data: collectionProfile } = trpc.customers.getCollectionProfile.useQuery({ group }, { enabled: open });`
- Render amber reminder box right after the form starts (before contact select), only when collectionProfile?.notes && !savedCall.
- DONE: query + Info import + amber reminder box added at top of the form else-branch. tsc passes.

## Remaining
1. db.ts helpers: getGroupCollectionProfile(groupName), upsertGroupCollectionProfile(groupName, {notes, updatedBy})
2. Router procedures (customers router in server/routers/ar.ts):
   - customers.getCollectionProfile ({group}) → row|null (protected)
   - customers.setCollectionProfile ({group, notes}) → upsert + audit + activity log (activityType "note", title "Collection notes updated")
3. GroupDetail.tsx: always-visible amber "Collection Notes" box near top (below header/KPIs), inline edit with pencil → textarea + Save/Cancel. Empty state: dashed box "Add call preferences & particularities…" clickable.
4. LogCallDialog.tsx: query collectionProfile when open; if notes exist show amber reminder box at top of form.
5. AI Summary: find aiSummary procedure in server/routers/ar.ts (search "aiSummary"), inject collection notes into prompt context.
6. Vitest: server/collectionProfile.test.ts — set + get roundtrip, uses testCleanup snapshot pattern (see followUpActions.test.ts).
7. Screenshot for user (MSC group card: /groups/MSC%20GROUP or find via Customers), checkpoint, push github main.

## Key file locations
- db helpers: server/db.ts (~line 621 groupNotes helpers as pattern)
- customers router: server/routers/ar.ts (groupDetail ~line 940)
- GroupDetail.tsx KPI cards ~line 600 (Open Balance card with Due next month)
- LogCallDialog.tsx: form body starts ~line 245

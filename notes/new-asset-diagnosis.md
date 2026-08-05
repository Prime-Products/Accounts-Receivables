# New Asset — why it does not work (2026-08-04)

## Root cause: hard dependency on an Ops Contract that does not exist
- `ops_contracts` = 0 rows, `ops_asset_catalog` = 0 rows, `ops_assets` = 0 rows.
- Dialog "Contract *" Select is populated from `trpc.opsContracts.list` -> empty list -> nothing selectable.
- Create button: `disabled={!form.contractId || !form.serialNumber || !form.name}`
  => permanently disabled because contractId can never be set.
- Server `opsAssets.create` has `contractId: z.number().optional()` -> the server does NOT require it.
  The blocker is purely the client-side gate.

## Secondary issues found
1. Vessel: `form.vesselId` exists in state and is sent to the server, but there is NO vessel
   Select in the dialog JSX. So an asset can never be assigned to a vessel at creation time.
   (184 vessels exist in the `vessels` table.)
2. Empty-state has no guidance: the Select just shows a placeholder with no options and no hint
   that the user must first create an Ops Contract / catalog items.
3. Status colors map in OpsAssets.tsx includes "Written Off", which is NOT in
   `opsAssetStatuses` = [Not Supplied, In Transit, Active, Pending Return, Returned]. Dead entry.
4. No "In Transit" entry in the statusColors map -> that status renders without a colour.

## DB verified
ops_assets columns match schema (serialNumber unique, catalogItemId/vesselId/contractId nullable).
No migration problem.

## Fix plan
- Make Contract optional in the dialog (label without *), remove it from the disabled gate.
- Add a Vessel Select (searchable, optional) so the already-sent vesselId is actually usable.
- Add Status select (default "Not Supplied") + optional Return Port + Notes.
- Empty-state hints inside the Selects when there are no contracts / catalog items.
- Fix statusColors: drop "Written Off", add "In Transit".
- Tests for: create without contract, vessel assignment, status enum parity.

# Prime 247 sample data (August 2026)

Seeded on the user's explicit request so the module can be exercised before the real
ERP data arrives. Everything is marked so it can be removed in one step.

## Catalogue (kept — this is the pricelist the picker reads)

- `ops_asset_catalog`: 12 instruments (RIKEN KEIKI GX-3R / GX-3R PRO / GX-6000 / GX-6100 /
  RX-8700, OX-07, sampling hose, hand pumps, IrCOMM adapter, SDM-3R station, AP-20 aspirator)
- `ops_consumable_catalog`: 8 consumables (4-gas / isobutane / CO2 / zero-air cylinders,
  CO2 + H2S detector tubes, GX-3R sensor set, filter set)
- Total 20 catalogue products; these are real Prime Products lines, not demo markers.

## Sample contracts (removable)

- `ops_contracts.contractNumber LIKE 'DEMO-2026-%'` → ids 30001..30010, titles prefixed
  `[SAMPLE]`, notes `[SAMPLE DATA] Demo contract for testing`.
- Customers used are real: 393 MSC, 20 Alpha Bulkers, 385 Minerva, 420 Grehel,
  303 Laskaridis, 460 Pantheon, 86 Capital Gas, 126 Danaos, 459 Alpha Gas, 326 Livanos.
- 3 real vessels per contract (30 assignments), notes `[SAMPLE DATA]`; the first two
  vessels of each Active contract carry a shipment date, the third does not.
- Products per contract: ~18 lines across Equipment / Consumable / Other, priced from
  the catalogue. DEMO-003/006/007/009 also carry the RX-8700 and extra consumables;
  DEMO-001/005/007 carry the SDM-3R station.
- Equipment units in `ops_assets` use serials `DEMO-<contract>-<vessel>-<line>-<unit>`
  and notes `[SAMPLE DATA]`; a mix of Active / In Transit / Not Supplied so the supply
  badges show all three states.
- Certificates on supplied units: `CERT-DEMO-<assetId>`, notes `[SAMPLE DATA]`, with a
  slice deliberately expiring soon or already expired.
- DEMO-2026-010 starts 01 Oct 2023 and ends 30 Sep 2026, so it exercises the red
  "expiring soon" indicator; DEMO-008/009 are Offers rather than Active.

## Cleanup

Prime 247 → Contracts → "Sample data" menu → Remove sample contracts, or call
`trpc.ops.contracts.purgeSampleData`. It deletes, in dependency order: certificates of
sample assets, sample assets, consumable orders, payment schedule rows, vessel
assignments, contract library lines, then the `DEMO-2026-%` contracts themselves.
The catalogue is intentionally left untouched.

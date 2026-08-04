# "Assets" → user-facing rename (user request 4 Aug 2026)

User feedback: "τα assets δεν τα καταλαβαινω, μηπως τα ονομασουμε προιοντα".

## Decision

The word "Asset" is accounting jargon. In Prime's real workflow these rows are the
**physical, serial-numbered equipment placed on a vessel** (γκαζόμετρα, όργανα μέτρησης
with serial + certificate). The contract now calls its lines **Products** (Instrument /
Cylinder / Ampoule / Service), so the tracked physical units become **"Equipment"** in the
sidebar/page titles, described as the serial-tracked units of the contract products.

Rename map (UI strings only — DB tables, tRPC routers and routes stay `assets` to avoid
a breaking migration):

| Old UI string | New UI string |
|---|---|
| Sidebar "Assets" | "Equipment" |
| Page title "Asset Tracking" | "Equipment on Vessels" |
| "New Asset" | "New Equipment" |
| "Create Asset" | "Create Equipment" |
| "Search assets..." | "Search equipment..." |
| "No assets found" | "No equipment yet" |
| "Asset Type" (dialog field) | "Product" (links to the catalog entry) |
| Catalog tab "Asset Types" | "Products" |
| "Add/Edit Asset Type" | "Add/Edit Product" |
| "Active Assets" KPI (Ops Dashboard, Reports, Vessel Dashboard) | "Active Equipment" |
| "Asset marked as returned" toast | "Equipment marked as returned" |
| "Asset" column (Certificates page) | "Equipment" |
| "Back to Assets" | "Back to Equipment" |

Files touched: OpsAssets.tsx, OpsCatalog.tsx, OpsDashboard.tsx, OpsVesselDashboard.tsx,
OpsReturns.tsx, OpsCertificates.tsx, Reports.tsx, DashboardLayout.tsx.

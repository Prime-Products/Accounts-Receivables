/**
 * Guards the Address Book presentation contract: it must follow the AR Pro visual
 * language (card-wrapped table, plain segmented entity switcher, open filter and
 * tools rows exactly like Invoices/Collections Desk, summary strip) and must link
 * the vessel directory record to its AR card, since the standalone Vessels page
 * stays the financial view.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const page = readFileSync(join(root, "client/src/pages/AddressBook.tsx"), "utf8");
const table = readFileSync(join(root, "client/src/components/AddressBookTable.tsx"), "utf8");
const card = readFileSync(join(root, "client/src/components/AddressBookRecordDialog.tsx"), "utf8");
// The card body now lives in the panel shared with the group/company card pages.
const cardBody = readFileSync(join(root, "client/src/components/RecordDetailsPanel.tsx"), "utf8");

describe("Address Book visual language", () => {
  it("wraps the list in a Card like every other AR Pro list page", () => {
    expect(table).toContain('import { Card, CardContent } from "@/components/ui/card"');
    expect(table).toMatch(/<Card className="overflow-hidden">/);
    expect(table).toMatch(/<CardContent className="p-0">/);
  });

  it("uses a muted sticky header and hover rows in the list", () => {
    expect(table).toContain("bg-muted/60");
    expect(table).toContain("hover:bg-muted/40");
    expect(table).toContain('className="sticky top-0 z-20"');
  });

  it("renders the load-more footer inside the card, not as loose buttons", () => {
    expect(table).toMatch(/border-t bg-muted\/20/);
  });

  it("uses the stock segmented switcher, like the Collections Desk toggle", () => {
    // Default shadcn TabsList/TabsTrigger styling — no custom muted panel, no
    // sky count pills, which is what made this page look foreign.
    expect(page).toMatch(/<TabsList className="h-10">/);
    expect(page).not.toContain('TabsList className="h-auto flex-wrap gap-1 bg-muted/60 p-1"');
    expect(page).not.toContain("bg-sky-100 text-sky-700");
    // Counts stay as plain muted mono numbers next to the label.
    expect(page).toContain('<span className="font-mono text-xs text-muted-foreground">');
  });

  it("keeps filters and tools on open rows instead of a boxed toolbar panel", () => {
    expect(page).not.toMatch(/rounded-lg border bg-card p-3/);
    // Order on the page: switcher/filters row → tools row (with saved views) → table.
    const filterRow = page.indexOf('<div className="flex flex-wrap gap-3">');
    const fieldFilters = page.indexOf("<FieldFilterBar");
    const savedViews = page.indexOf("<SavedViewsBar");
    const tableStart = page.indexOf("<AddressBookTable");
    expect(filterRow).toBeGreaterThan(-1);
    expect(fieldFilters).toBeGreaterThan(filterRow);
    expect(savedViews).toBeGreaterThan(fieldFilters);
    expect(savedViews).toBeLessThan(tableStart);
  });

  it("uses the same neutral page title treatment as the other list pages", () => {
    expect(page).toMatch(/<h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">/);
    expect(page).toContain('<BookUser className="h-6 w-6" />');
  });

  it("shows a skeleton page shell while a route chunk loads", () => {
    const app = readFileSync(join(root, "client/src/App.tsx"), "utf8");
    expect(app).toContain('import { Skeleton } from "@/components/ui/skeleton"');
    // The fallback renders a shell, not a bare text line.
    expect(app).toMatch(/aria-busy="true" aria-label="Loading page"/);
    expect(app).not.toMatch(/text-muted-foreground text-sm">\s*Loading/);
  });

  it("shows a result summary strip with a reset action", () => {
    expect(page).toContain("entityNoun(entity, filtered.length)");
    expect(page).toContain("Reset filters");
    expect(page).toMatch(/const resetAll = \(\) => \{/);
  });

  it("marks primary name cells with the entity icon in the accent colour", () => {
    for (const icon of ["Users", "Building2", "Ship", "Contact"]) {
      expect(page).toContain(`<${icon} className="h-3.5 w-3.5 shrink-0 opacity-70" />`);
    }
    // Groups, companies and vessels carry the sky accent inline; the contacts
    // name cell switches between sky (person) and violet (department).
    expect(page.match(/font-medium text-sky-700/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(page).toContain('dept ? "text-violet-700" : "text-sky-700"');
  });
});

describe("Address Book record card", () => {
  it("uses sky accents on the card title icons", () => {
    expect(card.match(/h-5 w-5 text-sky-600/g)?.length ?? 0).toBe(4);
  });

  it("groups each block in its own panel", () => {
    expect(cardBody.match(/rounded-lg border bg-card p-4/g)?.length ?? 0).toBe(3);
    expect(cardBody).not.toContain('from "@/components/ui/separator"');
  });

  it("links a vessel directory record to its financial AR card", () => {
    expect(cardBody).toContain('import { VesselDetailDialog } from "@/components/VesselDetailDialog"');
    expect(cardBody).toContain("Open AR card");
    expect(cardBody).toContain("setArVesselId(vesselRow.id)");
    expect(cardBody).toMatch(/vesselId=\{arVesselId\}/);
  });

  it("tells the user while the record is still loading", () => {
    expect(cardBody).toContain("Loading record…");
  });
});

describe("navigation after the Contacts merge", () => {
  it("keeps Vessels as a separate financial page and drops the old Contacts page", () => {
    const layout = readFileSync(join(root, "client/src/components/DashboardLayout.tsx"), "utf8");
    expect(layout).toContain("Address Book");
    expect(layout).toContain("Vessels");
    expect(layout).not.toMatch(/label: "Contacts"/);
  });
});

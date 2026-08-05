import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "Wherever I click on a vessel in the app, the vessel modal must open, with all the
 * information." One modal instance lives at the app root and every vessel click target
 * routes through `useVesselModal().openVessel(id)` — never a navigation.
 */
const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const context = read("client/src/contexts/VesselModalContext.tsx");
const vesselLink = read("client/src/components/VesselLink.tsx");
const app = read("client/src/App.tsx");

/** Every screen that shows a vessel the user can click. */
const CLICK_TARGETS = [
  "client/src/components/InvoicesTable.tsx",
  "client/src/components/RecordDetailsPanel.tsx",
  "client/src/components/GlobalSearch.tsx",
  "client/src/pages/Vessels.tsx",
  "client/src/pages/Invoices.tsx",
  "client/src/pages/GroupDetail.tsx",
  "client/src/pages/AddressBook.tsx",
  "client/src/pages/ops/OpsContractDetail.tsx",
  "client/src/pages/ops/OpsAssets.tsx",
  "client/src/pages/ops/OpsCertificates.tsx",
];

describe("one vessel modal for the whole app", () => {
  it("exposes openVessel through a provider mounted at the app root", () => {
    expect(context).toContain("VesselModalProvider");
    expect(context).toContain("openVessel");
    expect(context).toContain("<VesselDetailDialog");
    expect(app).toContain("<VesselModalProvider>");
  });

  it("ignores non-vessel ids instead of opening an empty modal", () => {
    expect(context).toContain("Number.isFinite(id)");
  });

  it("the shared vessel link opens the modal and stops the row click", () => {
    expect(vesselLink).toContain("openVessel");
    expect(vesselLink).toContain("stopPropagation");
  });

  it("falls back to a no-op outside the provider so components render in isolation", () => {
    expect(context).toContain("ctx ?? { openVessel: () => {}");
  });
});

describe("every vessel click target uses the modal", () => {
  for (const file of CLICK_TARGETS) {
    it(`${file} opens the vessel modal`, () => {
      const src = read(file);
      expect(src).toMatch(/useVesselModal|VesselLink|VesselBadge/);
    });
  }

  it("no screen navigates to a per-vessel page any more", () => {
    for (const file of CLICK_TARGETS) {
      const src = read(file);
      expect(src).not.toMatch(/navigate\(`\/vessels\/\$/);
      expect(src).not.toMatch(/href=\{`\/vessels\/\$/);
      // Only real navigation counts — comments may still mention the retired routes.
      expect(src).not.toMatch(/navigate\(["'`]\/ops\/vessel\//);
      expect(src).not.toMatch(/href=\{?["'`]\/ops\/vessel\//);
    }
  });

  it("the superseded per-vessel pages are gone", () => {
    expect(existsSync(join(root, "client/src/pages/VesselDetail.tsx"))).toBe(false);
    expect(existsSync(join(root, "client/src/pages/ops/OpsVesselDashboard.tsx"))).toBe(false);
  });
});

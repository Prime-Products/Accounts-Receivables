import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

/**
 * The vessel page has to be a full read of the Equipment page for the units on board:
 * every field Prime tracks per serial (status, certificate, return port, last update,
 * notes) must be visible without leaving the vessel.
 */
describe("vessels.detail serial payload", () => {
  const src = read("server/routers/ar.ts");
  const block = src.slice(src.indexOf("const contractItems"), src.indexOf("const contractItems") + 2200);

  it("carries the same fields per serial as the Equipment list", () => {
    for (const field of [
      "serialNumber: u.serialNumber",
      "status: u.status",
      "targetReturnPort: u.targetReturnPort",
      "notes: u.notes",
      "updatedAt:",
      "certificateNumber:",
      "certificateExpiry:",
      "daysUntilCertificateExpiry:",
    ]) {
      expect(block).toContain(field);
    }
  });

  it("keeps the certificate that expires soonest for each unit", () => {
    expect(src).toContain("if (!existing || cert.expiryDate < existing.expiryDate)");
  });
});

describe("vessel modal equipment detail", () => {
  // A vessel opens in the app-wide modal, which renders the shared products table.
  const src = read("client/src/components/VesselProductsTable.tsx");

  it("renders a per-serial table under each tracked item line", () => {
    for (const header of ["Serial number", "Status", "Certificate", "Return port", "Updated"]) {
      expect(src).toContain(`>${header}</th>`);
    }
  });

  it("uses the Equipment status palette so a status reads the same everywhere", () => {
    expect(src).toContain("const assetStatusColors");
    for (const quoted of ['"Not Supplied":', '"In Transit":', '"Pending Return":']) {
      expect(src).toContain(quoted);
    }
    expect(src).toContain('Active: "bg-emerald');
    expect(src).toContain('Returned: "bg-sky');
    expect(src).toContain("assetStatusColors[u.status]");
  });

  it("shows the certificate number next to its expiry countdown", () => {
    expect(src).toContain("u.certificateNumber");
    expect(src).toContain("certToneClass(u.daysUntilCertificateExpiry)");
  });

  it("surfaces unit notes instead of hiding them", () => {
    expect(src).toContain("item.serials.some(u => u.notes)");
  });

  it("links each serial back to the Equipment page pre-filtered on it", () => {
    expect(src).toContain("/ops/assets?q=${encodeURIComponent(u.serialNumber)}");
  });

  it("still groups the lines as equipment, consumables and other", () => {
    expect(src).toContain("groupContractProducts");
  });
});

describe("Equipment page deep link", () => {
  const src = read("client/src/pages/ops/OpsAssets.tsx");

  it("seeds its search box from the q parameter", () => {
    expect(src).toContain('new URLSearchParams(window.location.search).get("q")');
    expect(src).toContain('const q = new URLSearchParams(searchStr).get("q")');
    expect(src).toContain("if (q) setSearch(q)");
  });
});

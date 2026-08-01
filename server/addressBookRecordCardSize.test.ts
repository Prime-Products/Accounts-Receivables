/**
 * The Address Book record card must be large enough to show a whole group at a glance,
 * and resizable like every other AR Pro modal. Guards the UI contract after the
 * "το παράθυρο του group είναι μικρό" report.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..");
const dialog = readFileSync(join(root, "client/src/components/AddressBookRecordDialog.tsx"), "utf8");
const page = readFileSync(join(root, "client/src/pages/AddressBook.tsx"), "utf8");

describe("Address Book record card sizing", () => {
  it("uses the shared resizable dialog shell instead of a fixed small DialogContent", () => {
    expect(dialog).toContain("ResizableDialogContent");
    expect(dialog).toContain('storageKey="address-book-record"');
    // The old narrow shell must be gone.
    expect(dialog).not.toContain("sm:max-w-2xl");
  });

  it("opens wide by default while staying inside the viewport", () => {
    expect(dialog).toMatch(/defaultWidth=\{Math\.min\(1100/);
    expect(dialog).toMatch(/defaultHeight=\{Math\.min\(760/);
    expect(dialog).toContain("window.innerWidth * 0.92");
    expect(dialog).toContain("window.innerHeight * 0.88");
  });

  it("keeps the header fixed and scrolls only the body", () => {
    expect(dialog).toMatch(/DialogHeader className="shrink-0/);
    expect(dialog).toMatch(/min-h-0 flex-1 .*overflow-auto/);
  });

  it("lists every related company, vessel and contact instead of the first 12", () => {
    expect(dialog).not.toContain("slice(0, 12)");
    expect(dialog).toContain("max-h-64");
  });

  it("supports deep-linking a record so a card can be opened by URL", () => {
    expect(page).toContain('get("record")');
    expect(page).toContain("setDialogOpen(true)");
  });
});

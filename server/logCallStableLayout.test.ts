import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const dialog = readFileSync(join(root, "client/src/components/LogCallDialog.tsx"), "utf8");

/**
 * The Log Call dialog is filled in dozens of times a day, so its fields must sit
 * in the same place every time. They used to move: the Company select was only
 * rendered for multi-company groups (reflowing the 2-column grid), the contact
 * details box grew inside the contact cell and dragged Outcome / Customer
 * Response out of line, and the Collection Notes banner only existed for some
 * groups. These specs pin the fixed skeleton.
 */
describe("Log Call dialog — stable field skeleton", () => {
  it("always renders the Company slot, read-only for single-company groups", () => {
    // The old shape hid the whole block behind the company count.
    expect(dialog).not.toMatch(/\{companies && companies\.length > 1 && \(/);
    // The label exists unconditionally; only the control inside switches.
    expect(dialog).toMatch(/Company \(optional\)/);
    expect(dialog).toMatch(/companies && companies\.length > 1 \?/);
    // Single-company fallback shows the company name instead of an empty cell.
    expect(dialog).toMatch(/companies\?\.\[0\]\?\.name \?\? group/);
  });

  it("keeps the four inputs in a fixed order: company, contact, outcome, response", () => {
    // The slot markers are unique, unlike the label strings which also appear in
    // the explanatory comments.
    const order = ["Slot 1 — company", "Slot 2 — contact person", "Slot 3 — outcome", "Slot 4 — customer response"].map(
      marker => dialog.indexOf(marker),
    );
    expect(order.every(i => i >= 0)).toBe(true);
    const sorted = [...order].sort((a, b) => a - b);
    expect(order).toEqual(sorted);
  });

  it("moves the contact extras out of the grid cell", () => {
    // Contact details, the "Other" name input and the add-contact form now live
    // after the grid closes, so they cannot stretch a grid cell.
    const gridStart = dialog.indexOf("FIXED SKELETON");
    const extrasComment = dialog.indexOf("Contact extras live on their own full-width row");
    const detailsBox = dialog.indexOf("{selectedContact && (");
    const addNewForm = dialog.indexOf('{selectedContactId === "add-new" && (');
    expect(gridStart).toBeGreaterThan(-1);
    expect(extrasComment).toBeGreaterThan(gridStart);
    expect(detailsBox).toBeGreaterThan(extrasComment);
    expect(addNewForm).toBeGreaterThan(extrasComment);
  });

  it("pins the Collection Notes row so the fields never start at a different height", () => {
    expect(dialog).toMatch(/No collection notes for this group\./);
  });

  it("reserves a fixed slot for the response-specific panel", () => {
    expect(dialog).toMatch(/min-h-\[104px\]/);
  });
});

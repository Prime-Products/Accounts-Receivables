import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * A group can hold dozens of payment contacts (one per vessel, plus departments),
 * so the Log Call picker must be a search box: the collector types the fragment
 * they remember and sees exactly what they typed, instead of a native select that
 * jumps between entries on each keystroke.
 */
describe("Log Call — searchable contact person", () => {
  const src = readFileSync(new URL("../client/src/components/LogCallDialog.tsx", import.meta.url), "utf8");
  /**
   * The picker occupies slot 2 of the fixed field skeleton; the contact extras
   * (details box, free-text name, add-new form) were moved out of the grid cell to
   * stop them from stretching it, so the block ends where slot 3 begins. The
   * escape-hatch entries live inside the popover list, which is still in slot 2.
   */
  const block = src.slice(src.indexOf("{/* Slot 2 — contact person"), src.indexOf("{/* Slot 3 — outcome"));

  it("uses a combobox popover instead of a plain select", () => {
    expect(block).toContain('role="combobox"');
    expect(block).toContain("<PopoverTrigger asChild>");
    expect(block).not.toContain("<SelectTrigger");
  });

  it("shows a visible search input inside the dropdown", () => {
    expect(block).toContain('placeholder="Search contacts…"');
    // Controlled input: our own filter, not cmdk's, decides what is shown.
    expect(block).toContain("value={contactQuery}");
    expect(block).toContain("onValueChange={setContactQuery}");
    expect(block).toContain("shouldFilter={false}");
    expect(block).toContain("<CommandEmpty>No contact found</CommandEmpty>");
  });

  it("searches by name, title and email so any remembered fragment matches", () => {
    expect(src).toContain("matchesAllTokens(q, [c.name, c.title, c.email])");
  });

  it("keeps the trigger showing the chosen contact, or a placeholder when empty", () => {
    expect(src).toContain("const selectedContactLabel = selectedContact");
    expect(block).toContain('{selectedContactLabel || "Select contact…"}');
  });

  it("still offers the free-text and add-new escape hatches", () => {
    expect(block).toContain("Other (type a name)");
    expect(block).toContain("Add new contact");
  });

  it("marks departments distinctly in the list", () => {
    expect(block).toContain('(c as { contactType?: string }).contactType === "Department"');
    expect(block).toContain("· department");
  });

  it("keeps the contact extras out of the picker cell so the grid never reflows", () => {
    expect(block).not.toContain('{selectedContactId === "other" && (');
    expect(block).not.toContain('{selectedContactId === "add-new" && (');
    expect(src).toContain('{selectedContactId === "add-new" && (');
  });

  it("closes the dropdown on pick and resets it when the dialog reopens", () => {
    expect(block).toContain("setContactPickerOpen(false)");
    const reset = src.slice(src.indexOf("if (open) {"), src.indexOf("setOutcome(\"Reached\")"));
    expect(reset).toContain("setContactPickerOpen(false)");
  });
});

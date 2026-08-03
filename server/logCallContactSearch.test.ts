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
  const block = src.slice(src.indexOf("{/* Contact person selection */}"), src.indexOf('{selectedContactId === "other" &&'));

  it("uses a combobox popover instead of a plain select", () => {
    expect(block).toContain('role="combobox"');
    expect(block).toContain("<PopoverTrigger asChild>");
    expect(block).not.toContain("<SelectTrigger");
  });

  it("shows a visible search input inside the dropdown", () => {
    expect(block).toContain('<CommandInput placeholder="Search contacts…" />');
    expect(block).toContain("<CommandEmpty>No contact found</CommandEmpty>");
  });

  it("searches by name, title and email so any remembered fragment matches", () => {
    expect(block).toContain("value={`${c.name} ${c.title ?? \"\"} ${c.email ?? \"\"}`}");
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

  it("closes the dropdown on pick and resets it when the dialog reopens", () => {
    expect(block).toContain("setContactPickerOpen(false)");
    const reset = src.slice(src.indexOf("if (open) {"), src.indexOf("setOutcome(\"Reached\")"));
    expect(reset).toContain("setContactPickerOpen(false)");
  });
});

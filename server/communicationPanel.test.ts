import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The communication history used to sit as a block in the middle of the group /
 * company card, pushing aging and transactions below the fold. It now lives in a
 * hideable side panel; these tests guard that arrangement.
 */
describe("Communication side panel", () => {
  const panel = read("client/src/components/CommunicationPanel.tsx");
  const timeline = read("client/src/components/CommunicationTimeline.tsx");
  const group = read("client/src/pages/GroupDetail.tsx");
  const customer = read("client/src/pages/CustomerDetail.tsx");

  it("renders the timeline chromeless inside the panel (no nested cards)", () => {
    expect(timeline).toContain("embedded?: boolean");
    expect(timeline).toContain("if (embedded) {");
    expect(panel).toContain("embedded");
  });

  it("keeps the panel sticky and independently scrollable on desktop", () => {
    expect(panel).toContain("sticky top-4");
    expect(panel).toContain('maxHeightClass="max-h-[calc(100vh-14rem)]"');
  });

  it("falls back to a slide-over sheet on small screens", () => {
    expect(panel).toContain("useIsMobile");
    expect(panel).toContain("<Sheet");
    expect(panel).toContain('side="right"');
  });

  it("remembers the open/closed choice across cards and reloads", () => {
    expect(panel).toContain('const STORAGE_KEY = "ar-communication-panel-open"');
    expect(panel).toContain("window.localStorage.getItem(STORAGE_KEY)");
    expect(panel).toContain("window.localStorage.setItem(STORAGE_KEY,");
  });

  it("starts closed on phones (full-screen sheet) but open on desktop", () => {
    expect(panel).toContain("return window.innerWidth >= 768;");
    expect(panel).toContain('if (stored === "closed") return false;');
    expect(panel).toContain('if (stored === "open") return true;');
  });

  it("renders nothing at all when hidden, so the money column gets the full width", () => {
    expect(panel).toContain("if (!open) return null;");
  });

  it("exposes a header toggle with the entry count", () => {
    expect(panel).toContain("export function CommunicationToggle");
    expect(panel).toContain("Communication{count > 0 ? ` (${count})` : \"\"}");
  });

  it("group card hosts the panel beside the figures, not between them", () => {
    expect(group).toContain("<CommunicationPanel");
    expect(group).toContain("<CommunicationToggle");
    expect(group).toContain("const commPanel = useCommunicationPanel()");
    // The old inline block is gone.
    expect(group).not.toContain("<CommunicationTimeline");
  });

  it("company card uses the very same panel and shared state", () => {
    expect(customer).toContain("<CommunicationPanel");
    expect(customer).toContain("<CommunicationToggle");
    expect(customer).toContain("const commPanel = useCommunicationPanel()");
    expect(customer).not.toContain("<CommunicationTimeline");
  });

  it("both cards keep a two-column flex shell so the panel sits on the right", () => {
    for (const src of [group, customer]) {
      expect(src).toContain('<div className="flex gap-4 items-start">');
      expect(src).toContain('<div className="flex-1 min-w-0 space-y-4">');
    }
  });

  it("closing the panel from inside reuses the same toggle so the choice is stored", () => {
    expect(group).toContain("onClose={commPanel.toggle}");
    expect(customer).toContain("onClose={commPanel.toggle}");
  });
});

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The communication history must never disturb the figures. A block in the
 * middle of the card pushed aging below the fold; a side column reflowed and
 * squeezed the KPI cards. So it is now a floating window: it sits above the
 * page, is dragged by its title bar, resized from the corner, and the card
 * underneath keeps its full width.
 */
describe("Communication floating window", () => {
  const panel = read("client/src/components/CommunicationPanel.tsx");
  const timeline = read("client/src/components/CommunicationTimeline.tsx");
  const group = read("client/src/pages/GroupDetail.tsx");
  const customer = read("client/src/pages/CustomerDetail.tsx");

  it("is positioned as a floating layer, not an in-flow column", () => {
    expect(panel).toContain('className="fixed z-40 flex flex-col overflow-hidden rounded-lg border bg-card shadow-2xl"');
    expect(panel).toContain("style={{ left: geometry.x, top: geometry.y, width: geometry.w, height: geometry.h }}");
    expect(panel).not.toContain("<aside");
    expect(panel).not.toContain("sticky top-4");
  });

  it("can be dragged by the title bar and resized from the corner", () => {
    expect(panel).toContain('startDrag("move")');
    expect(panel).toContain('startDrag("resize")');
    expect(panel).toContain("cursor-move");
    expect(panel).toContain("cursor-se-resize");
  });

  it("closing from the title bar does not start a drag", () => {
    expect(panel).toContain("onPointerDown={e => e.stopPropagation()}");
  });

  it("remembers position and size, and enforces a minimum size", () => {
    expect(panel).toContain('const GEOMETRY_KEY = "ar-communication-window-geometry"');
    expect(panel).toContain("window.localStorage.setItem(GEOMETRY_KEY, JSON.stringify(g))");
    expect(panel).toContain("const MIN_W = 320;");
    expect(panel).toContain("const MIN_H = 240;");
  });

  it("stays inside the viewport, also after the browser window is resized", () => {
    expect(panel).toContain("function clampGeometry");
    expect(panel).toContain('window.addEventListener("resize", onResize)');
    expect(panel).toContain("Math.min(Math.max(g.x, 8), Math.max(8, window.innerWidth - w - 8))");
  });

  it("has no backdrop, so the card underneath stays readable and clickable", () => {
    expect(panel).not.toContain("bg-black/");
    expect(panel).not.toContain("DialogOverlay");
  });

  it("starts closed so it never covers the figures on load", () => {
    expect(panel).toContain('return window.localStorage.getItem(STORAGE_KEY) === "open"');
    expect(panel).toContain("const [open, setOpen] = useState(false);");
  });

  it("open/closed choice is remembered across cards", () => {
    expect(panel).toContain('const STORAGE_KEY = "ar-communication-panel-open"');
    expect(panel).toContain('window.localStorage.setItem(STORAGE_KEY, next ? "open" : "closed")');
  });

  it("phones fall back to a slide-over sheet (no room to float)", () => {
    expect(panel).toContain("const isMobile = useIsMobile();");
    expect(panel).toContain("<Sheet open={open}");
  });

  it("renders nothing at all when closed", () => {
    expect(panel).toContain("if (!open) return null;");
  });

  it("exposes a toolbar toggle carrying the entry count", () => {
    expect(panel).toContain("export function CommunicationToggle");
    expect(panel).toContain("Communication{count > 0 ? ` (${count})` : \"\"}");
  });

  it("only the entry list scrolls inside the window", () => {
    expect(timeline).toContain('<div className="flex h-full min-h-0 flex-col gap-2">');
    expect(timeline).toContain('<div className="min-h-0 flex-1 overflow-y-auto">{list}</div>');
    expect(timeline).toContain('embedded ? "space-y-4 pr-1"');
  });

  it("both cards mount the window, share its state and close through the toggle", () => {
    for (const src of [group, customer]) {
      expect(src).toContain("const commPanel = useCommunicationPanel();");
      expect(src).toContain("<CommunicationPanel");
      expect(src).toContain("<CommunicationToggle");
      expect(src).toContain("onClose={commPanel.toggle}");
      expect(src).not.toContain("<CommunicationTimeline");
    }
  });

  it("the figures column is full width again (no two-column shell)", () => {
    for (const src of [group, customer]) {
      expect(src).not.toContain('<div className="flex gap-4 items-start">');
      expect(src).not.toContain('<div className="flex-1 min-w-0 space-y-4">');
    }
  });
});

/**
 * The group and company pages are receivables cards, period. The top-level
 * Receivables/Details switch was removed: directory data belongs to the Address
 * Book, and a second tab only invited people away from the money view.
 */
describe("Receivables-only cards", () => {
  const group = read("client/src/pages/GroupDetail.tsx");
  const customer = read("client/src/pages/CustomerDetail.tsx");
  const addressBook = read("client/src/pages/AddressBook.tsx");

  it("no Receivables/Details tab bar on either card", () => {
    for (const src of [group, customer]) {
      expect(src).not.toContain('<TabsTrigger value="receivables">Receivables</TabsTrigger>');
      expect(src).not.toContain('<TabsTrigger value="details">Details</TabsTrigger>');
      expect(src).not.toContain("cardTab");
      expect(src).not.toContain("RecordDetailsPanel");
    }
  });

  it("the inner activity tabs (transactions, payments, tasks...) are untouched", () => {
    expect(customer).toContain('<TabsTrigger value="invoices">Transactions');
    expect(group).toContain('<TabsTrigger value="receipts">Payment History');
  });

  it("directory deep links no longer point at a removed tab", () => {
    expect(addressBook).not.toContain("?tab=details");
    expect(addressBook).toContain("navigate(`/groups/${encodeURIComponent(any.group)}`)");
    expect(addressBook).toContain("navigate(`/customers/${any.id}`)");
  });
});

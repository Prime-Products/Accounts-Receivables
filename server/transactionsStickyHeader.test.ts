import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The column header of the transactions list must stay visible while the list
 * scrolls. A sticky <thead> only pins to its nearest SCROLLING ancestor, and
 * shadcn's Table already wraps the table in an `overflow-x-auto` container — so
 * the vertical scroll box has to be that same container (via `containerClassName`
 * / `containerStyle`), not a plain wrapper div placed around <Table>.
 */
const table = readFileSync(new URL("../client/src/components/InvoicesTable.tsx", import.meta.url), "utf8");
const ui = readFileSync(new URL("../client/src/components/ui/table.tsx", import.meta.url), "utf8");
const customer = readFileSync(new URL("../client/src/pages/CustomerDetail.tsx", import.meta.url), "utf8");
const group = readFileSync(new URL("../client/src/pages/GroupDetail.tsx", import.meta.url), "utf8");

describe("transactions list — sticky column header", () => {
  it("pins the header row with an opaque background and a z-index", () => {
    expect(table).toMatch(/<TableHeader className="sticky top-0 z-20 bg-background/);
  });

  it("gives header cells their own background so rows cannot show through", () => {
    // Sortable heads and the selection checkbox head both need it: the sticky
    // element is the <thead>, but the cells paint over it.
    expect(table).toMatch(/relative whitespace-nowrap bg-background px-2/);
    expect(table).toContain('<TableHead className="w-8 px-2 bg-background">');
  });

  it("scrolls inside the table's own container when maxHeight is set", () => {
    expect(table).toContain("maxHeight?: string");
    expect(table).toContain('containerClassName={maxHeight ? "overflow-y-auto" : undefined}');
    expect(table).toContain("containerStyle={maxHeight ? { maxHeight } : undefined}");
  });

  it("lets the shared Table forward classes and styles to its scroll container", () => {
    expect(ui).toContain("containerClassName?: string");
    expect(ui).toContain("containerStyle?: React.CSSProperties");
    expect(ui).toContain('cn("relative w-full overflow-x-auto", containerClassName)');
    expect(ui).toContain("style={containerStyle}");
  });

  it("uses the bounded table on both cards instead of an outer scroll div", () => {
    for (const src of [customer, group]) {
      expect(src).toContain('maxHeight="480px"');
    }
    // The old wrapper that scrolled past the header is gone.
    expect(group).not.toContain('<div className="max-h-[480px] overflow-auto">');
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The customer architecture has three levels and the URLs must keep saying so:
 *   /groups/:name              → the customer card (hub)
 *   /groups/:name/receivables  → the collections workspace
 * These checks guard the split, because collapsing the two back into one route
 * is exactly the regression that would silently undo the restructure.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("customer hub architecture", () => {
  const app = read("client/src/App.tsx");
  const hub = read("client/src/pages/CustomerHub.tsx");
  const workspace = read("client/src/pages/GroupDetail.tsx");

  it("routes the bare group path to the hub and the module path to the workspace", () => {
    expect(app).toContain('<Route path={"/groups/:name"} component={CustomerHub} />');
    expect(app).toContain('<Route path={"/groups/:name/receivables"} component={GroupDetail} />');
  });

  it("keeps the old collections URL working by redirecting it to receivables", () => {
    expect(app).toContain('path={"/groups/:name/collections"}');
    expect(app).toContain("/receivables`} />");
  });

  it("matches the workspace on the receivables path, not the bare group path", () => {
    expect(workspace).toContain('useRoute("/groups/:name/receivables")');
  });

  it("names the workspace Receivables and sends its back button to the customer card", () => {
    expect(workspace).toContain("Receivables —");
    expect(workspace).toContain("Customer card");
    expect(workspace).toContain("navigate(`/groups/${encodeURIComponent(group)}`)");
  });

  it("reads the hub from the bare group path", () => {
    expect(hub).toContain('useRoute("/groups/:name")');
    expect(hub).toContain("customers.groupDetail.useQuery");
  });

  it("offers Receivables as a live module the hub can open", () => {
    expect(hub).toContain('title="Receivables"');
    expect(hub).toContain("const receivablesPath = `/groups/${encodeURIComponent(group)}/receivables`");
    expect(hub).toContain("navigate(receivablesPath)");
  });

  it("shows the planned modules honestly instead of pretending they work", () => {
    for (const name of ["Financials", "Quotations", "Orders"]) {
      expect(hub).toContain(`title="${name}"`);
      expect(hub).toContain(`planned("${name}")`);
    }
    // Planned tiles must be marked as not live, so they render as dashed + badged.
    expect(hub).toContain("live={false}");
    expect(hub).toContain("Planned");
  });

  it("shows the customer's key figures on the hub", () => {
    expect(hub).toContain('label="Open balance"');
    expect(hub).toContain('label="Overdue"');
    expect(hub).toContain('label="Companies"');
    expect(hub).toContain('label="Vessels"');
  });

  it("keeps collections entry points on the workspace, not the card", () => {
    // The desk is a worklist: a row must open the module where the work happens.
    expect(read("client/src/pages/Customers.tsx")).toContain(
      "navigate(`/groups/${encodeURIComponent(g.group)}/receivables`)",
    );
    // A mention always comes from collections activity.
    expect(read("client/src/components/MentionsInbox.tsx")).toContain(
      "setLocation(`/groups/${encodeURIComponent(m.group)}/receivables`)",
    );
  });
});

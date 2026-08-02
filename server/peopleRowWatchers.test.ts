/**
 * The card's "who is on this account" row: the two responsible people rendered
 * like the Team list (avatar + name + title) plus watchers who only follow the
 * account. These tests pin the wiring so the row cannot silently lose the
 * watcher controls or fall back to the old filter-looking badges.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

describe("people row on the receivables cards", () => {
  const peopleRow = read("client/src/components/PeopleRow.tsx");

  it("renders each person as an avatar with name and job title", () => {
    expect(peopleRow).toContain("watcherInitials(person.name)");
    expect(peopleRow).toContain("watcherColor(person.name)");
    // Title line under the name; falls back to the generic role.
    expect(peopleRow).toMatch(/person\?\.title.*\|\| roleName/s);
  });

  it("keeps both responsible roles assignable from the row", () => {
    expect(peopleRow).toContain('role="collector"');
    expect(peopleRow).toContain('role="manager"');
    expect(peopleRow).toContain("setAccountManager.useMutation");
    expect(peopleRow).toContain("setCollector.useMutation");
    expect(peopleRow).toContain("Assign collector");
    expect(peopleRow).toContain("Assign manager");
  });

  it("lets a colleague be added and removed as watcher", () => {
    expect(peopleRow).toContain("customers.addWatcher.useMutation");
    expect(peopleRow).toContain("customers.removeWatcher.useMutation");
    // Already-watching members are not offered again.
    expect(peopleRow).toContain("excludeIds={Array.from(watching)}");
    expect(peopleRow).toContain("Remove ${w.name} from watchers".replace("${w.name}", "${w.name}"));
  });

  it("shows an explicit empty state instead of a blank area", () => {
    expect(peopleRow).toContain("watchers.length === 0");
    expect(peopleRow).toContain(">none<");
  });

  it("is used by both the group card and the company card", () => {
    for (const page of ["client/src/pages/GroupDetail.tsx", "client/src/pages/CustomerDetail.tsx"]) {
      const src = read(page);
      expect(src).toContain('import { PeopleRow } from "@/components/PeopleRow"');
      expect(src).toContain("<PeopleRow");
      expect(src).toContain("watcherGroupName=");
      // The old loose badges in the title line are gone.
      expect(src).not.toContain("AccountManagerControl");
    }
  });

  it("stores watchers per group so a company shows its group's watchers", () => {
    const src = read("client/src/pages/CustomerDetail.tsx");
    expect(src).toContain("watcherGroupKey");
  });
});

describe("watcher backend wiring", () => {
  const routers = read("server/routers/ar.ts");
  const dbHelpers = read("server/db.ts");

  it("exposes list/add/remove procedures on the customers router", () => {
    expect(routers).toMatch(/watchers: protectedProcedure/);
    expect(routers).toMatch(/addWatcher: protectedProcedure/);
    expect(routers).toMatch(/removeWatcher: protectedProcedure/);
    expect(routers).toContain("db.listCustomerWatchers(input.groupName)");
    expect(routers).toContain("db.addCustomerWatcher(input.groupName, input.memberId)");
    expect(routers).toContain("db.removeCustomerWatcher(input.groupName, input.memberId)");
  });

  it("refuses inactive members as watchers", () => {
    const addBlock = routers.slice(routers.indexOf("addWatcher: protectedProcedure"));
    expect(addBlock.slice(0, 800)).toContain("Team member is inactive");
  });

  it("records watcher changes in the audit trail", () => {
    expect(routers).toContain('audit(ctx, "Add Watcher", "customerGroup"');
    expect(routers).toContain('audit(ctx, "Remove Watcher", "customerGroup"');
  });

  it("adding the same watcher twice does not duplicate the row", () => {
    const helper = dbHelpers.slice(dbHelpers.indexOf("export async function addCustomerWatcher"));
    expect(helper.slice(0, 600)).toContain("if (existing.length > 0) return existing[0].id");
  });

  it("joins the team member so the UI gets the name and title", () => {
    const helper = dbHelpers.slice(dbHelpers.indexOf("export async function listCustomerWatchers"));
    expect(helper.slice(0, 700)).toContain("innerJoin(teamMembers");
    expect(helper.slice(0, 700)).toContain("title: teamMembers.title");
  });

  it("ships the watchers with both card payloads", () => {
    expect(routers).toContain("const watchers = await db.listCustomerWatchers(input.group)");
    expect(routers).toContain("const watchers360 = await db.listCustomerWatchers(watcherGroupKey)");
  });

  it("declares the watchers table in the drizzle schema", () => {
    const schema = read("drizzle/schema.ts");
    expect(schema).toContain("customerWatchers");
    expect(schema).toContain("customer_watchers");
  });
});

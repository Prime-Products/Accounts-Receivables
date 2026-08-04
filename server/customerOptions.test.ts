import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { appRouter } from "./routers";

const ctx = { user: { id: 1, name: "audit", role: "admin" } } as never;
const caller = appRouter.createCaller(ctx);

/**
 * `customers.list` scores every company (balances, credit rating, breakdown) and
 * is measured in megabytes. Dropdown pickers only need id/name/group, and the Log
 * Call dialog only needs one group's companies. These tests pin the light
 * endpoints and the fact that the pickers use them, because a regression here is
 * invisible in the UI but multiplies page weight.
 */
describe("customers.options — lightweight picker list", () => {
  it("returns only id, code, name and group per row", async () => {
    const rows = await caller.customers.options();
    expect(rows.length).toBeGreaterThan(0);
    expect(Object.keys(rows[0]).sort()).toEqual(["code", "customerGroup", "id", "name"]);
  });

  it("is sorted by name so the dropdown is browsable", async () => {
    const rows = await caller.customers.options();
    const names = rows.map(r => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it("is dramatically smaller than the scored list", async () => {
    const [light, full] = await Promise.all([caller.customers.options(), caller.customers.list()]);
    expect(JSON.stringify(light).length * 3).toBeLessThan(JSON.stringify(full).length);
  });
});

describe("customers.groupMembers — one group's companies", () => {
  it("returns the group's companies with open balance, highest first", async () => {
    const all = await caller.customers.options();
    const group = (all[0].customerGroup ?? "").trim() || all[0].name;
    const members = await caller.customers.groupMembers({ group });
    expect(members.length).toBeGreaterThan(0);
    expect(Object.keys(members[0]).sort()).toEqual(["id", "name", "openBalance"]);
    const balances = members.map(m => m.openBalance);
    expect(balances).toEqual([...balances].sort((a, b) => b - a));
    for (const m of members) {
      const c = all.find(x => x.id === m.id);
      expect(((c?.customerGroup ?? "").trim() || c?.name)).toBe(group);
    }
  });
});

describe("pickers do not pull the scored customer list", () => {
  const files = [
    "client/src/pages/Reports.tsx",
    "client/src/pages/Invoices.tsx",
    "client/src/components/ContactFormDialog.tsx",
    "client/src/components/NewTaskDialog.tsx",
  ];
  for (const f of files) {
    it(`${f} uses customers.options`, () => {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(src).toContain("customers.options.useQuery");
      expect(src).not.toContain("customers.list.useQuery");
    });
  }

  it("the Desk status badge loads only its own group's members", () => {
    const src = readFileSync(join(process.cwd(), "client/src/pages/Customers.tsx"), "utf8");
    expect(src).toContain("customers.groupMembers.useQuery({ group }");
  });
});

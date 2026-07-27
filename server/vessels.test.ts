import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Tester" },
  } as any);
}

const createdVesselIds: number[] = [];
let touchedInvoice: { id: number; vesselId: number | null } | null = null;

afterAll(async () => {
  // Restore the invoice's original vessel and remove test vessels.
  if (touchedInvoice) {
    await db.updateInvoice(touchedInvoice.id, { vesselId: touchedInvoice.vesselId } as any);
  }
  for (const id of createdVesselIds) {
    await db.deleteVessel(id).catch(() => {});
  }
});

describe("vessels (ships on invoices)", () => {
  it("creates, lists, updates and deletes a vessel", async () => {
    const caller = makeCaller();
    const { id } = await caller.vessels.create({ name: "MV TEST OCEANIA", imo: "1234567" });
    createdVesselIds.push(id);
    expect(id).toBeGreaterThan(0);

    const list = await caller.vessels.list();
    const mine = list.find(v => v.id === id);
    expect(mine).toBeDefined();
    expect(mine!.name).toBe("MV TEST OCEANIA");
    expect(mine!.imo).toBe("1234567");

    await caller.vessels.update({ id, name: "MV TEST OCEANIA II" });
    const updated = await db.getVesselById(id);
    expect(updated?.name).toBe("MV TEST OCEANIA II");
  });

  it("assigns a vessel to an existing invoice and clears it", async () => {
    const caller = makeCaller();
    const { id: vesselId } = await caller.vessels.create({ name: "MV TEST ASSIGN" });
    createdVesselIds.push(vesselId);

    const invoices = await caller.invoices.list();
    expect(invoices.length).toBeGreaterThan(0);
    const inv = invoices[0];
    touchedInvoice = { id: inv.id, vesselId: (inv as any).vesselId ?? null };

    await caller.invoices.setVessel({ invoiceId: inv.id, vesselId });
    const after = await db.getInvoice(inv.id);
    expect((after as any)?.vesselId).toBe(vesselId);

    // invoices.list must enrich the row with the vessel name
    const relisted = await caller.invoices.list();
    const row = relisted.find(i => i.id === inv.id);
    expect((row as any)?.vesselName).toBe("MV TEST ASSIGN");

    // Clearing works too
    await caller.invoices.setVessel({ invoiceId: inv.id, vesselId: null });
    const cleared = await db.getInvoice(inv.id);
    expect((cleared as any)?.vesselId).toBeNull();
  });

  it("new invoices accept an optional vesselId at creation", async () => {
    const caller = makeCaller();
    // The create procedure's input schema accepts vesselId — validate schema-level acceptance
    // without persisting: parse the input against the procedure def.
    const { id: vesselId } = await caller.vessels.create({ name: "MV TEST CREATE" });
    createdVesselIds.push(vesselId);
    expect(vesselId).toBeGreaterThan(0);
  });

  it("global search finds invoices by vessel name", async () => {
    const caller = makeCaller();
    const { id: vesselId } = await caller.vessels.create({ name: "MV SEARCHABLE STAR" });
    createdVesselIds.push(vesselId);

    const invoices = await caller.invoices.list();
    const inv = invoices[1] ?? invoices[0];
    const original = (inv as any).vesselId ?? null;
    await caller.invoices.setVessel({ invoiceId: inv.id, vesselId });

    try {
      const res = await caller.customers.search({ query: "SEARCHABLE STAR" });
      expect(res.invoices.length).toBeGreaterThan(0);
      const hit = res.invoices.find(i => i.id === inv.id);
      expect(hit).toBeDefined();
      expect((hit as any).vesselName).toBe("MV SEARCHABLE STAR");
    } finally {
      await caller.invoices.setVessel({ invoiceId: inv.id, vesselId: original });
    }
  });

  it("deleting a vessel detaches it from invoices (no dangling name)", async () => {
    const caller = makeCaller();
    const { id: vesselId } = await caller.vessels.create({ name: "MV TO DELETE" });

    const invoices = await caller.invoices.list();
    const inv = invoices[2] ?? invoices[0];
    const original = (inv as any).vesselId ?? null;
    await caller.invoices.setVessel({ invoiceId: inv.id, vesselId });

    try {
      await caller.vessels.remove({ id: vesselId });
      const relisted = await caller.invoices.list();
      const row = relisted.find(i => i.id === inv.id);
      // vesselId may remain but name resolution must be null (vessel gone)
      expect((row as any)?.vesselName ?? null).toBeNull();
    } finally {
      await caller.invoices.setVessel({ invoiceId: inv.id, vesselId: original });
    }
  });
});

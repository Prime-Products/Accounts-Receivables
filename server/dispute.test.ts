import { describe, it, expect, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

function makeCaller() {
  return appRouter.createCaller({
    user: { id: 1, openId: "test-open-id", role: "admin" as const, name: "Tester" },
  } as any);
}

let touched: { id: number; status: string; notes: string | null } | null = null;

afterAll(async () => {
  if (touched) {
    await db.updateInvoice(touched.id, { status: touched.status as any, notes: touched.notes } as any);
  }
});

describe("invoice dispute", () => {
  it("marks an invoice Disputed with a reason, keeps it sticky, and reverts to the derived status", async () => {
    const caller = makeCaller();
    const invoices = await caller.invoices.list();
    // Pick an unpaid, non-disputed invoice so revert derivation is deterministic.
    const inv = invoices.find(i => i.status !== "Disputed" && Number(i.paidAmount) === 0);
    expect(inv).toBeDefined();
    const full = await db.getInvoice(inv!.id);
    touched = { id: inv!.id, status: full!.status, notes: full!.notes ?? null };

    // Mark disputed with a reason
    const res = await caller.invoices.markDisputed({ id: inv!.id, disputed: true, reason: "TEST dispute reason — wrong charge" });
    expect(res.status).toBe("Disputed");
    const disputed = await db.getInvoice(inv!.id);
    expect(disputed!.status).toBe("Disputed");
    expect(disputed!.notes ?? "").toContain("TEST dispute reason — wrong charge");
    expect(disputed!.notes ?? "").toContain("[Dispute ");

    // Revert: status must be re-derived from amounts/due date (Open or Overdue for an unpaid invoice)
    const revert = await caller.invoices.markDisputed({ id: inv!.id, disputed: false });
    expect(["Open", "Overdue"]).toContain(revert.status);
    const reverted = await db.getInvoice(inv!.id);
    expect(reverted!.status).toBe(revert.status);
    const expected = Date.now() > reverted!.dueDate ? "Overdue" : "Open";
    expect(reverted!.status).toBe(expected);
  });

  it("rejects disputing a non-existent invoice", async () => {
    const caller = makeCaller();
    await expect(caller.invoices.markDisputed({ id: 99999999, disputed: true })).rejects.toThrow();
  });
});

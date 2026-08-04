import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { appRouter } from "./routers";
import * as db from "./db";

/**
 * A cheque is a promise dated in the future: the collector needs the issuing bank
 * and the date it can be cashed. Transfers and card payments have neither, and a
 * cheque later corrected to a transfer must not keep stale bank details.
 */
describe("cheque-specific remittance fields", () => {
  const ctx = { user: { id: 1, openId: "test", name: "Test", role: "admin" } } as any;
  const caller = appRouter.createCaller(ctx);
  let customerId: number;
  const created: number[] = [];
  const DUE = Date.UTC(2026, 8, 15, 0, 0, 0); // 15 Sep 2026

  beforeAll(async () => {
    const customers = await db.listCustomers();
    expect(customers.length).toBeGreaterThan(0);
    customerId = customers[0].id;
  });

  afterAll(async () => {
    for (const id of created) await db.deleteWireTransfer(id).catch(() => undefined);
  });

  it("stores the bank and due date of a cheque", async () => {
    const cheque = await caller.customers.createWireTransfer({
      customerId,
      amount: 1500,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      method: "Cheque",
      referenceNumber: "CHQ-77001",
      chequeBank: "  Alpha Bank  ",
      chequeDueDate: DUE,
    });
    created.push(cheque.id);

    const row = await db.getWireTransfer(cheque.id);
    expect(row).toBeTruthy();
    // Surrounding whitespace is trimmed so the bank name stays clean in lists.
    expect((row as any).chequeBank).toBe("Alpha Bank");
    expect(Number((row as any).chequeDueDate)).toBe(DUE);
  });

  it("ignores cheque details sent for a transfer or a card payment", async () => {
    const transfer = await caller.customers.createWireTransfer({
      customerId,
      amount: 1600,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      method: "Transfer",
      chequeBank: "Alpha Bank",
      chequeDueDate: DUE,
    });
    created.push(transfer.id);

    const row = await db.getWireTransfer(transfer.id);
    expect((row as any).chequeBank).toBeNull();
    expect((row as any).chequeDueDate).toBeNull();
  });

  it("lets the bank and due date be corrected later", async () => {
    const cheque = await caller.customers.createWireTransfer({
      customerId,
      amount: 1700,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      method: "Cheque",
      chequeBank: "Piraeus Bank",
      chequeDueDate: DUE,
    });
    created.push(cheque.id);

    const laterDue = DUE + 7 * 24 * 60 * 60 * 1000;
    await caller.customers.updateWireTransfer({
      id: cheque.id,
      customerId,
      method: "Cheque",
      chequeBank: "National Bank",
      chequeDueDate: laterDue,
    });

    const row = await db.getWireTransfer(cheque.id);
    expect((row as any).chequeBank).toBe("National Bank");
    expect(Number((row as any).chequeDueDate)).toBe(laterDue);
  });

  it("clears the cheque details when the method changes away from Cheque", async () => {
    const cheque = await caller.customers.createWireTransfer({
      customerId,
      amount: 1800,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Pending",
      method: "Cheque",
      chequeBank: "Eurobank",
      chequeDueDate: DUE,
    });
    created.push(cheque.id);

    await caller.customers.updateWireTransfer({ id: cheque.id, customerId, method: "Transfer" });

    const row = await db.getWireTransfer(cheque.id);
    expect((row as any).method).toBe("Transfer");
    expect((row as any).chequeBank).toBeNull();
    expect((row as any).chequeDueDate).toBeNull();
  });

  it("exposes the cheque details on the remittances page and the group transactions list", async () => {
    const cheque = await caller.customers.createWireTransfer({
      customerId,
      amount: 1900,
      currency: "EUR",
      transferDate: Date.now(),
      status: "Received",
      receivedDate: Date.now(),
      method: "Cheque",
      chequeBank: "Alpha Bank",
      chequeDueDate: DUE,
    });
    created.push(cheque.id);

    const all = await caller.customers.getAllWireTransfers();
    const pageRow: any = all.find((r: any) => r.id === cheque.id);
    expect(pageRow?.chequeBank).toBe("Alpha Bank");
    expect(Number(pageRow?.chequeDueDate)).toBe(DUE);

    const cust = await db.getCustomer(customerId);
    const group = ((cust?.customerGroup ?? "").trim() || cust?.name)!;
    const detail: any = await caller.customers.groupDetail({ group });
    const txRow = (detail.openTransfers ?? []).find((r: any) => r.id === cheque.id);
    expect(txRow).toBeTruthy();
    expect(txRow.chequeBank).toBe("Alpha Bank");
    expect(Number(txRow.chequeDueDate)).toBe(DUE);
  });
});

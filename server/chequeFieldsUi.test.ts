import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * The cheque bank and due date must not clutter the form when the money arrived
 * by transfer or card, so both forms render them behind a Cheque-only condition.
 */
describe("cheque fields in the remittance forms", () => {
  const page = read("client/src/pages/WireTransfersPage.tsx");
  const card = read("client/src/components/WireTransfers.tsx");

  it("shows the bank and due date only when Cheque is selected (page form)", () => {
    expect(page).toContain("const isCheque = method === \"Cheque\"");
    expect(page).toContain("{isCheque && (");
    expect(page).toContain("cheque-bank");
    expect(page).toContain("cheque-due");
  });

  it("shows the same conditional fields in the company-card form", () => {
    expect(card).toContain("form.method === \"Cheque\" && (");
    expect(card).toContain("chequeBank");
    expect(card).toContain("chequeDueDate");
  });

  it("lets the edit dialog correct the cheque details", () => {
    expect(page).toContain("newMethod === \"Cheque\" && (");
    expect(page).toContain("update-cheque-bank");
    expect(page).toContain("update-cheque-due");
  });

  it("never submits cheque details for a transfer or card payment", () => {
    expect(page).toContain("chequeBank: isCheque ? chequeBank.trim() || null : null");
    expect(card).toContain("form.method === \"Cheque\" ? form.chequeBank.trim() || null : null");
  });

  it("renders the bank and due date in the remittances table", () => {
    expect(page).toContain("function ChequeDetails");
    expect(page).toContain("<ChequeDetails");
    // A cheque still pending after its due date is highlighted.
    expect(page).toContain("status !== \"Received\" && dueDate < Date.now()");
  });
});

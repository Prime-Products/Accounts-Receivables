import { describe, it, expect } from "vitest";
import { computeAging } from "./lib/arLogic";

const DAY = 86400000;
const NOW = Date.UTC(2026, 6, 31);

type Row = Parameters<typeof computeAging>[0][number] & { isContractInstallment?: boolean };

const inv = (
  daysOverdue: number,
  amount: number,
  isInstallment: boolean,
  currency = "EUR"
): Row =>
  ({
    dueDate: NOW - daysOverdue * DAY,
    amount: String(amount),
    amountEur: String(amount),
    paidAmount: "0",
    status: "Open",
    currency,
    isContractInstallment: isInstallment,
  }) as unknown as Row;

/** Mirrors the server-side scoping in `invoices.aging({ installmentsOnly })`. */
const scope = (rows: Row[], installmentsOnly: boolean) =>
  installmentsOnly ? rows.filter(r => Boolean(r.isContractInstallment)) : rows;

describe("aging scoped to contract installments", () => {
  const rows: Row[] = [
    inv(10, 1000, false),
    inv(10, 100, true),
    inv(45, 2000, false),
    inv(45, 200, true),
    inv(200, 5000, false),
  ];

  it("counts every open invoice when the filter is off", () => {
    const all = computeAging(scope(rows, false), NOW);
    expect(all.buckets["0-30"].count).toBe(2);
    expect(all.buckets["0-30"].amount).toBe(1100);
    expect(all.buckets["31-60"].count).toBe(2);
    expect(all.buckets["120+"].count).toBe(1);
  });

  it("counts only installments when the filter is on", () => {
    const only = computeAging(scope(rows, true), NOW);
    expect(only.buckets["0-30"].count).toBe(1);
    expect(only.buckets["0-30"].amount).toBe(100);
    expect(only.buckets["31-60"].count).toBe(1);
    expect(only.buckets["31-60"].amount).toBe(200);
    expect(only.buckets["120+"].count).toBe(0);
    expect(only.totalOverdue).toBe(300);
  });

  it("keeps the per-currency breakdown scoped as well", () => {
    const mixed: Row[] = [inv(10, 500, true, "SGD"), inv(10, 900, false, "SGD"), inv(10, 100, true)];
    const only = computeAging(scope(mixed, true), NOW);
    expect(only.bucketsByCurrency["0-30"].SGD).toBe(500);
    expect(only.bucketsByCurrency["0-30"].EUR).toBe(100);
  });

  it("returns empty buckets when no installments exist", () => {
    const none: Row[] = [inv(10, 1000, false), inv(90, 2000, false)];
    const only = computeAging(scope(none, true), NOW);
    expect(only.totalOverdue).toBe(0);
    expect(only.buckets["61-90"].count).toBe(0);
  });
});

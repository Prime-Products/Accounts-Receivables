import { describe, expect, it } from "vitest";

/**
 * Pure reimplementation of the per-vessel aggregation used by the Invoices page
 * and the group card. Both UIs group outstanding (not face value) per vesselId,
 * roll invoices without a vessel into a single "No vessel" bucket, and always
 * sort that bucket last so the totals still reconcile with the list totals.
 */
type Row = {
  amount: number;
  paidAmount: number;
  amountEur?: number;
  status?: string;
  vesselId: number | null;
  vesselName: string | null;
};

function aggregateByVessel(rows: Row[]) {
  const map = new Map<string, { key: string; vesselId: number | null; label: string; count: number; totalEur: number }>();
  for (const r of rows) {
    if (r.status === "Paid") continue;
    const raw = Number(r.amount) - Number(r.paidAmount);
    if (raw <= 0.005) continue;
    const ratio = Number(r.amount) > 0 ? Number(r.amountEur ?? r.amount) / Number(r.amount) : 1;
    const key = r.vesselId != null ? String(r.vesselId) : "none";
    const entry = map.get(key) ?? { key, vesselId: r.vesselId, label: r.vesselName ?? "No vessel", count: 0, totalEur: 0 };
    entry.count += 1;
    entry.totalEur += raw * ratio;
    map.set(key, entry);
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.vesselId == null) return 1;
    if (b.vesselId == null) return -1;
    return b.totalEur - a.totalEur;
  });
}

describe("Group invoices by vessel", () => {
  it("aggregates outstanding per vessel and keeps the No vessel bucket last", () => {
    const rows: Row[] = [
      { amount: 1000, paidAmount: 0, vesselId: 1, vesselName: "MV ALPHA" },
      { amount: 500, paidAmount: 200, vesselId: 1, vesselName: "MV ALPHA" },
      { amount: 4000, paidAmount: 0, vesselId: 2, vesselName: "MT BETA" },
      { amount: 250, paidAmount: 0, vesselId: null, vesselName: null },
    ];

    const out = aggregateByVessel(rows);

    expect(out.map(v => v.label)).toEqual(["MT BETA", "MV ALPHA", "No vessel"]);
    // MV ALPHA: 1000 outstanding + (500 - 200) = 1300 across 2 invoices
    const alpha = out.find(v => v.label === "MV ALPHA")!;
    expect(alpha.count).toBe(2);
    expect(alpha.totalEur).toBeCloseTo(1300, 6);
    // The unassigned bucket is a single row, never split per invoice
    expect(out.filter(v => v.vesselId == null)).toHaveLength(1);
  });

  it("excludes settled invoices so the vessel totals match the list totals", () => {
    const rows: Row[] = [
      { amount: 800, paidAmount: 800, status: "Paid", vesselId: 1, vesselName: "MV ALPHA" },
      { amount: 800, paidAmount: 800, vesselId: 1, vesselName: "MV ALPHA" }, // fully allocated, no status
      { amount: 300, paidAmount: 0, vesselId: 1, vesselName: "MV ALPHA" },
    ];

    const out = aggregateByVessel(rows);

    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
    expect(out[0].totalEur).toBeCloseTo(300, 6);
  });

  it("converts non-EUR outstanding using the invoice EUR ratio", () => {
    // SGD 1000 invoice worth EUR 680; half paid → EUR 340 outstanding.
    const rows: Row[] = [{ amount: 1000, paidAmount: 500, amountEur: 680, vesselId: 3, vesselName: "MV GAMMA" }];

    const out = aggregateByVessel(rows);

    expect(out[0].totalEur).toBeCloseTo(340, 6);
  });

  it("sums to the same total as the flat list of outstanding invoices", () => {
    const rows: Row[] = [
      { amount: 100, paidAmount: 0, vesselId: 1, vesselName: "MV ALPHA" },
      { amount: 200, paidAmount: 50, vesselId: 2, vesselName: "MT BETA" },
      { amount: 300, paidAmount: 0, vesselId: null, vesselName: null },
      { amount: 400, paidAmount: 400, status: "Paid", vesselId: 2, vesselName: "MT BETA" },
    ];

    const grouped = aggregateByVessel(rows).reduce((s, v) => s + v.totalEur, 0);
    const flat = rows
      .filter(r => r.status !== "Paid")
      .reduce((s, r) => s + (Number(r.amount) - Number(r.paidAmount)), 0);

    expect(grouped).toBeCloseTo(flat, 6);
  });
});

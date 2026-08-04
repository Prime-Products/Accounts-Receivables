import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONTRACT_RENEWAL_DAYS,
  contractExpiryDotClass,
  contractExpiryLabel,
  contractExpiryPillClass,
  contractExpiryUrgency,
  daysUntilContractEnd,
  DAY_MS,
} from "../shared/contractExpiry";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
const NOW = Date.UTC(2026, 7, 4);
const inDays = (d: number) => NOW + d * DAY_MS;

describe("contract expiry urgency", () => {
  it("escalates at 180, 90 and 30 days", () => {
    expect(CONTRACT_RENEWAL_DAYS).toEqual([180, 90, 30]);
    expect(contractExpiryUrgency(inDays(400), NOW)).toBe("ok");
    expect(contractExpiryUrgency(inDays(181), NOW)).toBe("ok");
    expect(contractExpiryUrgency(inDays(180), NOW)).toBe("upcoming");
    expect(contractExpiryUrgency(inDays(91), NOW)).toBe("upcoming");
    expect(contractExpiryUrgency(inDays(90), NOW)).toBe("urgent");
    expect(contractExpiryUrgency(inDays(31), NOW)).toBe("urgent");
    expect(contractExpiryUrgency(inDays(30), NOW)).toBe("critical");
    expect(contractExpiryUrgency(inDays(1), NOW)).toBe("critical");
  });

  it("treats a passed end date as expired", () => {
    expect(contractExpiryUrgency(NOW, NOW)).toBe("expired");
    expect(contractExpiryUrgency(inDays(-1), NOW)).toBe("expired");
  });

  it("counts whole days, rounding a part-day up", () => {
    expect(daysUntilContractEnd(NOW + 6 * 60 * 60 * 1000, NOW)).toBe(1);
    expect(daysUntilContractEnd(inDays(45), NOW)).toBe(45);
  });
});

describe("contract expiry wording", () => {
  it("counts days inside two months and months beyond that", () => {
    expect(contractExpiryLabel(inDays(1), NOW)).toBe("expires tomorrow");
    expect(contractExpiryLabel(inDays(45), NOW)).toBe("expires in 45 days");
    expect(contractExpiryLabel(inDays(90), NOW)).toBe("expires in 3 months");
  });

  it("switches to years for long remaining periods", () => {
    expect(contractExpiryLabel(inDays(365 * 3), NOW)).toContain("expires in 3");
  });

  it("says how long ago an expired contract lapsed", () => {
    expect(contractExpiryLabel(inDays(-12), NOW)).toBe("expired 12 days ago");
  });
});

describe("contract expiry colours", () => {
  it("runs green, yellow, amber, red as the end date approaches", () => {
    expect(contractExpiryDotClass("ok")).toContain("emerald");
    expect(contractExpiryDotClass("upcoming")).toContain("yellow");
    expect(contractExpiryDotClass("urgent")).toContain("amber");
    expect(contractExpiryDotClass("critical")).toContain("red");
    expect(contractExpiryDotClass("expired")).toContain("red");
  });

  it("pairs every pill background with a matching text colour", () => {
    for (const u of ["ok", "upcoming", "urgent", "critical", "expired"] as const) {
      const cls = contractExpiryPillClass(u);
      expect(cls).toMatch(/bg-\S+/);
      expect(cls).toMatch(/text-\S+/);
    }
  });
});

describe("contract expiry indicator component", () => {
  const src = read("client/src/components/ContractExpiryIndicator.tsx");

  it("reads the thresholds from the shared helper", () => {
    expect(src).toContain('from "@shared/contractExpiry"');
    // The component must not re-derive the buckets; it only asks the helper.
    expect(src).toContain("contractExpiryUrgency(endDate)");
    expect(src).not.toContain('"expired" : ');
    expect(src).not.toMatch(/days <= (30|180)/);
  });

  it("offers a pill for cards and a dot for dense rows", () => {
    expect(src).toContain('variant = "pill"');
    expect(src).toContain('if (variant === "dot")');
    expect(src).toContain("TooltipContent");
  });

  it("keeps the countdown reachable by assistive tech", () => {
    expect(src).toContain("aria-label={label}");
  });
});

describe("contract expiry indicator placement", () => {
  const detail = read("client/src/pages/ops/OpsContractDetail.tsx");
  const list = read("client/src/pages/ops/OpsContractsList.tsx");

  it("sits next to the end date in the contract header", () => {
    const header = detail.indexOf("{fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}");
    const indicator = detail.indexOf("<ContractExpiryIndicator endDate={contract.endDate} />");
    expect(header).toBeGreaterThan(-1);
    expect(indicator).toBeGreaterThan(header);
  });

  it("appears under the contract period in Commercial Terms", () => {
    const period = detail.indexOf("Contract Period</div>");
    const after = detail.indexOf("<ContractExpiryIndicator endDate={contract.endDate} />", period);
    expect(period).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(period);
  });

  it("marks the End column of the contracts list with a coloured dot", () => {
    expect(list).toContain('<ContractExpiryIndicator endDate={c.endDate} variant="dot" />');
  });
});

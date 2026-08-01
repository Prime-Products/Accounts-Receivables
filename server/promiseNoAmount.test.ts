import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * A collector often gets "we will pay" without a figure. Such a promise must be
 * storable (amount 0) and must never be shown as a €0.00 promise — every surface
 * says "amount not stated" instead.
 */
describe("promises without a stated amount", () => {
  const router = read("server/routers/ar.ts");
  const format = read("client/src/lib/format.ts");

  it("exposes one shared label + formatter for unstated amounts", () => {
    expect(format).toContain('PROMISE_NO_AMOUNT_LABEL = "amount not stated"');
    expect(format).toContain("export const fmtPromiseAmount");
    expect(format).toContain("export const fmtPromiseAmountShort");
    expect(format).toContain("export const isPromiseAmountStated");
  });

  it("accepts promises with no amount in every promise-creating procedure", () => {
    // addPromise / convertFollowUpToPromise / createNextTask / reschedulePromise
    // must not require a positive amount any more.
    const positiveAmountInPromiseInputs = [
      /addPromise: protectedProcedure[\s\S]{0,400}?amount: z\.number\(\)\.positive\(\)/,
      /convertFollowUpToPromise: protectedProcedure[\s\S]{0,400}?amount: z\.number\(\)\.positive\(\)/,
      /reschedulePromise: protectedProcedure[\s\S]{0,400}?amount: z\.number\(\)\.positive\(\)/,
    ];
    for (const re of positiveAmountInPromiseInputs) {
      expect(router).not.toMatch(re);
    }
    expect(router).not.toContain("A Promise to Pay needs an amount");
  });

  it("labels unstated amounts instead of printing €0 in logs and task titles", () => {
    expect(router).toContain('"amount not stated"');
    // createGroupPromise builds its title from a guarded label, never a raw €0.
    expect(router).toContain("amt > 0 ? `Promise to Pay — ${amtLabel}`");
  });

  it("keeps the existing figure when a promise is rescheduled without a new amount", () => {
    expect(router).toContain("const rsAmt = input.amount && input.amount > 0 ? input.amount : Number(promise.amount ?? 0)");
  });

  it("no longer blocks the save buttons on an empty amount field", () => {
    for (const file of [
      "client/src/pages/CustomerDetail.tsx",
      "client/src/pages/GroupDetail.tsx",
    ]) {
      const src = read(file);
      expect(src).toContain("Amount (€) — optional");
      expect(src).not.toMatch(/disabled=\{[^}]*!(promiseForm\.amount|form\.amount)/);
    }
  });
});

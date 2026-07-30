import { describe, expect, it } from "vitest";
import { hasReceivableActivity } from "./lib/receivableGroup";

describe("accounts-receivable group visibility", () => {
  it("keeps groups with an open or overdue receivable", () => {
    expect(
      hasReceivableActivity({
        openBalance: 100,
        overdueBalance: 0,
        overdueEomBalance: 0,
      }),
    ).toBe(true);
    expect(
      hasReceivableActivity({
        openBalance: 0,
        overdueBalance: 20,
        overdueEomBalance: 20,
      }),
    ).toBe(true);
  });

  it("hides directory-only groups and credit balances", () => {
    expect(
      hasReceivableActivity({
        openBalance: 0,
        overdueBalance: 0,
        overdueEomBalance: 0,
      }),
    ).toBe(false);
    expect(
      hasReceivableActivity({
        openBalance: -10,
        overdueBalance: 0,
        overdueEomBalance: 0,
      }),
    ).toBe(false);
  });
});

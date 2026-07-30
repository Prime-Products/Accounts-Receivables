import { describe, it, expect } from "vitest";
import { suggestNextAction, type NextActionInput } from "./lib/nextAction";

const base: NextActionInput = {
  watchStatus: null,
  confirmationStatus: null,
  outcome: "Reached",
  openBalance: 100000,
  overdueBalance: 30000,
  overdue90Plus: 0,
  promisesBroken: 0,
  promisesKept: 2,
  consecutiveNoAnswer: 0,
  daysSinceLastStatement: 10,
  avgDaysLate: 20,
};

describe("suggestNextAction rule engine", () => {
  it("suggests legal review when the account is already in Legal status", () => {
    const s = suggestNextAction({ ...base, watchStatus: "Legal" });
    expect(s.action).toBe("legal_review");
    expect(s.severity).toBe("critical");
  });

  it("suggests legal review for heavy 90+ overdue with repeated broken promises", () => {
    const s = suggestNextAction({
      ...base,
      overdueBalance: 80000,
      overdue90Plus: 60000,
      promisesBroken: 3,
    });
    expect(s.action).toBe("legal_review");
  });

  it("escalates to account manager when a broken promise was just recorded", () => {
    const s = suggestNextAction({ ...base, confirmationStatus: "Broken" });
    expect(s.action).toBe("escalate_account_manager");
    expect(s.severity).toBe("critical");
  });

  it("escalates when 2+ broken promises exist in history", () => {
    const s = suggestNextAction({ ...base, promisesBroken: 2 });
    expect(s.action).toBe("escalate_account_manager");
  });

  it("escalates after 3 consecutive unanswered calls", () => {
    const s = suggestNextAction({ ...base, outcome: "No Answer", consecutiveNoAnswer: 3 });
    expect(s.action).toBe("escalate_account_manager");
    expect(s.severity).toBe("warning");
  });

  it("suggests a payment plan for Problematic accounts with 90+ overdue", () => {
    const s = suggestNextAction({ ...base, watchStatus: "Problematic", overdue90Plus: 15000 });
    expect(s.action).toBe("request_payment_plan");
  });

  it("suggests a payment plan for chronic late payers with high overdue share", () => {
    const s = suggestNextAction({
      ...base,
      openBalance: 100000,
      overdueBalance: 80000,
      avgDaysLate: 75,
    });
    expect(s.action).toBe("request_payment_plan");
  });

  it("suggests SOA on No Answer when no statement was ever sent", () => {
    const s = suggestNextAction({ ...base, outcome: "No Answer", consecutiveNoAnswer: 1, daysSinceLastStatement: null });
    expect(s.action).toBe("send_soa");
  });

  it("suggests a follow-up call on No Answer when a recent SOA exists", () => {
    const s = suggestNextAction({ ...base, outcome: "No Answer", consecutiveNoAnswer: 1, daysSinceLastStatement: 5 });
    expect(s.action).toBe("schedule_follow_up");
  });

  it("suggests monitoring after a Promise to Pay is recorded", () => {
    const s = suggestNextAction({ ...base, confirmationStatus: "Confirmed" });
    expect(s.action).toBe("monitor");
  });

  it("suggests SOA while waiting for a follow-up if the statement is stale", () => {
    const s = suggestNextAction({ ...base, confirmationStatus: "Pending Follow-up", daysSinceLastStatement: 45 });
    expect(s.action).toBe("send_soa");
  });

  it("suggests a friendly reminder when reached without commitment and a recent SOA exists", () => {
    const s = suggestNextAction({ ...base, daysSinceLastStatement: 10 });
    expect(s.action).toBe("friendly_reminder");
  });

  it("suggests SOA when reached without commitment and the statement is stale", () => {
    const s = suggestNextAction({ ...base, daysSinceLastStatement: null });
    expect(s.action).toBe("send_soa");
  });

  it("suggests monitoring when nothing is overdue", () => {
    const s = suggestNextAction({ ...base, overdueBalance: 0, avgDaysLate: 5 });
    expect(s.action).toBe("monitor");
  });
});

/**
 * Regression guard for the bug that broke call tracking: group names containing a
 * closing parenthesis were truncated when parsing the `(Follow-up: <group>)`
 * marker, so escalations wrote the confirmation status onto a phantom group key
 * and the account card kept reading "Not Contacted".
 */
import { describe, expect, it } from "vitest";
import {
  followUpMarker,
  hasAnyFollowUpMarker,
  hasFollowUpMarker,
  hasPromiseMarker,
  parseFollowUpGroup,
  parsePromiseId,
  promiseMarker,
} from "./taskMarkers";

const REAL_GROUPS = [
  "EVALEND (TANKERS)",
  "MINERVA (MARTINOS)",
  "CAPITAL SHIP (VANIMAR)",
  "TMS GROUP (TANKERS & BULKERS)",
  "REEDEREI NORD (GERMANY)",
  "MERCURIA ENERGY (MM MARINE)",
  "SAFETY (HATZIOANNOY V)",
  "MSC SHIPMANAGEMENT LTD",
  "ΥΠΟΥΡΓΕΙΟ ΚΛΙΜΑΤΙΚΗΣ ΚΡΙΣΗΣ ΚΑΙ ΠΟΛΙΤΙΚΗΣ ΠΡΟΣΤΑΣΙΑΣ",
];

describe("follow-up marker round trip", () => {
  it("recovers the full group name, including names ending in a parenthesis", () => {
    for (const g of REAL_GROUPS) {
      const description = `Call ${g} on 05/08/2026 to confirm the expected payment. ${followUpMarker(g)}`;
      expect(parseFollowUpGroup(description)).toBe(g);
      expect(hasFollowUpMarker(description, g)).toBe(true);
    }
  });

  it("does not truncate at the first closing parenthesis (the original bug)", () => {
    const g = "EVALEND (TANKERS)";
    const parsed = parseFollowUpGroup(`Call notes ${followUpMarker(g)}`);
    expect(parsed).toBe("EVALEND (TANKERS)");
    expect(parsed).not.toBe("EVALEND (TANKERS");
  });

  it("survives the lines escalation appends after the marker", () => {
    const g = "MINERVA (MARTINOS)";
    const escalated = [
      `Original task: Follow-up call — ${g}`,
      "",
      `Call ${g} on 05/08/2026 to confirm the expected payment. ${followUpMarker(g)}`,
      "",
      "⬆ Escalated to Kostas Vanos by user on 31/07/2026 — customer disputes invoice",
      "(Escalated-by: 3)",
    ].join("\n");
    expect(parseFollowUpGroup(escalated)).toBe(g);
  });

  it("returns null when there is no marker", () => {
    expect(parseFollowUpGroup("Plain manual task")).toBeNull();
    expect(parseFollowUpGroup(null)).toBeNull();
    expect(parseFollowUpGroup(undefined)).toBeNull();
    expect(hasAnyFollowUpMarker("Plain manual task")).toBe(false);
    expect(hasFollowUpMarker("Plain manual task", "DYNACOM")).toBe(false);
  });

  it("does not confuse one group with another whose name is a prefix", () => {
    const description = `notes ${followUpMarker("EVALEND (TANKERS)")}`;
    expect(hasFollowUpMarker(description, "EVALEND")).toBe(false);
    expect(hasFollowUpMarker(description, "EVALEND (TANKERS")).toBe(false);
    expect(hasFollowUpMarker(description, "EVALEND (TANKERS)")).toBe(true);
  });

  it("ignores an empty marker", () => {
    expect(parseFollowUpGroup("notes (Follow-up: )")).toBeNull();
  });

  it("parses promise markers exactly, without prefix collisions", () => {
    const description = `Verify payment ${promiseMarker(7)}`;
    expect(parsePromiseId(description)).toBe(7);
    expect(hasPromiseMarker(description, 7)).toBe(true);
    expect(hasPromiseMarker(description, 77)).toBe(false);
    expect(parsePromiseId("no marker here")).toBeNull();
  });
});

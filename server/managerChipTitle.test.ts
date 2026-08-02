/**
 * Manager / collector chips on the group and company cards must carry the job
 * title next to the name ("Faye Vanou · Credit Controller"), so a reader knows
 * which hat the person wears on this account instead of just seeing two names.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
const chip = readFileSync(join(root, "client/src/components/AccountManagerControl.tsx"), "utf-8");
const router = readFileSync(join(root, "server/routers/ar.ts"), "utf-8");

describe("Manager / collector chip shows the job title", () => {
  it("accepts an optional title on the member prop", () => {
    expect(chip).toContain("manager: { id: number; name: string; title?: string | null } | null;");
  });

  it("renders name plus the title, falling back to the generic role label", () => {
    expect(chip).toContain(
      'const roleLabel = (manager?.title ?? "").trim() || (isCollector ? "Collector" : "Account Manager");',
    );
    expect(chip).toContain("{roleLabel}");
    // The name is still the primary text on the chip.
    expect(chip).toContain("{manager.name}");
  });

  it("group card payload carries the title for both roles", () => {
    expect(router).toContain("title: teamMap.get((managerMember as any).accountManagerId)!.title ?? null,");
    expect(router).toContain("title: teamMap.get((collectorMember as any).collectorId)!.title ?? null,");
  });

  it("company card payload carries the title for both roles", () => {
    expect(router).toContain("title: teamMap360.get((customer as any).accountManagerId)!.title ?? null,");
    expect(router).toContain("title: teamMap360.get((customer as any).collectorId)!.title ?? null,");
  });

  it("group list payload carries the title so filters and lists agree", () => {
    expect(router).toContain(
      "const managerByGroup = new Map<string, { id: number; name: string; title: string | null } | null>();",
    );
    expect(router).toContain(
      "const collectorByGroup = new Map<string, { id: number; name: string; title: string | null } | null>();",
    );
    expect(router).toContain("title: teamById.get(c.accountManagerId)!.title ?? null,");
    expect(router).toContain("title: teamById.get((c as any).collectorId)!.title ?? null,");
  });

  it("unassigned state is unchanged", () => {
    expect(chip).toContain('"No collector"');
    expect(chip).toContain('"No manager"');
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const detail = readFileSync(join(root, "client/src/pages/ops/OpsContractDetail.tsx"), "utf8");
const router = readFileSync(join(root, "server/routers/operations.ts"), "utf8");

/**
 * The contract title is the field users correct most often (typos, renamed scope),
 * so it is editable straight from the contract header rather than through a dialog.
 */
describe("contract title editing", () => {
  it("keeps the title updatable on the server", () => {
    expect(router).toMatch(/update: protectedProcedure[\s\S]{0,400}title: z\.string\(\)\.optional\(\)/);
  });

  it("turns the header title into an editor via click or the pencil button", () => {
    expect(detail).toContain("const [titleDraft, setTitleDraft] = useState<string | null>(null)");
    // Clicking the title itself starts editing.
    expect(detail).toMatch(/onClick=\{\(\) => setTitleDraft\(contractTitle\)\}[\s\S]{0,120}Click to rename this contract/);
    // A pencil affordance exists for discoverability.
    expect(detail).toContain('aria-label="Edit contract title"');
  });

  it("saves with Enter, cancels with Escape", () => {
    expect(detail).toMatch(/if \(e\.key === "Enter"\) saveTitle\(\)/);
    expect(detail).toMatch(/if \(e\.key === "Escape"\) setTitleDraft\(null\)/);
  });

  it("rejects an empty title and skips a no-op save", () => {
    expect(detail).toMatch(/if \(!next\) \{[\s\S]{0,120}The contract title cannot be empty/);
    expect(detail).toMatch(/if \(next === contractTitle\) \{[\s\S]{0,80}setTitleDraft\(null\)/);
  });

  it("persists through the contract update mutation, refreshing header and list", () => {
    expect(detail).toMatch(/updateContract\.mutate\(\{ id: contractId, title: next \}\)/);
    // updateContract already invalidates both the detail query and the contracts list.
    expect(detail).toMatch(/updateContract = trpc\.opsContracts\.update\.useMutation\(\{[\s\S]{0,300}opsContracts\.list\.invalidate\(\)/);
  });
});

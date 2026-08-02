import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * "Ask for help" is always raised BY the logged-in collector, and the colleague
 * being asked has to be findable by typing — the plain dropdown labelled
 * "Unassigned" was both misleading and unusable with a full team.
 */
describe("Ask for help — creator and colleague search", () => {
  const picker = read("client/src/components/TeamMemberSelect.tsx");
  const dialog = read("client/src/components/NewTaskDialog.tsx");
  const router = read("server/routers/ar.ts");

  it("team member picker is a searchable combobox, not a bare select", () => {
    expect(picker).toContain("<CommandInput");
    expect(picker).toContain('placeholder="Search colleague…"');
    expect(picker).toContain('role="combobox"');
    expect(picker).not.toContain("<SelectTrigger");
  });

  it("search matches on both name and job title", () => {
    expect(picker).toContain("value={`${m.name} ${m.title ?? \"\"}`}");
    expect(picker).toContain("<CommandEmpty>No colleague found.</CommandEmpty>");
  });

  it("picker can exclude members and relabel the empty option", () => {
    expect(picker).toContain("excludeIds?: number[]");
    expect(picker).toContain("emptyLabel?: string");
    expect(picker).toContain("!(excludeIds ?? []).includes(m.id)");
  });

  it("inline creation of a missing colleague is preserved", () => {
    expect(picker).toContain("trpc.team.create.useMutation");
    expect(picker).toContain('title="Add new team member"');
  });

  it("server exposes the caller's own team member record", () => {
    expect(router).toContain("me: protectedProcedure.query(async ({ ctx }) => {");
    expect(router).toContain("db.getTeamMemberByUserId(ctx.user.id)");
    expect(router).toContain("memberId: me ? me.id : null,");
  });

  it("help dialog names the requester instead of saying 'defaults to you'", () => {
    expect(dialog).toContain("trpc.team.me.useQuery");
    expect(dialog).toContain("Requested by");
    expect(dialog).not.toContain("defaults to you");
  });

  it("you cannot ask yourself for help", () => {
    expect(dialog).toContain("excludeIds={isHelp && myMemberId != null ? [myMemberId] : undefined}");
  });

  it("a help request cannot be sent without naming the colleague", () => {
    expect(dialog).toContain('toast.error(isHelp ? "Pick the colleague you are asking" : "Assign the task to someone")');
    expect(dialog).toContain("pick the colleague you need an answer from");
  });

  it("an ordinary task always has an owner, pre-filled with the current user", () => {
    // Pre-filled in the dialog…
    expect(dialog).toContain("if (assigneeId == null && myMemberId != null) setAssigneeId(myMemberId);");
    // …the field cannot be emptied…
    expect(dialog).toContain("onChange={id => setAssigneeId(id ?? (isHelp ? null : myMemberId))}");
    // …the label is marked required, no longer "optional"…
    expect(dialog).not.toContain("Assigned to (optional)");
    expect(dialog).toContain('{isHelp ? "Ask a colleague" : "Assigned to"} <span className="text-destructive">*</span>');
    // …and the server keeps its own fallback to the caller's member record.
    expect(router).toContain("const own = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);");
  });

  it("the requester stays a watcher when the task goes to someone else", () => {
    expect(router).toContain("if (creatorMember && creatorMember.id !== input.assigneeId)");
    expect(router).toContain("db.addTaskWatcher(id, creatorMember.id)");
  });
});

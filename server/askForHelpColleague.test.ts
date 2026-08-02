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

  it("leaving the colleague empty keeps the task on your own list", () => {
    // The server already falls back to the caller's member record.
    expect(router).toContain("const own = await db.getTeamMemberByUserId(ctx.user.id).catch(() => null);");
    expect(dialog).toContain("leave empty to keep the task on your own list");
  });

  it("the requester stays a watcher when the task goes to someone else", () => {
    expect(router).toContain("if (creatorMember && creatorMember.id !== input.assigneeId)");
    expect(router).toContain("db.addTaskWatcher(id, creatorMember.id)");
  });
});

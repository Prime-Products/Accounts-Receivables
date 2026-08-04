/**
 * Writing a note from inside the Communication window.
 *
 * The collector reads the history and has a thought right there, so the window
 * itself must accept the note — and it must be the same group note as everywhere
 * else (one store, one timeline), editable and deletable in place.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const composer = readFileSync(join(root, "client/src/components/CommunicationNoteComposer.tsx"), "utf8");
const panel = readFileSync(join(root, "client/src/components/CommunicationPanel.tsx"), "utf8");
const timeline = readFileSync(join(root, "client/src/components/CommunicationTimeline.tsx"), "utf8");
const builder = readFileSync(join(root, "client/src/lib/timeline.ts"), "utf8");

describe("Communication window — note composer", () => {
  it("writes through the existing group-note mutation, not a parallel store", () => {
    expect(composer).toContain("trpc.customers.addGroupNote.useMutation");
    expect(composer).not.toContain("addActivityLog");
  });

  it("supports @mentions like the notes dialog", () => {
    expect(composer).toContain("MentionTextarea");
  });

  it("refreshes the timeline sources so the note shows up immediately", () => {
    expect(composer).toContain("utils.customers.groupNotes.invalidate({ group })");
    expect(composer).toContain("utils.customers.groupDetail.invalidate()");
  });

  it("stays collapsed until clicked, so the history keeps the space", () => {
    expect(composer).toContain("Write a note…");
    expect(composer).toMatch(/if \(!open\)/);
  });

  it("is mounted in both the floating window and the mobile sheet, scoped to the group", () => {
    const mounts = panel.match(/composer=\{group \? <CommunicationNoteComposer group=\{group\} \/> : undefined\}/g);
    expect(mounts).toHaveLength(2);
    expect(panel.match(/editableNotesGroup=\{group\}/g)).toHaveLength(2);
  });
});

describe("Communication timeline — editing a note in place", () => {
  it("carries the note row id into the entry", () => {
    expect(builder).toContain("noteId: n.id");
    expect(timeline).toContain("noteId?: number | null");
  });

  it("offers edit and delete only for note entries of a known group", () => {
    expect(timeline).toContain(
      'const editable = Boolean(editableNotesGroup) && e.kind === "note" && typeof e.noteId === "number"',
    );
  });

  it("uses the existing update/delete mutations", () => {
    expect(timeline).toContain("trpc.customers.updateGroupNote.useMutation");
    expect(timeline).toContain("trpc.customers.deleteGroupNote.useMutation");
  });

  it("renders the composer slot above the entry list", () => {
    expect(timeline).toContain("{composer && <div className=\"pb-3\">{composer}</div>}");
  });
});

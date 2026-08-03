import { Button } from "@/components/ui/button";
import MentionTextarea from "@/components/MentionTextarea";
import { trpc } from "@/lib/trpc";
import { StickyNote } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Write a note without leaving the Communication window.
 *
 * The history is where a collector is already looking when a thought occurs
 * ("they asked for a statement", "call back after the 15th"), so the note is
 * typed in place and lands on the same timeline immediately. It is the same
 * group note as everywhere else — one store, so nothing diverges — and `@`
 * mentions notify colleagues exactly as in the notes dialog.
 *
 * Collapsed to a single line until clicked: the window is small and the history
 * itself must stay the main thing on screen.
 */
export function CommunicationNoteComposer({ group }: { group: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");

  const add = trpc.customers.addGroupNote.useMutation({
    onSuccess: () => {
      setContent("");
      setOpen(false);
      toast.success("Note added");
      // The note reaches the timeline through both sources, so refresh both.
      utils.customers.groupNotes.invalidate({ group });
      utils.customers.groupDetail.invalidate();
      utils.customers.get360.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    const text = content.trim();
    if (!text) return;
    add.mutate({ group, content: text });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded-md border border-dashed px-2.5 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <StickyNote className="h-3.5 w-3.5 shrink-0" />
        Write a note…
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-2">
      <MentionTextarea
        value={content}
        onChange={setContent}
        rows={3}
        maxLength={5000}
        autoFocus
        placeholder="What happened, or what should we remember? Type @ to notify a colleague."
        className="bg-background text-sm"
      />
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => {
            setOpen(false);
            setContent("");
          }}
          disabled={add.isPending}
        >
          Cancel
        </Button>
        <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={!content.trim() || add.isPending}>
          {add.isPending ? "Saving…" : "Add note"}
        </Button>
      </div>
    </div>
  );
}

export default CommunicationNoteComposer;

import { Button } from "@/components/ui/button";
import MentionText from "@/components/MentionText";
import MentionTextarea from "@/components/MentionTextarea";
import { trpc } from "@/lib/trpc";
import { Info, Pencil } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Always-visible per-group collection notes: call preferences and customer
 * particularities (best call days/hours, preferred contact, payment quirks).
 * Inline-editable; changes are written to the group activity log.
 */
export default function CollectionNotesBox({ group }: { group: string }) {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.customers.getCollectionProfile.useQuery({ group }, { enabled: !!group });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const save = trpc.customers.setCollectionProfile.useMutation({
    onSuccess: () => {
      utils.customers.getCollectionProfile.invalidate({ group });
      setEditing(false);
      toast.success("Collection notes saved");
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading) return null;
  const notes = profile?.notes?.trim() ?? "";

  if (editing) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
          <Info className="h-3.5 w-3.5" /> Collection Notes — call preferences & particularities
        </div>
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          rows={3}
          maxLength={2000}
          autoFocus
          placeholder={'e.g. "Call only Tue-Thu 10:00-13:00, ask for Mrs. Papadopoulou (accounting). Pays via embassy account — allow 5 extra days."'}
          className="bg-white dark:bg-background text-sm"
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => save.mutate({ group, notes: draft })} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (!notes) {
    return (
      <button
        onClick={() => {
          setDraft("");
          setEditing(true);
        }}
        className="w-full rounded-lg border border-dashed border-amber-300 dark:border-amber-800 p-2.5 text-left text-xs text-muted-foreground hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors flex items-center gap-1.5"
      >
        <Info className="h-3.5 w-3.5 text-amber-500" />
        Add collection notes — call preferences & particularities (e.g. best days/hours to call, who to ask for)
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2.5 flex items-start gap-2.5">
      <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Collection Notes
        </div>
        <MentionText text={notes} className="block text-sm text-amber-900 dark:text-amber-100" />
        {profile?.updatedByName && (
          <div className="text-[10px] text-amber-700/70 dark:text-amber-400/70 mt-1">
            Updated by {profile.updatedByName} · {new Date(profile.updatedAt).toLocaleDateString()}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-amber-700 hover:text-amber-900 dark:text-amber-300"
        onClick={() => {
          setDraft(notes);
          setEditing(true);
        }}
        title="Edit collection notes"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

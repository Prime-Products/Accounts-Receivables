import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { HelpCircle, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Open questions asked about this group, shown on the customer card itself.
 *
 * A collector should see "we are waiting on an answer" without leaving the card,
 * and the colleague who has to answer can reply right here — the question lives
 * with the customer, not only in an inbox.
 */
export default function GroupOpenQuestions({ group }: { group: string }) {
  const utils = trpc.useUtils();
  const { data } = trpc.questions.list.useQuery({ box: "group", group, statuses: ["Open", "Answered"] });
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const answer = trpc.questions.answer.useMutation({
    onSuccess: () => {
      toast.success("Answer sent");
      setReplyTo(null);
      setDraft("");
      utils.questions.invalidate();
      utils.customers.groupDetail.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const close = trpc.questions.close.useMutation({
    onSuccess: () => {
      utils.questions.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const items = (data?.items ?? []) as any[];
  if (items.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-3">
      <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
        <HelpCircle className="h-3.5 w-3.5" /> Open questions · {items.length}
      </p>
      {items.map(q => (
        <div key={q.id} className="rounded-md bg-background border p-2.5 space-y-2">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <p className="text-sm">{q.question}</p>
            <Badge
              variant="outline"
              className={
                q.status === "Answered"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-amber-50 text-amber-700 border-amber-200"
              }
            >
              {q.status}
            </Badge>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {q.askedByMe ? "You" : (q.askedByName ?? "Someone")} → {q.askedToMe ? "you" : (q.askedToName ?? "—")}
          </p>
          {q.answer && <p className="text-sm bg-emerald-50/60 border border-emerald-200 rounded p-2">{q.answer}</p>}
          <div className="flex items-center gap-2">
            {replyTo !== q.id && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={() => {
                  setReplyTo(q.id);
                  setDraft("");
                }}
              >
                <Send className="h-3 w-3" /> Answer
              </Button>
            )}
            {q.askedByMe && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                disabled={close.isPending}
                onClick={() => close.mutate({ id: q.id })}
              >
                Close
              </Button>
            )}
          </div>
          {replyTo === q.id && (
            <div className="space-y-2">
              <Textarea autoFocus rows={2} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Your answer…" />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={!draft.trim() || answer.isPending}
                  onClick={() => answer.mutate({ id: q.id, answer: draft.trim() })}
                >
                  Send
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setReplyTo(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

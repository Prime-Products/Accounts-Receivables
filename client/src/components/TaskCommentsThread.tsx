import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { MessageSquare, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Comment thread on a task — internal collaboration between colleagues.
 * Renders existing comments (author + relative date) and a composer.
 */
export default function TaskCommentsThread({ taskId }: { taskId: number }) {
  const utils = trpc.useUtils();
  const { data: comments, isLoading } = trpc.tasks.comments.useQuery({ taskId });
  const [body, setBody] = useState("");
  const addComment = trpc.tasks.addComment.useMutation({
    onSuccess: () => {
      setBody("");
      utils.tasks.comments.invalidate({ taskId });
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    const text = body.trim();
    if (!text) return;
    addComment.mutate({ taskId, body: text });
  };

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="text-sm font-medium flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4" /> Comments
        {comments && comments.length > 0 && (
          <span className="text-xs text-muted-foreground font-normal">({comments.length})</span>
        )}
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground">Loading comments…</div>
      ) : (comments ?? []).length === 0 ? (
        <div className="text-xs text-muted-foreground">No comments yet — write the first note for your colleague.</div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {(comments ?? []).map(c => (
            <div key={c.id} className="rounded-md bg-muted/40 p-2">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-medium">{c.authorName || "User"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(c.createdAt as any).toLocaleString()}
                </span>
              </div>
              <div className="text-sm whitespace-pre-wrap">{c.body}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={2}
          placeholder="Write a comment for your colleague…"
          className="text-sm"
          onKeyDown={e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button size="sm" className="gap-1 shrink-0" onClick={submit} disabled={addComment.isPending || !body.trim()}>
          <Send className="h-3.5 w-3.5" /> Post
        </Button>
      </div>
    </div>
  );
}

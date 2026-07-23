import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Pencil, StickyNote, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/** Group-level notes dialog, shared by the group card and the customer card. */
export default function GroupNotesDialog({ group }: { group: string }) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const { data: notes, isLoading } = trpc.customers.groupNotes.useQuery({ group }, { enabled: open });
  const noteCount = trpc.customers.groupNotes.useQuery({ group }, { enabled: !open }).data?.length;
  const add = trpc.customers.addGroupNote.useMutation({
    onSuccess: () => {
      setContent("");
      toast.success("Note added");
      utils.customers.groupNotes.invalidate({ group });
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.customers.updateGroupNote.useMutation({
    onSuccess: () => {
      setEditingId(null);
      utils.customers.groupNotes.invalidate({ group });
    },
    onError: e => toast.error(e.message),
  });
  const del = trpc.customers.deleteGroupNote.useMutation({
    onSuccess: () => utils.customers.groupNotes.invalidate({ group }),
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <StickyNote className="h-4 w-4" /> New Note
          {typeof noteCount === "number" && noteCount > 0 && (
            <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{noteCount}</Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-4 w-4" /> Group Notes — {group}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Add a note about this group (calls, agreements, context)…"
              className="min-h-16"
            />
            <Button
              size="sm"
              className="self-end"
              disabled={!content.trim() || add.isPending}
              onClick={() => add.mutate({ group, content: content.trim() })}
            >
              Add
            </Button>
          </div>
          {isLoading ? (
            <Skeleton className="h-20" />
          ) : !notes || notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No notes yet.</p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-auto pr-1">
              {notes.map(n => (
                <div key={n.id} className="rounded-md border p-2.5 text-sm">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] text-muted-foreground">
                      {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                    </span>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditContent(n.content);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                        onClick={() => del.mutate({ id: n.id })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  {editingId === n.id ? (
                    <div className="space-y-2">
                      <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="min-h-16" />
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          disabled={!editContent.trim() || update.isPending}
                          onClick={() => update.mutate({ id: n.id, content: editContent.trim() })}
                        >
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{n.content}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

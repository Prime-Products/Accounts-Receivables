import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { trpc } from "@/lib/trpc";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * AI summary as a toolbar button + dialog, shared by the group card and the
 * customer card. Opening the dialog auto-generates the summary (once).
 */
export default function GroupAiSummaryDialog({ group }: { group: string }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<{ text: string; at: number } | null>(null);
  const gen = trpc.customers.groupAiSummary.useMutation({
    onSuccess: r => setSummary({ text: r.summary, at: r.generatedAt }),
    onError: e => toast.error(e.message),
  });

  const openDialog = () => {
    setOpen(true);
    if (!summary && !gen.isPending) gen.mutate({ group });
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={openDialog}>
        <Sparkles className="h-4 w-4" /> AI Summary
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <ResizableDialogContent storageKey="group-ai-summary" className="sm:max-w-none w-[42rem] max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> AI Summary — {group}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {gen.isPending ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : summary ? (
              <div>
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary.text}</div>
                <p className="text-[11px] text-muted-foreground mt-3">Generated {new Date(summary.at).toLocaleString()}</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Generate an AI snapshot of this group: exposure, overdue risk, payment behavior, promises, open tasks and notes.
              </p>
            )}
          </div>
          <div className="flex justify-end">
            <Button size="sm" variant="outline" className="gap-1.5" disabled={gen.isPending} onClick={() => gen.mutate({ group })}>
              {gen.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {gen.isPending ? "Analyzing…" : summary ? "Regenerate" : "Generate"}
            </Button>
          </div>
        </ResizableDialogContent>
      </Dialog>
    </>
  );
}

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CornerDownLeft, Gavel, PauseCircle, RefreshCw, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Panel shown on escalated tasks ("Escalated: …").
 *
 * Management does not want KPI tiles here — they want the STORY: an AI narrative
 * that reads the whole case history (calls, promises, notes, tasks, payments) and
 * explains what happened and why it reached their desk. Below the story sit the
 * three decisions — On Hold / Stop Services, Legal Review, Return to Collector.
 */
export default function EscalationPanel({
  taskId,
  taskOpen,
  onDecided,
}: {
  taskId: number;
  taskOpen: boolean;
  onDecided?: () => void;
}) {
  const utils = trpc.useUtils();
  const { data: summary, isLoading } = trpc.tasks.escalationSummary.useQuery({ taskId });
  const {
    data: storyData,
    isLoading: storyLoading,
    isFetching: storyFetching,
  } = trpc.tasks.escalationStory.useQuery(
    { taskId },
    // The narrative costs an LLM call, so keep it warm while the dialog is open
    // instead of regenerating on every focus change.
    { staleTime: 10 * 60 * 1000, refetchOnWindowFocus: false }
  );
  const [mode, setMode] = useState<"none" | "On Hold" | "Legal Review" | "Return to Collector">("none");
  const [note, setNote] = useState("");
  const [returnTo, setReturnTo] = useState<number | null>(null);

  const decide = trpc.tasks.escalationDecision.useMutation({
    onSuccess: r => {
      toast.success(
        r.decision === "Return to Collector"
          ? `Task returned to ${r.returnedToName}`
          : `Decision recorded: ${r.decision}`
      );
      utils.tasks.list.invalidate();
      utils.tasks.escalationSummary.invalidate({ taskId });
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
      setMode("none");
      setNote("");
      setReturnTo(null);
      onDecided?.();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="rounded-md border border-orange-200 bg-orange-50/50 p-3 space-y-3">
      <div className="text-sm font-medium flex items-center gap-1.5 text-orange-900">
        <TriangleAlert className="h-4 w-4" />
        {summary ? `Escalation summary — ${summary.group}` : "Escalation summary"}
      </div>

      {isLoading && !summary && <Skeleton className="h-6 w-2/3" />}

      {summary?.escalationReason && (
        <div className="text-xs text-orange-900 bg-white rounded-md border border-orange-200 p-2">
          {summary.escalationReason}
        </div>
      )}

      {/* The story: what happened, in the collector's own trail of work. */}
      <div className="rounded-md bg-white border p-3">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            What happened
          </div>
          <button
            type="button"
            className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors disabled:opacity-50"
            disabled={storyFetching}
            onClick={() => utils.tasks.escalationStory.invalidate({ taskId })}
            title="Regenerate the story from the latest history"
          >
            <RefreshCw className={`h-3 w-3 ${storyFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        {storyLoading ? (
          <div className="space-y-1.5">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ) : storyData?.story ? (
          <div className="space-y-2 text-[13px] leading-relaxed text-foreground">
            {storyData.story
              .split(/\n{2,}/)
              .map(p => p.trim())
              .filter(Boolean)
              .map((p, idx) => (
                <p key={idx}>{p}</p>
              ))}
            <div className="text-[11px] text-muted-foreground pt-0.5">
              Based on {storyData.eventCount} recorded event{storyData.eventCount === 1 ? "" : "s"}
              {storyData.generated ? "" : " · written from the case record"}
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">No history recorded for this case yet.</div>
        )}
      </div>

      {summary?.decision && (
        <div className="text-xs font-medium text-orange-900 bg-white rounded-md border border-orange-200 p-2">
          {summary.decision}
        </div>
      )}

      {taskOpen && (
        <div className="space-y-2 border-t border-orange-200 pt-2">
          <div className="text-sm font-medium text-orange-900">Decision — what happens next?</div>
          {mode === "none" && (
            <div className="grid gap-1.5">
              <button
                type="button"
                className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-amber-50 hover:border-amber-300 transition-colors"
                onClick={() => setMode("On Hold")}
              >
                <PauseCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">On Hold / Stop Services</div>
                  <div className="text-xs text-muted-foreground">Freeze the cooperation until payment — group status becomes On Hold.</div>
                </div>
              </button>
              <button
                type="button"
                className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-red-50 hover:border-red-300 transition-colors"
                onClick={() => setMode("Legal Review")}
              >
                <Gavel className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Legal Review</div>
                  <div className="text-xs text-muted-foreground">Forward to legal — group status becomes Legal.</div>
                </div>
              </button>
              <button
                type="button"
                className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors"
                onClick={() => setMode("Return to Collector")}
              >
                <CornerDownLeft className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-medium">Return to Collector</div>
                  <div className="text-xs text-muted-foreground">Send the task back to the collector with instructions.</div>
                </div>
              </button>
            </div>
          )}
          {mode !== "none" && (
            <div className="grid gap-2">
              <div className="text-xs font-medium">{mode}</div>
              {mode === "Return to Collector" && (
                <div className="grid gap-1">
                  <Label className="text-xs">Return to (defaults to the collector who escalated)</Label>
                  <TeamMemberSelect value={returnTo} onChange={setReturnTo} />
                </div>
              )}
              <div className="grid gap-1">
                <Label htmlFor="esc-dec-note" className="text-xs">
                  {mode === "Return to Collector" ? "Instructions for the collector" : "Note (optional)"}
                </Label>
                <Textarea
                  id="esc-dec-note"
                  rows={2}
                  className="bg-white text-sm"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder={
                    mode === "On Hold"
                      ? "e.g. stop services until 50% of overdue is paid"
                      : mode === "Legal Review"
                        ? "e.g. prepare demand letter"
                        : "e.g. offer a 3-instalment payment plan"
                  }
                />
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMode("none")}>
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </Button>
                <Button
                  size="sm"
                  className={`h-7 px-3 text-xs text-white ${
                    mode === "On Hold"
                      ? "bg-amber-600 hover:bg-amber-700"
                      : mode === "Legal Review"
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-blue-600 hover:bg-blue-700"
                  }`}
                  disabled={decide.isPending}
                  onClick={() =>
                    decide.mutate({
                      taskId,
                      decision: mode,
                      note: note || undefined,
                      returnToMemberId: mode === "Return to Collector" ? (returnTo ?? undefined) : undefined,
                    })
                  }
                >
                  Confirm {mode}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

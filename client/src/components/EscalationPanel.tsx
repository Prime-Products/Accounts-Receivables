import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CornerDownLeft, Gavel, PauseCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Decision block shown on escalated tasks ("Escalated: …").
 *
 * Deliberately plain: a "Decision" heading and three inline choices — On Hold,
 * Legal Review, Return. No summary card, no KPI tiles, no AI narrative; the
 * comments thread above carries the discussion.
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
  const { data: summary } = trpc.tasks.escalationSummary.useQuery({ taskId });
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

  // A decision has already been recorded — show it as a plain line, nothing else.
  if (!taskOpen) {
    return summary?.decision ? (
      <div className="space-y-1">
        <div className="text-base font-semibold">Decision</div>
        <div className="text-sm text-muted-foreground">{summary.decision}</div>
      </div>
    ) : null;
  }

  return (
    <div className="space-y-2">
      <div className="text-base font-semibold">Decision</div>

      {summary?.decision && <div className="text-sm text-muted-foreground">{summary.decision}</div>}

      {mode === "none" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2 bg-white" onClick={() => setMode("On Hold")}>
            <PauseCircle className="h-4 w-4 text-amber-600" /> On Hold
          </Button>
          <Button variant="outline" className="gap-2 bg-white" onClick={() => setMode("Legal Review")}>
            <Gavel className="h-4 w-4 text-red-600" /> Legal Review
          </Button>
          <Button variant="outline" className="gap-2 bg-white" onClick={() => setMode("Return to Collector")}>
            <CornerDownLeft className="h-4 w-4 text-blue-600" /> Return
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <div className="text-sm font-medium">{mode}</div>
          {mode === "Return to Collector" && (
            <div className="grid gap-1">
              <Label className="text-xs text-muted-foreground">Return to (defaults to the collector who escalated)</Label>
              <TeamMemberSelect value={returnTo} onChange={setReturnTo} />
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor="esc-dec-note" className="text-xs text-muted-foreground">
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
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={() => setMode("none")}>
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Button>
            <Button
              size="sm"
              className="h-8 px-3"
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
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

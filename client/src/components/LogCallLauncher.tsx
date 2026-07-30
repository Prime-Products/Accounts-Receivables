import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Phone, ClipboardList, ArrowRight } from "lucide-react";
import LogCallDialog from "@/components/LogCallDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { confirmationStatusLabels } from "@/lib/format";

/**
 * Wraps LogCallDialog with a pre-step: when the group already has an active
 * communication (open promise-check / follow-up / escalated task), first ask
 * whether to open that task or log a new call. When there is no active
 * communication, the Log Call dialog opens directly — no extra step.
 *
 * Controlled like a dialog: `open` / `onOpenChange`.
 */
export default function LogCallLauncher({
  group,
  companies,
  defaultCustomerId,
  open,
  onOpenChange,
}: {
  group: string;
  companies?: { id: number; name: string }[];
  defaultCustomerId?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Which panel is showing: the choice step, the call dialog, or the task dialog.
  const [callOpen, setCallOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskId, setTaskId] = useState<number | null>(null);

  const active = trpc.calls.getActiveCommunication.useQuery(
    { group },
    { enabled: open, staleTime: 0 },
  );

  // While loading we keep the choice dialog closed; once loaded decide:
  // no active communication → jump straight into the Log Call dialog.
  const showChoice = open && !active.isLoading && !!active.data;
  const goStraightToCall = open && !active.isLoading && !active.data;

  // Direct pass-through when nothing is active.
  if (goStraightToCall && !callOpen && !taskOpen) {
    // Render LogCallDialog directly bound to the outer open state.
    return (
      <LogCallDialog
        group={group}
        companies={companies}
        defaultCustomerId={defaultCustomerId}
        open={open}
        onOpenChange={onOpenChange}
      />
    );
  }

  const a = active.data;
  const statusLabel = a ? (confirmationStatusLabels[a.status] ?? a.status) : "";
  const dueStr = a?.dueDate ? new Date(a.dueDate).toLocaleDateString("en-GB") : null;
  const amountNum = a?.amount ? Number(a.amount) : 0;

  const closeAll = () => {
    setCallOpen(false);
    setTaskOpen(false);
    setTaskId(null);
    onOpenChange(false);
  };

  return (
    <>
      {/* Choice step — active communication exists */}
      <Dialog open={showChoice && !callOpen && !taskOpen} onOpenChange={v => !v && closeAll()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-600" /> Active communication exists
            </DialogTitle>
            <DialogDescription>
              {statusLabel}
              {amountNum > 0 ? ` — €${amountNum.toLocaleString()}` : ""}
              {dueStr ? ` — due ${dueStr}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors"
              onClick={() => {
                if (a) {
                  setTaskId(a.taskId);
                  setTaskOpen(true);
                }
              }}
            >
              <ClipboardList className="h-5 w-5 mt-0.5 text-blue-600" />
              <div>
                <div className="text-sm font-medium">Open the task</div>
                <div className="text-xs text-muted-foreground">
                  Handle the current case — {a?.title ?? "open task"}
                </div>
              </div>
            </button>
            <button
              type="button"
              className="flex items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent transition-colors"
              onClick={() => setCallOpen(true)}
            >
              <ArrowRight className="h-5 w-5 mt-0.5 text-green-600" />
              <div>
                <div className="text-sm font-medium">New log call</div>
                <div className="text-xs text-muted-foreground">
                  Record another call — the call history is unlimited; the active case stays one
                </div>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New log call chosen */}
      {callOpen && (
        <LogCallDialog
          group={group}
          companies={companies}
          defaultCustomerId={defaultCustomerId}
          open={callOpen}
          onOpenChange={v => {
            setCallOpen(v);
            if (!v) closeAll();
          }}
        />
      )}

      {/* Open the task chosen */}
      {taskOpen && taskId !== null && (
        <TaskDetailDialog
          taskId={taskId}
          open={taskOpen}
          onOpenChange={v => {
            setTaskOpen(v);
            if (!v) closeAll();
          }}
        />
      )}
    </>
  );
}

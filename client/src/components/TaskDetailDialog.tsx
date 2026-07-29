import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import TaskCommentsThread from "@/components/TaskCommentsThread";
import { fmtDate, fmtEurFull, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, FileText, HandCoins, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

const promiseStatusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700 border-amber-200",
  Kept: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Broken: "bg-red-100 text-red-700 border-red-200",
};

/**
 * Standalone task detail dialog — same UI as the Tasks page dialog, but usable
 * from any page (e.g. the Customers groups list badges) without navigating away.
 */
export default function TaskDetailDialog({
  taskId,
  open,
  onOpenChange,
}: {
  taskId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery(undefined, { enabled: open && taskId != null });
  const task = useMemo(() => (tasks ?? []).find(t => t.id === taskId) ?? null, [tasks, taskId]);

  const setStatus = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const setPromiseStatus = trpc.forecast.updatePromise.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(`Promise marked ${vars.status === "Broken" ? "Not Confirmed" : vars.status} — follow-up task completed`);
      utils.tasks.list.invalidate();
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const assignTask = trpc.tasks.assign.useMutation({
    onSuccess: () => {
      toast.success("Task assignment updated");
      utils.tasks.list.invalidate();
      utils.team.workload.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent storageKey="task-detail" className="sm:max-w-none w-[32rem] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24" />
          </div>
        ) : !task ? (
          <>
            <DialogHeader>
              <DialogTitle>Task not found</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              The linked task could not be found — it may have been completed or cancelled.
            </p>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="pr-6">{task.title}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={taskTypeColors[task.type] ?? ""}>{task.type}</Badge>
                <Badge variant="outline" className={taskStatusColors[task.status] ?? ""}>{task.status}</Badge>
                {task.promise && (
                  <Badge variant="outline" className={promiseStatusColors[task.promise.status] ?? ""}>
                    Promise {task.promise.status === "Broken" ? "Not Confirmed" : task.promise.status}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Customer</div>
                  <Link
                    href={`/customers/${task.customerId}`}
                    className="font-medium text-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    {task.customerName}
                  </Link>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Due date</div>
                  <div className="font-medium">{fmtDate(task.dueDate)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">Assignee</div>
                  <TeamMemberSelect
                    value={task.assigneeId ?? null}
                    onChange={id => assignTask.mutate({ id: task.id, assigneeId: id })}
                  />
                </div>
                {task.invoiceNumber && (
                  <div>
                    <div className="text-xs text-muted-foreground">Invoice</div>
                    <div className="font-mono">{task.invoiceNumber}</div>
                  </div>
                )}
                {task.completedAt && (
                  <div>
                    <div className="text-xs text-muted-foreground">Completed</div>
                    <div>{fmtDate(task.completedAt)}</div>
                  </div>
                )}
              </div>
              {task.description && (
                <div className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3 whitespace-pre-wrap">
                  {task.description}
                </div>
              )}
              {task.completionNotes && (
                <div className="text-sm">
                  <div className="text-xs text-muted-foreground">Completion notes</div>
                  <div>{task.completionNotes}</div>
                </div>
              )}

              {(task as any).attachedInvoices && (task as any).attachedInvoices.length > 0 && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Attached invoices ({(task as any).attachedInvoices.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(task as any).attachedInvoices.map((inv: any) => (
                      <div key={inv.id} className="flex items-center justify-between text-xs border-b last:border-b-0 py-1">
                        <span className="font-mono">{inv.invoiceNumber}</span>
                        <span className="text-muted-foreground truncate max-w-32" title={inv.customerName}>{inv.customerName}</span>
                        <span className="text-muted-foreground">{fmtDate(inv.dueDate)}</span>
                        <span className="font-mono font-medium">
                          {inv.currency && inv.currency !== "EUR" ? `${inv.currency} ` : "€"}
                          {Number(inv.amount).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {task.promise && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <HandCoins className="h-4 w-4" /> Promise-to-Pay
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Amount</div>
                      <div className="font-mono font-semibold">{fmtEurFull(task.promise.amount)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Promised date</div>
                      <div>{fmtDate(task.promise.promisedDate)}</div>
                    </div>
                  </div>
                  {task.promise.notes && <div className="text-xs text-muted-foreground">{task.promise.notes}</div>}
                  {task.promise.status === "Pending" && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        disabled={setPromiseStatus.isPending}
                        onClick={() => setPromiseStatus.mutate({ id: task.promise!.id, status: "Kept" })}
                      >
                        <ThumbsUp className="h-4 w-4" /> Kept
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        disabled={setPromiseStatus.isPending}
                        onClick={() => setPromiseStatus.mutate({ id: task.promise!.id, status: "Broken" })}
                      >
                        <ThumbsDown className="h-4 w-4" /> Not Confirmed
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {(task.status === "Pending" || task.status === "In Progress") && (
                <div className="flex gap-2 justify-end pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-emerald-700"
                    onClick={() => {
                      setStatus.mutate({ id: task.id, status: "Completed" });
                      onOpenChange(false);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark Done
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-muted-foreground"
                    onClick={() => {
                      setStatus.mutate({ id: task.id, status: "Cancelled" });
                      onOpenChange(false);
                    }}
                  >
                    <XCircle className="h-4 w-4" /> Cancel Task
                  </Button>
                </div>
              )}

              <TaskCommentsThread taskId={task.id} />
            </div>
          </>
        )}
      </ResizableDialogContent>
    </Dialog>
  );
}

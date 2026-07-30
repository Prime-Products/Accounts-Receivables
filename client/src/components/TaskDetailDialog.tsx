import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import TaskCommentsThread from "@/components/TaskCommentsThread";
import NextActionDialog from "@/components/NextActionDialog";
import EscalationPanel from "@/components/EscalationPanel";
import { WatcherStack, watcherColor, watcherInitials } from "@/components/WatcherStack";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDate, fmtEurFull, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ArrowUpCircle, CalendarClock, CheckCircle2, Eye, FileText, HandCoins, Plus, ThumbsDown, ThumbsUp, User, X, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [nextActionGroup, setNextActionGroup] = useState<string | null>(null);
  // Latch the last non-null taskId: after mutations (e.g. promise Kept), parent
  // lists refetch and pass taskId=null while the dialog is still open — without
  // this latch the dialog would flash "Task not found".
  const latchedIdRef = useRef<number | null>(null);
  if (taskId != null) latchedIdRef.current = taskId;
  useEffect(() => {
    if (!open) latchedIdRef.current = null;
  }, [open]);
  const effectiveTaskId = taskId ?? latchedIdRef.current;
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery(undefined, { enabled: open && effectiveTaskId != null });
  const task = useMemo(() => (tasks ?? []).find(t => t.id === effectiveTaskId) ?? null, [tasks, effectiveTaskId]);
  // If the task genuinely doesn't exist anymore (deleted), close gracefully
  // instead of showing a "Task not found" panel.
  useEffect(() => {
    if (open && !isLoading && tasks && effectiveTaskId != null && !task) {
      toast.info("This task has been completed or removed.");
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isLoading, tasks, effectiveTaskId, task]);

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
      toast.success(`Promise marked ${vars.status} — follow-up task completed`);
      utils.tasks.list.invalidate();
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
      if (vars.status === "Broken" && task) {
        // The customer did not pay — ask the user what happens next.
        setNextActionGroup(((task as any).groupName as string) ?? task.customerName ?? null);
      }
      // Close the task dialog: the linked task has just been auto-completed and
      // the badge will refresh — keeping it open would show stale data.
      onOpenChange(false);
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
  const [editingDue, setEditingDue] = useState(false);
  const [newDue, setNewDue] = useState("");
  // Follow-up task action panel: reschedule / convert to promise / escalate
  const [fuMode, setFuMode] = useState<"none" | "reschedule" | "promise" | "escalate" | "reschedule-promise" | "next-task">("none");
  const [fuDate, setFuDate] = useState("");
  const [fuAmount, setFuAmount] = useState("");
  const [fuNotes, setFuNotes] = useState("");
  const [fuAssignee, setFuAssignee] = useState<number | null>(null);
  // Next-task panel state
  const [nextType, setNextType] = useState<"promise" | "follow-up">("promise");
  const [resolveAs, setResolveAs] = useState<"Kept" | "Broken" | null>(null);
  useEffect(() => {
    if (!open) {
      setFuMode("none");
      setFuDate("");
      setFuAmount("");
      setFuNotes("");
      setFuAssignee(null);
      setNextType("promise");
      setResolveAs(null);
      setEscWatcherIds([]);
      setWatcherPickerOpen(false);
    }
  }, [open]);
  const invalidateAll = () => {
    utils.tasks.list.invalidate();
    utils.customers.groups.invalidate();
    utils.customers.groupDetail.invalidate();
    utils.calls.getConfirmationStatus.invalidate();
    utils.calls.getOpenFollowUpTask.invalidate();
  };
  const convertToPromise = trpc.tasks.convertFollowUpToPromise.useMutation({
    onSuccess: () => {
      toast.success("Converted to Promise to Pay — new task created, follow-up cancelled");
      invalidateAll();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });
  const escalateTask = trpc.tasks.escalate.useMutation({
    onSuccess: r => {
      toast.success(`Escalated to ${r.assigneeName}`);
      invalidateAll();
      utils.team.workload.invalidate();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });
  const reschedulePromise = trpc.tasks.reschedulePromise.useMutation({
    onSuccess: () => {
      toast.success("Promise rescheduled — task moved to the new date");
      invalidateAll();
      setFuMode("none");
    },
    onError: e => toast.error(e.message),
  });
  // Watchers — team members following this task's progress
  const [watcherPickerOpen, setWatcherPickerOpen] = useState(false);
  const { data: teamMembers } = trpc.team.list.useQuery(undefined, { enabled: open });
  const addWatcher = trpc.tasks.addWatcher.useMutation({
    onSuccess: () => {
      utils.tasks.list.invalidate();
      setWatcherPickerOpen(false);
    },
    onError: e => toast.error(e.message),
  });
  const removeWatcher = trpc.tasks.removeWatcher.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: e => toast.error(e.message),
  });
  // Watchers picked in the escalate form (applied to the NEW escalated task)
  const [escWatcherIds, setEscWatcherIds] = useState<number[]>([]);
  const reschedule = trpc.tasks.reschedule.useMutation({
    onSuccess: r => {
      toast.success(`Due date updated${r.rescheduleCount > 0 ? ` — rescheduled ×${r.rescheduleCount}` : ""}`);
      setEditingDue(false);
      setFuMode("none");
      utils.tasks.list.invalidate();
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
      utils.calls.getOpenFollowUpTask.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const createNext = trpc.tasks.createNextTask.useMutation({
    onSuccess: r => {
      toast.success(
        r.newPromiseId
          ? "New Promise to Pay created — previous task closed"
          : "New follow-up scheduled — previous task closed"
      );
      invalidateAll();
      onOpenChange(false);
    },
    onError: e => toast.error(e.message),
  });
  const isTaskOpen = task ? task.status === "Pending" || task.status === "In Progress" : false;
  const { data: openInv } = trpc.tasks.groupOpenInvoices.useQuery(
    { taskId: task?.id ?? 0 },
    { enabled: open && !!task && isTaskOpen && fuMode === "next-task" }
  );

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ResizableDialogContent storageKey="task-detail" className="sm:max-w-none w-[32rem] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24" />
          </div>
        ) : !task ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
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
                    Promise {task.promise.status}
                 </Badge>
               )}
                {((task as any).rescheduleCount ?? 0) > 0 && (
                  <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                    Rescheduled ×{(task as any).rescheduleCount}
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Group</div>
                  <Link
                    href={`/groups/${encodeURIComponent((task as any).groupName ?? task.customerName ?? "")}`}
                    className="font-medium text-primary hover:underline"
                    onClick={() => onOpenChange(false)}
                  >
                    {(task as any).groupName ?? task.customerName}
                  </Link>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Due date</div>
                  {editingDue && (task.status === "Pending" || task.status === "In Progress") ? (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="date"
                        className="h-7 w-36 text-xs"
                        value={newDue}
                        onChange={e => setNewDue(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={!newDue || reschedule.isPending}
                        onClick={() => reschedule.mutate({ id: task.id, dueDate: new Date(`${newDue}T12:00:00`).getTime() })}
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingDue(false)}>
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <div className="font-medium flex items-center gap-1.5">
                      {fmtDate(task.dueDate)}
                      {(task.status === "Pending" || task.status === "In Progress") && (
                        <button
                          type="button"
                          className="text-muted-foreground hover:text-foreground"
                          title="Change due date"
                          onClick={() => {
                            setNewDue(new Date(task.dueDate).toISOString().slice(0, 10));
                            setEditingDue(true);
                          }}
                        >
                          <CalendarClock className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">Assigned to</div>
                  <TeamMemberSelect
                    value={task.assigneeId ?? null}
                    onChange={id => assignTask.mutate({ id: task.id, assigneeId: id })}
                  />
                </div>
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Watchers
                  </div>
                  <div className="flex items-center gap-2">
                    <WatcherStack watchers={((task as any).watchers ?? []) as any} max={5} size="md" />
                    <Popover open={watcherPickerOpen} onOpenChange={setWatcherPickerOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-full" title="Add watcher">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-2" align="start">
                        <div className="text-xs font-medium mb-1.5">Add a watcher</div>
                        <div className="max-h-48 overflow-y-auto space-y-0.5">
                          {(teamMembers ?? [])
                            .filter(m => !((task as any).watchers ?? []).some((w: any) => w.memberId === m.id))
                            .map(m => (
                              <button
                                key={m.id}
                                type="button"
                                className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left"
                                onClick={() => addWatcher.mutate({ taskId: task.id, memberId: m.id })}
                              >
                                <span
                                  className="h-6 w-6 inline-flex items-center justify-center rounded-full text-[10px] font-semibold text-white"
                                  style={{ backgroundColor: watcherColor(m.name) }}
                                >
                                  {watcherInitials(m.name)}
                                </span>
                                <span className="truncate">{m.name}</span>
                                {m.title && <span className="text-xs text-muted-foreground truncate ml-auto">{m.title}</span>}
                              </button>
                            ))}
                          {(teamMembers ?? []).filter(m => !((task as any).watchers ?? []).some((w: any) => w.memberId === m.id)).length === 0 && (
                            <div className="text-xs text-muted-foreground px-2 py-1.5">Everyone is already watching.</div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                  {((task as any).watchers ?? []).length > 0 && (
                    <div className="mt-1.5 space-y-0.5">
                      {((task as any).watchers ?? []).map((w: any) => (
                        <div key={w.memberId} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span
                            className="h-4 w-4 inline-flex items-center justify-center rounded-full text-[8px] font-semibold text-white shrink-0"
                            style={{ backgroundColor: watcherColor(w.name) }}
                          >
                            {watcherInitials(w.name)}
                          </span>
                          <span className="truncate">{w.name}</span>
                          {w.title && <span className="truncate">— {w.title}</span>}
                          <button
                            type="button"
                            className="ml-auto hover:text-destructive"
                            title="Remove watcher"
                            onClick={() => removeWatcher.mutate({ taskId: task.id, memberId: w.memberId })}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {task.invoiceNumber && (
                  <div>
                    <div className="text-xs text-muted-foreground">Invoice</div>
                    <div className="font-mono">{task.invoiceNumber}</div>
                  </div>
                )}
                {(() => {
                  const m = task.description?.match(/Contact: ([^.·]+)[.·]/);
                  return m ? (
                    <div>
                      <div className="text-xs text-muted-foreground">Contact</div>
                      <div className="flex items-center gap-1"><User className="h-3.5 w-3.5 text-muted-foreground" />{m[1].trim()}</div>
                    </div>
                  ) : null;
                })()}
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

              {task.title.startsWith("Escalated: ") && (
                <EscalationPanel
                  taskId={task.id}
                  taskOpen={task.status === "Pending" || task.status === "In Progress"}
                />
              )}

              {(task as any).attachedInvoices && (task as any).attachedInvoices.length > 0 && (
                <div className="rounded-md border p-3 space-y-2">
                  <div className="text-sm font-medium flex items-center gap-1.5">
                    <FileText className="h-4 w-4" /> Attached invoices ({(task as any).attachedInvoices.length})
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(task as any).attachedInvoices.map((inv: any) => (
                      <a
                        key={inv.id}
                        href={`/invoices?q=${encodeURIComponent(inv.invoiceNumber)}`}
                        className="flex items-center justify-between text-xs border-b last:border-b-0 py-1 hover:bg-muted/50 rounded px-1 -mx-1 cursor-pointer"
                        title="Open this invoice in the Invoices page"
                      >
                        <span className="font-mono text-blue-700 hover:underline">{inv.invoiceNumber}</span>
                        <span className="text-muted-foreground truncate max-w-32" title={inv.customerName}>{inv.customerName}</span>
                        <span className="text-muted-foreground">{fmtDate(inv.dueDate)}</span>
                        <span className="font-mono font-medium">
                          {inv.currency && inv.currency !== "EUR" ? `${inv.currency} ` : "€"}
                          {Number(inv.amount).toLocaleString()}
                        </span>
                      </a>
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
                        onClick={() => setFuMode("broken-options" as any)}
                      >
                       <ThumbsDown className="h-4 w-4" /> Broken
                      </Button>
                   </div>
                 )}
               {task.promise.status === "Pending" && (task.status === "Pending" || task.status === "In Progress") && (
                  <div className="border-t pt-2 mt-1 space-y-2">
                     {(fuMode as string) === "broken-options" && (
                       <div className="grid gap-1.5">
                         <div className="text-sm font-medium flex items-center gap-1.5 text-red-900">
                           <ThumbsDown className="h-4 w-4" /> Promise broken — choose the next step
                         </div>
                         <button
                           type="button"
                           className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors"
                           onClick={() => {
                             setFuAmount(String(task.promise!.amount ?? ""));
                             setFuDate(new Date(task.promise!.promisedDate).toISOString().slice(0, 10));
                             setFuMode("reschedule-promise" as any);
                           }}
                         >
                          <CalendarClock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                             <div className="text-sm font-medium">Reschedule Promise</div>
                            <div className="text-xs text-muted-foreground">Move the promised payment to a new date.</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-violet-50 hover:border-violet-300 transition-colors"
                          onClick={() => {
                            setResolveAs("Broken");
                            setNextType("follow-up");
                            setFuAmount("");
                            setFuDate("");
                            setFuMode("next-task");
                          }}
                        >
                          <CalendarClock className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium">Pending Follow-up</div>
                            <div className="text-xs text-muted-foreground">Schedule the next follow-up call; this task is closed.</div>
                          </div>
                        </button>
                         <button
                           type="button"
                           className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-red-50 hover:border-red-300 transition-colors"
                           onClick={() => setFuMode("escalate")}
                         >
                           <ArrowUpCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                           <div>
                             <div className="text-sm font-medium">Escalate</div>
                             <div className="text-xs text-muted-foreground">Hand this over to the Account Manager (or another team member).</div>
                           </div>
                         </button>
                        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs justify-start text-muted-foreground" onClick={() => setFuMode("none")}>
                          <ArrowLeft className="h-3.5 w-3.5" /> Back
                        </Button>
                       </div>
                     )}
                    {fuMode === "next-task" && (
                      <div className="grid gap-2">
                          <div className="text-xs font-medium text-muted-foreground">
                            {nextType === "promise" ? "New Promise to Pay — the broken promise stays on record" : "Schedule the next follow-up call"}
                          </div>
                         <div className="grid grid-cols-2 gap-2">
                           <div className="grid gap-1">
                             <Label htmlFor="nt-amount" className="text-xs">{nextType === "promise" ? "Promised amount (EUR)" : "Expected amount (optional)"}</Label>
                              <Input id="nt-amount" type="number" min="0" step="0.01" className="h-8 bg-white" value={fuAmount} onChange={e => setFuAmount(e.target.value)} placeholder="0.00" />
                            </div>
                            <div className="grid gap-1">
                              <Label htmlFor="nt-date" className="text-xs">{nextType === "promise" ? "Promised date" : "Follow-up date"}</Label>
                              <Input id="nt-date" type="date" className="h-8 bg-white" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                            </div>
                          </div>
                         <div className="grid gap-1">
                           <Label htmlFor="nt-notes" className="text-xs">Notes (optional)</Label>
                           <Textarea id="nt-notes" rows={2} className="bg-white text-sm" value={fuNotes} onChange={e => setFuNotes(e.target.value)} />
                         </div>
                         <div className="flex justify-between">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("broken-options" as any)}>
                             <ArrowLeft className="h-3.5 w-3.5" /> Back
                           </Button>
                            <Button
                              size="sm"
                              className="h-7 px-3 text-xs"
                              disabled={
                                !resolveAs ||
                                !fuDate ||
                                (nextType === "promise" && (!fuAmount || Number(fuAmount) <= 0)) ||
                                createNext.isPending
                              }
                              onClick={() =>
                                createNext.mutate({
                                  taskId: task.id,
                                  resolvePromise: resolveAs ?? undefined,
                                  promiseId: task.promise!.id,
                                  nextType,
                                  amount: fuAmount ? Number(fuAmount) : undefined,
                                  date: new Date(`${fuDate}T12:00:00`).getTime(),
                                  notes: fuNotes || undefined,
                                })
                              }
                            >
                              Close & create next
                            </Button>
                          </div>
                        </div>
                      )}
                      {(fuMode as string) === "reschedule-promise" && (
                        <div className="grid gap-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="grid gap-1">
                              <Label htmlFor="pr-re-amount" className="text-xs">New amount (EUR)</Label>
                              <Input id="pr-re-amount" type="number" min="0" step="0.01" className="h-8" value={fuAmount} onChange={e => setFuAmount(e.target.value)} />
                            </div>
                            <div className="grid gap-1">
                              <Label htmlFor="pr-re-date" className="text-xs">New promised date</Label>
                              <Input id="pr-re-date" type="date" className="h-8" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                            </div>
                          </div>
                         <div className="grid gap-1">
                           <Label htmlFor="pr-re-notes" className="text-xs">Notes (optional)</Label>
                           <Textarea id="pr-re-notes" rows={2} className="text-sm" value={fuNotes} onChange={e => setFuNotes(e.target.value)} placeholder="e.g. customer asked to move the payment" />
                         </div>
                         <div className="flex justify-between">
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("broken-options" as any)}>
                             <ArrowLeft className="h-3.5 w-3.5" /> Back
                           </Button>
                           <Button
                             size="sm"
                             className="h-7 px-3 text-xs"
                             disabled={!fuDate || !fuAmount || Number(fuAmount) <= 0 || reschedulePromise.isPending}
                              onClick={() =>
                                reschedulePromise.mutate({
                                  taskId: task.id,
                                  promiseId: task.promise!.id,
                                  amount: Number(fuAmount),
                                 promisedDate: new Date(`${fuDate}T12:00:00`).getTime(),
                                 notes: fuNotes || undefined,
                               })
                             }
                           >
                            Reschedule
                          </Button>
                        </div>
                      </div>
                    )}
                     {fuMode === "escalate" && !task.description?.includes("(Follow-up: ") && (
                       <div className="grid gap-2">
                         <div className="grid gap-1">
                           <Label className="text-xs">Escalate to (defaults to the group's Account Manager)</Label>
                           <TeamMemberSelect value={fuAssignee} onChange={setFuAssignee} />
                         </div>
                         <div className="grid gap-1">
                           <Label className="text-xs">Watchers (optional — they follow the escalated task)</Label>
                           <div className="flex flex-wrap gap-1">
                             {(teamMembers ?? []).map(m => {
                               const selected = escWatcherIds.includes(m.id);
                               return (
                                 <button
                                   key={m.id}
                                   type="button"
                                   className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${selected ? "border-transparent text-white" : "bg-white hover:bg-muted"}`}
                                   style={selected ? { backgroundColor: watcherColor(m.name) } : undefined}
                                   onClick={() =>
                                     setEscWatcherIds(prev =>
                                       prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                                     )
                                   }
                                 >
                                   {selected && <CheckCircle2 className="h-3 w-3" />}
                                   {m.name}
                                 </button>
                               );
                             })}
                           </div>
                         </div>
                         <div className="grid gap-1">
                           <Label htmlFor="pr-es-note" className="text-xs">Note (optional)</Label>
                           <Textarea id="pr-es-note" rows={2} className="bg-white text-sm" value={fuNotes} onChange={e => setFuNotes(e.target.value)} placeholder="e.g. promise broken twice — needs manager attention" />
                         </div>
                         <div className="flex justify-between">
                           <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("broken-options" as any)}>
                             <ArrowLeft className="h-3.5 w-3.5" /> Back
                           </Button>
                           <Button
                             size="sm"
                             variant="destructive"
                             className="h-7 px-3 text-xs"
                             disabled={escalateTask.isPending}
                             onClick={() =>
                               escalateTask.mutate({
                                 taskId: task.id,
                                 assigneeId: fuAssignee ?? undefined,
                                 note: fuNotes || undefined,
                                 watcherIds: escWatcherIds.length > 0 ? escWatcherIds : undefined,
                               })
                             }
                           >
                             <ArrowUpCircle className="h-3.5 w-3.5" /> Escalate
                           </Button>
                         </div>
                       </div>
                     )}
                   </div>
                 )}
               </div>
             )}

              {(task.status === "Pending" || task.status === "In Progress") && (
                task.description?.includes("(Follow-up: ") ? (
                  <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1.5 text-blue-900">
                      <CalendarClock className="h-4 w-4" /> Follow-up — what happens next?
                    </div>
                    {fuMode === "none" && (
                      <div className="grid gap-1.5">
                        <button
                          type="button"
                          className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-blue-50 hover:border-blue-300 transition-colors"
                          onClick={() => {
                            setFuDate(new Date(task.dueDate ?? Date.now()).toISOString().slice(0, 10));
                            setFuMode("reschedule");
                          }}
                        >
                          <CalendarClock className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium">Reschedule</div>
                            <div className="text-xs text-muted-foreground">Move the follow-up call to a new date.</div>
                          </div>
                        </button>
                        <button
                          type="button"
                          className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-emerald-50 hover:border-emerald-300 transition-colors"
                          onClick={() => {
                            const m = task.title.match(/€([\d,.]+)/);
                            setFuAmount(m ? m[1].replace(/,/g, "") : "");
                            setFuDate(new Date(task.dueDate ?? Date.now()).toISOString().slice(0, 10));
                            setFuMode("promise");
                          }}
                        >
                          <HandCoins className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                          <div>
                            <div className="text-sm font-medium">Convert to Promise to Pay</div>
                            <div className="text-xs text-muted-foreground">Customer committed to pay — new Promise task is created, status becomes Promise to Pay, this task is cancelled.</div>
                          </div>
                        </button>
                       <button
                         type="button"
                         className="flex items-start gap-2.5 rounded-md border bg-white p-2.5 text-left hover:bg-red-50 hover:border-red-300 transition-colors"
                         onClick={() => setFuMode("escalate")}
                       >
                         <ArrowUpCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                         <div>
                           <div className="text-sm font-medium">Escalate</div>
                           <div className="text-xs text-muted-foreground">Hand this over to the Account Manager (or another team member).</div>
                         </div>
                       </button>
                     </div>
                    )}
                    {fuMode === "next-task" && (
                      <div className="grid gap-2">
                        <div className="text-xs font-medium text-muted-foreground">Next step for this group</div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={nextType === "promise" ? "default" : "outline"}
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setNextType("promise")}
                          >
                            <HandCoins className="h-3.5 w-3.5" /> Promise to Pay
                          </Button>
                          <Button
                            size="sm"
                            variant={nextType === "follow-up" ? "default" : "outline"}
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => setNextType("follow-up")}
                          >
                            <CalendarClock className="h-3.5 w-3.5" /> Pending Follow-up
                          </Button>
                        </div>
                        {openInv && openInv.invoices.length > 0 && (
                          <div className="rounded-md border bg-white max-h-36 overflow-y-auto">
                            <div className="text-[11px] font-medium text-muted-foreground px-2 pt-1.5">Open invoices — click to prefill date/amount</div>
                            {openInv.invoices.slice(0, 20).map(inv => (
                              <button
                                key={inv.id}
                                type="button"
                                className="flex w-full items-center justify-between px-2 py-1 text-xs hover:bg-muted/60"
                                onClick={() => {
                                  if (inv.dueDate) setFuDate(new Date(inv.dueDate).toISOString().slice(0, 10));
                                  setFuAmount(String(inv.amount.toFixed(2)));
                                }}
                              >
                                <span className="font-mono">{inv.invoiceNumber}</span>
                                <span className={inv.overdue ? "text-red-600" : "text-muted-foreground"}>{fmtDate(inv.dueDate)}</span>
                                <span className="font-mono font-medium">€{inv.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {openInv && openInv.invoices.length === 0 && (
                          <div className="text-xs text-muted-foreground">No open invoices for this group.</div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label htmlFor="fu-nt-amount" className="text-xs">{nextType === "promise" ? "Promised amount (EUR)" : "Expected amount (optional)"}</Label>
                            <Input id="fu-nt-amount" type="number" min="0" step="0.01" className="h-8 bg-white" value={fuAmount} onChange={e => setFuAmount(e.target.value)} placeholder="0.00" />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor="fu-nt-date" className="text-xs">{nextType === "promise" ? "Promised date" : "Follow-up date"}</Label>
                            <Input id="fu-nt-date" type="date" className="h-8 bg-white" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="fu-nt-notes" className="text-xs">Notes (optional)</Label>
                          <Textarea id="fu-nt-notes" rows={2} className="bg-white text-sm" value={fuNotes} onChange={e => setFuNotes(e.target.value)} />
                        </div>
                        <div className="flex justify-between">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("none")}>
                            <ArrowLeft className="h-3.5 w-3.5" /> Back
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs"
                            disabled={
                              !fuDate ||
                              (nextType === "promise" && (!fuAmount || Number(fuAmount) <= 0)) ||
                              createNext.isPending
                            }
                            onClick={() =>
                              createNext.mutate({
                                taskId: task.id,
                                nextType,
                                amount: fuAmount ? Number(fuAmount) : undefined,
                                date: new Date(`${fuDate}T12:00:00`).getTime(),
                                notes: fuNotes || undefined,
                              })
                            }
                          >
                            Close & create next
                          </Button>
                        </div>
                      </div>
                    )}
                    {fuMode === "reschedule" && (
                      <div className="grid gap-2">
                        <div className="grid gap-1">
                          <Label htmlFor="fu-re-date" className="text-xs">New follow-up date</Label>
                          <Input id="fu-re-date" type="date" className="h-8 bg-white" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                        </div>
                        <div className="flex justify-between">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("none")}>
                            <ArrowLeft className="h-3.5 w-3.5" /> Back
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs"
                            disabled={!fuDate || reschedule.isPending}
                            onClick={() => reschedule.mutate({ id: task.id, dueDate: new Date(`${fuDate}T12:00:00`).getTime() })}
                          >
                            Reschedule
                          </Button>
                        </div>
                      </div>
                    )}
                    {fuMode === "promise" && (
                      <div className="grid gap-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="grid gap-1">
                            <Label htmlFor="fu-pr-amount" className="text-xs">Promised amount (EUR)</Label>
                            <Input id="fu-pr-amount" type="number" min="0" step="0.01" className="h-8 bg-white" value={fuAmount} onChange={e => setFuAmount(e.target.value)} placeholder="0.00" />
                          </div>
                          <div className="grid gap-1">
                            <Label htmlFor="fu-pr-date" className="text-xs">Promised date</Label>
                            <Input id="fu-pr-date" type="date" className="h-8 bg-white" value={fuDate} onChange={e => setFuDate(e.target.value)} />
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="fu-pr-notes" className="text-xs">Notes (optional)</Label>
                          <Textarea id="fu-pr-notes" rows={2} className="bg-white text-sm" value={fuNotes} onChange={e => setFuNotes(e.target.value)} />
                        </div>
                        <div className="flex justify-between">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("none")}>
                            <ArrowLeft className="h-3.5 w-3.5" /> Back
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-3 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                            disabled={!fuDate || !fuAmount || Number(fuAmount) <= 0 || convertToPromise.isPending}
                            onClick={() =>
                              convertToPromise.mutate({
                                taskId: task.id,
                                amount: Number(fuAmount),
                                promisedDate: new Date(`${fuDate}T12:00:00`).getTime(),
                                notes: fuNotes || undefined,
                              })
                            }
                          >
                            Convert to Promise
                          </Button>
                        </div>
                      </div>
                    )}
                    {fuMode === "escalate" && (
                      <div className="grid gap-2">
                        <div className="grid gap-1">
                          <Label className="text-xs">Escalate to (defaults to the group's Account Manager)</Label>
                          <TeamMemberSelect value={fuAssignee} onChange={setFuAssignee} />
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">Watchers (optional — they follow the escalated task)</Label>
                          <div className="flex flex-wrap gap-1">
                            {(teamMembers ?? []).map(m => {
                              const selected = escWatcherIds.includes(m.id);
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${selected ? "border-transparent text-white" : "bg-white hover:bg-muted"}`}
                                  style={selected ? { backgroundColor: watcherColor(m.name) } : undefined}
                                  onClick={() =>
                                    setEscWatcherIds(prev =>
                                      prev.includes(m.id) ? prev.filter(id => id !== m.id) : [...prev, m.id]
                                    )
                                  }
                                >
                                  {selected && <CheckCircle2 className="h-3 w-3" />}
                                  {m.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-1">
                          <Label htmlFor="fu-es-note" className="text-xs">Note (optional)</Label>
                          <Textarea id="fu-es-note" rows={2} className="bg-white text-sm" value={fuNotes} onChange={e => setFuNotes(e.target.value)} placeholder="e.g. customer unresponsive after 3 calls" />
                        </div>
                        <div className="flex justify-between">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setFuMode("none")}>
                            <ArrowLeft className="h-3.5 w-3.5" /> Back
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-3 text-xs"
                            disabled={escalateTask.isPending}
                            onClick={() =>
                              escalateTask.mutate({
                                taskId: task.id,
                                assigneeId: fuAssignee ?? undefined,
                                note: fuNotes || undefined,
                                watcherIds: escWatcherIds.length > 0 ? escWatcherIds : undefined,
                              })
                            }
                          >
                            <ArrowUpCircle className="h-3.5 w-3.5" /> Escalate
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null
              )}

             {(task.status === "Pending" || task.status === "In Progress") && (
               <div className="flex gap-2 justify-end pt-1">
                  {!(task.promise && task.promise.status === "Pending") && (
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
                  )}
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
      {nextActionGroup && (
        <NextActionDialog
          group={nextActionGroup}
          open={nextActionGroup != null}
          onOpenChange={v => {
            if (!v) setNextActionGroup(null);
          }}
        />
      )}
    </>
  );
}

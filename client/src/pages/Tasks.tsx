import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import NewTaskDialog, { TASK_TYPES } from "@/components/NewTaskDialog";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEurFull, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, HandCoins, ListChecks, RefreshCw, ThumbsDown, ThumbsUp, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useSearch } from "wouter";

export default function Tasks() {
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery();
  const { data: teamMembers } = trpc.team.list.useQuery();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("Pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  // Deep link: /tasks?task=<id> opens that task's detail dialog (used by the
  // confirmation badges in the groups list).
  const searchString = useSearch();
  const [consumedParam, setConsumedParam] = useState(false);
  useEffect(() => {
    if (consumedParam || !tasks) return;
    const id = Number(new URLSearchParams(searchString).get("task"));
    if (id && tasks.some(t => t.id === id)) {
      const t = tasks.find(tk => tk.id === id)!;
      // Ensure the task is visible regardless of the current status filter.
      setStatusFilter(t.status === "Pending" ? "Pending" : "all");
      setOpenTaskId(id);
    }
    setConsumedParam(true);
  }, [tasks, searchString, consumedParam]);

  const runEngine = trpc.tasks.runEngine.useMutation({
    onSuccess: r => {
      toast.success(`Task engine run complete — ${r.created} new task(s) generated`);
      utils.tasks.invalidate();
      utils.forecast.dashboard.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const setStatus = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const setPromiseStatus = trpc.forecast.updatePromise.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(`Promise marked ${vars.status} — follow-up task completed`);
      utils.tasks.list.invalidate();
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

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      if (assigneeFilter === "unassigned" && t.assigneeId != null) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && t.assigneeId !== Number(assigneeFilter)) return false;
      return true;
    });
  }, [tasks, statusFilter, typeFilter, assigneeFilter]);

  const openTask = useMemo(() => (tasks ?? []).find(t => t.id === openTaskId) ?? null, [tasks, openTaskId]);
  const promiseStatusColors: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-700 border-amber-200",
    Kept: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Broken: "bg-red-100 text-red-700 border-red-200",
  };

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ListChecks className="h-6 w-6" /> Tasks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            SOP follow-up engine: +2, +15, +20 (SOA), +30 days from invoice due date, plus contract expiry alerts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewTaskDialog />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={runEngine.isPending}>
                <RefreshCw className={`h-4 w-4 ${runEngine.isPending ? "animate-spin" : ""}`} /> Run Task Engine Now
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Run the automatic task engine?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will scan all overdue invoices and can generate thousands of SOP follow-up tasks
                  (+2, +15, +20 SOA, +30 days). This may take several minutes. Are you sure?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => runEngine.mutate()}>Yes, generate tasks</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="In Progress">In Progress</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {TASK_TYPES.map(t => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
          <SelectTrigger className="w-52">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All assignees</SelectItem>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {(teamMembers ?? []).map(m => (
              <SelectItem key={m.id} value={String(m.id)}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No tasks match the filters. Use "Run Task Engine Now" to generate SOP follow-ups from overdue invoices.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Assignee</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => (
                  <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenTaskId(t.id)}>
                    <TableCell>
                      <Badge variant="outline" className={taskTypeColors[t.type] ?? ""}>
                        {t.type}
                      </Badge>
                      {t.promise && (
                        <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                          Promise
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{t.customerName ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-md">
                      <div>{t.title}</div>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{t.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="text-sm" onClick={e => e.stopPropagation()}>
                      <Select
                        value={t.assigneeId ? String(t.assigneeId) : "none"}
                        onValueChange={v => assignTask.mutate({ id: t.id, assigneeId: v === "none" ? null : Number(v) })}
                      >
                        <SelectTrigger className="h-7 w-36 text-xs border-dashed">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Unassigned —</SelectItem>
                          {(teamMembers ?? []).map(m => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(t.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={taskStatusColors[t.status] ?? ""}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      {(t.status === "Pending" || t.status === "In Progress") && (
                        <div className="flex gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-emerald-700 hover:text-emerald-800"
                            onClick={() => setStatus.mutate({ id: t.id, status: "Completed" })}
                          >
                            <CheckCircle2 className="h-4 w-4" /> Done
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="gap-1 text-muted-foreground"
                            onClick={() => setStatus.mutate({ id: t.id, status: "Cancelled" })}
                          >
                            <XCircle className="h-4 w-4" /> Cancel
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openTask !== null} onOpenChange={o => !o && setOpenTaskId(null)}>
        <DialogContent className="sm:max-w-lg">
          {openTask && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6">{openTask.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className={taskTypeColors[openTask.type] ?? ""}>{openTask.type}</Badge>
                  <Badge variant="outline" className={taskStatusColors[openTask.status] ?? ""}>{openTask.status}</Badge>
                  {openTask.promise && (
                    <Badge variant="outline" className={promiseStatusColors[openTask.promise.status] ?? ""}>
                      Promise {openTask.promise.status === "Broken" ? "Not Confirmed" : openTask.promise.status}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Customer</div>
                    <Link
                      href={`/customers/${openTask.customerId}`}
                      className="font-medium text-primary hover:underline"
                      onClick={() => setOpenTaskId(null)}
                    >
                      {openTask.customerName}
                    </Link>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Due date</div>
                    <div className="font-medium">{fmtDate(openTask.dueDate)}</div>
                  </div>
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground mb-1">Assignee</div>
                    <TeamMemberSelect
                      value={openTask.assigneeId ?? null}
                      onChange={id => assignTask.mutate({ id: openTask.id, assigneeId: id })}
                    />
                  </div>
                  {openTask.invoiceNumber && (
                    <div>
                      <div className="text-xs text-muted-foreground">Invoice</div>
                      <div className="font-mono">{openTask.invoiceNumber}</div>
                    </div>
                  )}
                  {openTask.completedAt && (
                    <div>
                      <div className="text-xs text-muted-foreground">Completed</div>
                      <div>{fmtDate(openTask.completedAt)}</div>
                    </div>
                  )}
                </div>
                {openTask.description && (
                  <div className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3 whitespace-pre-wrap">
                    {openTask.description}
                  </div>
                )}
                {openTask.completionNotes && (
                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Completion notes</div>
                    <div>{openTask.completionNotes}</div>
                  </div>
                )}

                {openTask.promise && (
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <HandCoins className="h-4 w-4" /> Promise-to-Pay
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <div className="text-xs text-muted-foreground">Amount</div>
                        <div className="font-mono font-semibold">{fmtEurFull(openTask.promise.amount)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Promised date</div>
                        <div>{fmtDate(openTask.promise.promisedDate)}</div>
                      </div>
                    </div>
                    {openTask.promise.notes && (
                      <div className="text-xs text-muted-foreground">{openTask.promise.notes}</div>
                    )}
                    {openTask.promise.status === "Pending" && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          disabled={setPromiseStatus.isPending}
                          onClick={() => setPromiseStatus.mutate({ id: openTask.promise!.id, status: "Kept" })}
                        >
                          <ThumbsUp className="h-4 w-4" /> Kept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-1"
                          disabled={setPromiseStatus.isPending}
                          onClick={() => setPromiseStatus.mutate({ id: openTask.promise!.id, status: "Broken" })}
                        >
                          <ThumbsDown className="h-4 w-4" /> Not Confirmed
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {(openTask.status === "Pending" || openTask.status === "In Progress") && (
                  <div className="flex gap-2 justify-end pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-emerald-700"
                      onClick={() => {
                        setStatus.mutate({ id: openTask.id, status: "Completed" });
                        setOpenTaskId(null);
                      }}
                    >
                      <CheckCircle2 className="h-4 w-4" /> Mark Done
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-muted-foreground"
                      onClick={() => {
                        setStatus.mutate({ id: openTask.id, status: "Cancelled" });
                        setOpenTaskId(null);
                      }}
                    >
                      <XCircle className="h-4 w-4" /> Cancel Task
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

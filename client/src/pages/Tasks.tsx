import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import NewTaskDialog from "@/components/NewTaskDialog";
import NextActionDialog from "@/components/NextActionDialog";
import { TeamMemberSelect } from "@/components/TeamMemberSelect";
import TaskCommentsThread from "@/components/TaskCommentsThread";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { fmtDate, fmtEurFull, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CalendarClock, CheckCircle2, FileText, HandCoins, ListChecks, Search, ThumbsDown, ThumbsUp, User as UserIcon, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useSearch } from "wouter";

export default function Tasks() {
  const cols = useResizableColumns("tasks", {
    type: 150,
    customer: 220,
    task: 280,
    invoice: 120,
    assignee: 150,
    due: 110,
    status: 110,
    actions: 120,
  });
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery();
  const { data: teamMembers } = trpc.team.list.useQuery();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("Pending");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  /** Inbox scope: all | mine (assigned to my linked team member) | created (created by me). */
  const [scopeFilter, setScopeFilter] = useState<string>("all");
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [nextActionGroup, setNextActionGroup] = useState<string | null>(null);
  const [editingDue, setEditingDue] = useState(false);
  const [newDue, setNewDue] = useState("");
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
      setStatusFilter(t.status === "Pending" ? "Pending" : t.status === "Cancelled" ? "Cancelled" : "all");
      setOpenTaskId(id);
    }
    setConsumedParam(true);
  }, [tasks, searchString, consumedParam]);

  const setStatus = trpc.tasks.updateStatus.useMutation({
    onSuccess: () => utils.tasks.list.invalidate(),
    onError: e => toast.error(e.message),
  });

  const setPromiseStatus = trpc.forecast.updatePromise.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(`Promise marked ${vars.status} — follow-up task completed`);
      utils.tasks.list.invalidate();
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
      if (vars.status === "Broken" && openTask) {
        // The customer did not pay — ask the user what happens next.
        setNextActionGroup(((openTask as any).groupName as string) ?? openTask.customerName ?? null);
      }
      // Close the detail dialog — the linked task has just been auto-completed.
      setOpenTaskId(null);
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

  const reschedule = trpc.tasks.reschedule.useMutation({
    onSuccess: r => {
      toast.success(`Due date updated${r.rescheduleCount > 0 ? ` — rescheduled ×${r.rescheduleCount}` : ""}`);
      setEditingDue(false);
      utils.tasks.list.invalidate();
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
      utils.calls.getOpenFollowUpTask.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (statusFilter === "all") {
        // "All statuses" intentionally hides Cancelled tasks — select "Cancelled" to see them.
        if (t.status === "Cancelled") return false;
      } else if (t.status !== statusFilter) return false;
      if (assigneeFilter === "unassigned" && t.assigneeId != null) return false;
      if (assigneeFilter !== "all" && assigneeFilter !== "unassigned" && t.assigneeId !== Number(assigneeFilter)) return false;
      if (scopeFilter === "created" && !(t as any).createdByMe) return false;
      if (scopeFilter === "received" && ((t as any).createdByMe || t.assigneeId == null)) return false;
      if (q) {
        const hay = `${(t as any).groupName ?? ""} ${t.customerName ?? ""} ${t.title ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, assigneeFilter, scopeFilter, search]);

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
            Manual tasks, promise follow-ups and internal assignments between colleagues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <NewTaskDialog />
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Tabs value={scopeFilter} onValueChange={setScopeFilter}>
          <TabsList>
            <TabsTrigger value="all">All tasks</TabsTrigger>
            <TabsTrigger value="created">Created by me</TabsTrigger>
            <TabsTrigger value="received">Assigned (from others)</TabsTrigger>
          </TabsList>
        </Tabs>
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
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search group or customer…"
            className="pl-8 w-56"
          />
        </div>
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
              No tasks match the filters. Create one with "New Task" or send invoices to a colleague from the Invoices page.
            </div>
          ) : (
            <Table className="table-fixed" style={{ width: cols.totalWidth, minWidth: "100%" }}>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["type", "Type"],
                      ["customer", "Group"],
                      ["task", "Task"],
                      ["invoice", "Invoice"],
                      ["assignee", "Assignee"],
                      ["due", "Due"],
                      ["status", "Status"],
                    ] as const
                  ).map(([key, label]) => (
                    <TableHead key={key} className="relative" style={cols.style(key)}>
                      <span className="block truncate pr-1">{label}</span>
                      <ColResizer col={key} api={cols} />
                    </TableHead>
                  ))}
                  <TableHead className="text-right" style={cols.style("actions")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => {
                  const isOverdue =
                    (t.status === "Pending" || t.status === "In Progress") &&
                    t.dueDate != null &&
                    Number(t.dueDate) < Date.now();
                  return (
                  <TableRow
                    key={t.id}
                    className={`cursor-pointer ${isOverdue ? "bg-red-50/70 hover:bg-red-100/70 dark:bg-red-950/30 dark:hover:bg-red-900/30" : ""}`}
                    onClick={() => setOpenTaskId(t.id)}
                  >
                    <TableCell className="overflow-hidden">
                      <Badge variant="outline" className={taskTypeColors[t.type] ?? ""}>
                        {t.type}
                      </Badge>
                      {t.promise && (
                        <Badge variant="outline" className="ml-1 bg-blue-50 text-blue-700 border-blue-200 text-[10px]">
                          Promise
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="font-medium overflow-hidden">
                      <span className="block truncate" title={(t as any).groupName ?? t.customerName ?? undefined}>
                        {(t as any).groupName ?? t.customerName ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm overflow-hidden">
                      <span className="block truncate" title={t.title}>
                        {t.title}
                        {(t as any).attachedInvoices?.length > 0 && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1" title={`${(t as any).attachedInvoices.length} attached invoice(s)`}>
                            <FileText className="h-3 w-3" />
                            {(t as any).attachedInvoices.length}
                          </span>
                        )}
                      </span>
                      {(t as any).creatorName && (
                        <span className="block text-[10px] text-muted-foreground truncate">by {(t as any).creatorName}</span>
                      )}
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
                    <TableCell className="text-sm">
                      {fmtDate(t.dueDate)}
                      {((t as any).rescheduleCount ?? 0) > 0 && (
                        <span
                          className="ml-1 inline-flex items-center rounded bg-amber-100 border border-amber-200 px-1 text-[10px] font-semibold text-amber-800"
                          title={`Due date pushed back ${(t as any).rescheduleCount} time(s)`}
                        >
                          ×{(t as any).rescheduleCount}
                        </span>
                      )}
                    </TableCell>
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={openTask !== null} onOpenChange={o => { if (!o) { setOpenTaskId(null); setEditingDue(false); } }}>
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
                  {((openTask as any).rescheduleCount ?? 0) > 0 && (
                    <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">
                      Rescheduled ×{(openTask as any).rescheduleCount}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-muted-foreground">Group</div>
                    <Link
                      href={`/groups/${encodeURIComponent((openTask as any).groupName ?? openTask.customerName ?? "")}`}
                      className="font-medium text-primary hover:underline"
                      onClick={() => setOpenTaskId(null)}
                    >
                      {(openTask as any).groupName ?? openTask.customerName}
                    </Link>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Due date</div>
                    {editingDue && (openTask.status === "Pending" || openTask.status === "In Progress") ? (
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
                          onClick={() => reschedule.mutate({ id: openTask.id, dueDate: new Date(`${newDue}T12:00:00`).getTime() })}
                        >
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingDue(false)}>
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="font-medium flex items-center gap-1.5">
                        {fmtDate(openTask.dueDate)}
                        {(openTask.status === "Pending" || openTask.status === "In Progress") && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            title="Change due date"
                            onClick={() => {
                              setNewDue(new Date(openTask.dueDate).toISOString().slice(0, 10));
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
                  {(() => {
                    const m = openTask.description?.match(/Contact: ([^.·]+)[.·]/);
                    return m ? (
                      <div>
                        <div className="text-xs text-muted-foreground">Contact</div>
                        <div className="flex items-center gap-1"><UserIcon className="h-3.5 w-3.5 text-muted-foreground" />{m[1].trim()}</div>
                      </div>
                    ) : null;
                  })()}
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

                {(openTask as any).attachedInvoices?.length > 0 && (
                  <div className="rounded-md border p-3 space-y-2">
                    <div className="text-sm font-medium flex items-center gap-1.5">
                      <FileText className="h-4 w-4" /> Attached invoices ({(openTask as any).attachedInvoices.length})
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {(openTask as any).attachedInvoices.map((inv: any) => (
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

                <TaskCommentsThread taskId={openTask.id} />
              </div>
            </>
          )}
        </DialogContent>
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
    </div>
  );
}

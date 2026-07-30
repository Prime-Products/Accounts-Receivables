import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import NewTaskDialog from "@/components/NewTaskDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { WatcherStack } from "@/components/WatcherStack";
import { fmtDate, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, FileText, ListChecks, Search, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearch } from "wouter";

export default function Tasks() {
  const cols = useResizableColumns("tasks", {
    type: 150,
    customer: 220,
    task: 280,
    invoice: 120,
    assignee: 150,
    watchers: 110,
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
                      ["watchers", "Watchers"],
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
                    <TableCell className="overflow-hidden">
                      <WatcherStack watchers={((t as any).watchers ?? []) as any} max={3} size="sm" />
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

      <TaskDetailDialog
        taskId={openTaskId}
        open={openTaskId !== null}
        onOpenChange={o => { if (!o) setOpenTaskId(null); }}
      />
    </div>
  );
}

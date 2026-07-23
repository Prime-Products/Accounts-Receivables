import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ListChecks, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const TYPES = [
  "Follow-up +2",
  "Reminder +15",
  "Follow-up +20 SOA",
  "Escalation +30",
  "Contract Expiry",
  "Manual",
] as const;

export default function Tasks() {
  const { data: tasks, isLoading } = trpc.tasks.list.useQuery();
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("Pending");
  const [typeFilter, setTypeFilter] = useState<string>("all");

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

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (typeFilter !== "all" && t.type !== typeFilter) return false;
      return true;
    });
  }, [tasks, statusFilter, typeFilter]);

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
        <Button variant="outline" className="gap-2" onClick={() => runEngine.mutate()} disabled={runEngine.isPending}>
          <RefreshCw className={`h-4 w-4 ${runEngine.isPending ? "animate-spin" : ""}`} /> Run Task Engine Now
        </Button>
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
            {TYPES.map(t => (
              <SelectItem key={t} value={t}>
                {t}
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
                  <TableHead>Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(t => (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Badge variant="outline" className={taskTypeColors[t.type] ?? ""}>
                        {t.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{t.customerName ?? "—"}</TableCell>
                    <TableCell className="text-sm max-w-md">
                      <div>{t.title}</div>
                      {t.description && <div className="text-xs text-muted-foreground">{t.description}</div>}
                    </TableCell>
                    <TableCell className="text-sm font-mono">{t.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(t.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={taskStatusColors[t.status] ?? ""}>
                        {t.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
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
    </div>
  );
}

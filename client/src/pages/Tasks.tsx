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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, taskStatusColors, taskTypeColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ChevronsUpDown, ListChecks, Plus, RefreshCw, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const TYPES = [
  "Follow-up +2",
  "Follow-up +15",
  "Follow-up +20 SOA",
  "Escalation +30",
  "Contract Expiry",
  "Manual",
] as const;

function NewTaskDialog() {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [type, setType] = useState<string>("Manual");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data: customers } = trpc.customers.list.useQuery(undefined, { enabled: open });
  const selected = customers?.find(c => c.id === customerId);

  const create = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      utils.tasks.invalidate();
      utils.forecast.dashboard.invalidate();
      setOpen(false);
      setCustomerId(null);
      setTitle("");
      setDescription("");
      setType("Manual");
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    if (!customerId) return toast.error("Select a customer");
    if (!title.trim()) return toast.error("Enter a task title");
    if (!dueDate) return toast.error("Select a due date");
    create.mutate({
      customerId,
      type: type as (typeof TYPES)[number],
      title: title.trim(),
      description: description.trim() || undefined,
      dueDate: new Date(`${dueDate}T12:00:00`).getTime(),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Customer</Label>
            <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                  <span className="truncate">{selected ? selected.name : "Select customer…"}</span>
                  <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search customer…" />
                  <CommandList>
                    <CommandEmpty>No customer found.</CommandEmpty>
                    <CommandGroup>
                      {(customers ?? []).map(c => (
                        <CommandItem
                          key={c.id}
                          value={c.name}
                          onSelect={() => {
                            setCustomerId(c.id);
                            setCustomerOpen(false);
                          }}
                        >
                          {c.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map(t => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Call customer about overdue balance" />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="Details, notes, agreed actions…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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

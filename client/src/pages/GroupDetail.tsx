import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import GroupAiSummaryDialog from "@/components/GroupAiSummaryDialog";
import CollectionNotesBox from "@/components/CollectionNotesBox";
import GroupNotesDialog from "@/components/GroupNotesDialog";
import LogCallDialog from "@/components/LogCallDialog";
import LogCallLauncher from "@/components/LogCallLauncher";
import SendEmailDialog from "@/components/SendEmailDialog";
import TaskDetailDialog from "@/components/TaskDetailDialog";
import { ActivityLog } from "@/components/ActivityLog";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { AccountManagerControl } from "@/components/AccountManagerControl";
import { InvoicesTable } from "@/components/InvoicesTable";
import { hideSettled, countSettled, matchesStatusFilter } from "@/lib/invoiceFilters";
import { UnallocatedTransfersTable } from "@/components/UnallocatedTransfersTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, ratingColors, confirmationStatusColors, confirmationStatusLabels } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, Eye, EyeOff, FileDown, Filter, HandCoins, Layers, Pencil, Phone, Plus, Sparkles, StickyNote, Trash2, History, MoreVertical } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import InstallmentToggle from "@/components/InstallmentToggle";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

const AGING_BUCKETS = ["all", "0-30", "31-60", "61-90", "91-120", "120+"] as const;
type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Click-to-edit forecast amount on the group card. Saving corrects the month's forecast (expected + initial baseline). */
function EditableGroupForecast({ group, value, reasoning }: { group: string; value: number; reasoning?: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const setForecast = trpc.forecast.setGroupForecast.useMutation({
    onSuccess: () => {
      toast.success("Forecast updated");
      utils.customers.groupForecast.invalidate();
      utils.customers.groupDetail.invalidate();
      utils.customers.groups.invalidate();
      utils.forecast.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const save = () => {
    const amount = Number(draft.replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      toast.error("Enter a valid non-negative amount");
      return;
    }
    setEditing(false);
    if (amount !== value) setForecast.mutate({ group, amount });
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="text"
        inputMode="decimal"
        className="h-8 w-32 font-mono text-lg px-2"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      className={`group/gfc inline-flex items-center gap-1.5 text-xl font-bold font-mono text-emerald-700 hover:underline decoration-dotted underline-offset-4 ${
        setForecast.isPending ? "opacity-50" : ""
      }`}
      title={reasoning ? `${reasoning}\n\nClick to correct this month's forecast` : "Click to correct this month's forecast"}
      onClick={() => {
        setDraft(value ? String(value) : "");
        setEditing(true);
      }}
    >
      {fmtEur(value)}
      <Pencil className="h-3.5 w-3.5 opacity-30 group-hover/gfc:opacity-70 shrink-0" />
    </button>
  );
}

/** Actions dropdown menu for group-level interactions */
function ActionsMenu({
  companies,
  defaultCustomerId,
  group,
}: {
  companies: { id: number; name: string }[];
  defaultCustomerId?: number;
  group: string;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  return (
    <>
      {/* Log Call — primary standalone action */}
      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => setCallOpen(true)}>
        <Phone className="h-4 w-4" /> Log Call
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <Plus className="h-4 w-4" /> Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTaskOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNoteOpen(true)}>
            <StickyNote className="h-4 w-4 mr-2" /> Add Note
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEmailOpen(true)}>
            <StickyNote className="h-4 w-4 mr-2" /> Send Email
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewTaskDialog
        customerIds={companies.map(c => c.id)}
        defaultCustomerId={defaultCustomerId}
        hideCustomerPicker
        trigger={<Button className="hidden">Hidden</Button>}
        open={taskOpen}
        onOpenChange={setTaskOpen}
      />

      <SendEmailDialog
        companies={companies}
        defaultCustomerId={defaultCustomerId}
        groupName={group}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />

      <GroupNotesDialog group={group} open={noteOpen} onOpenChange={setNoteOpen} />

      {callOpen && (
        <LogCallLauncher
          group={group}
          companies={companies}
          defaultCustomerId={defaultCustomerId}
          open={callOpen}
          onOpenChange={setCallOpen}
        />
      )}
    </>
  );
}

/** Shared company picker for group-level action dialogs. */
function CompanyPicker({
  companies,
  value,
  onChange,
}: {
  companies: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Company</Label>
      <Select value={value ? String(value) : undefined} onValueChange={v => onChange(Number(v))}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select company…" />
        </SelectTrigger>
        <SelectContent>
          {companies.map(c => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Clickable confirmation-status badge for the group header — same behavior as the
 * groups list: a linked task opens inline in TaskDetailDialog, otherwise Log Call.
 * Turns red when the linked task is still open past its due date.
 */
function GroupConfirmationBadge({
  group,
  companies,
  status,
  taskId,
  taskOverdue,
}: {
  group: string;
  companies: { id: number; name: string }[];
  status: string;
  taskId: number | null;
  taskOverdue?: boolean;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const taskBacked = status === "Pending Follow-up" || status === "Confirmed" || status === "Escalated";
  const hasLinkedTask = taskId !== null && taskBacked;
  const isOverdue = !!taskOverdue && taskBacked;
  return (
    <>
      <button
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${
          isOverdue
            ? "bg-red-100 text-red-700 border-red-300"
            : confirmationStatusColors[status] || "bg-gray-100 text-gray-700 border-gray-200"
        }`}
        title={
          isOverdue
            ? "Overdue task — the target date has passed and the linked task is still open. Click to open it."
            : hasLinkedTask
              ? "Click to open the linked follow-up task"
              : "Click to log a call and change the confirmation status"
        }
        onClick={() => (hasLinkedTask ? setTaskOpen(true) : setCallOpen(true))}
      >
        {isOverdue && <AlertTriangle className="h-3 w-3 text-red-600" />}
        {confirmationStatusLabels[status] ?? status}
        <Phone className="h-3 w-3 opacity-40" />
      </button>
      {taskOpen && <TaskDetailDialog taskId={taskId} open={taskOpen} onOpenChange={setTaskOpen} />}
      {callOpen && (
        <LogCallDialog group={group} companies={companies} open={callOpen} onOpenChange={setCallOpen} />
      )}
    </>
  );
}

function GroupPromiseDialog({ companies, defaultCustomerId, open: externalOpen, onOpenChange }: { companies: { id: number; name: string }[]; defaultCustomerId?: number; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (newOpen: boolean) => {
    if (externalOpen !== undefined) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);
  const [form, setForm] = useState({ amount: "", date: "", notes: "" });
  const addPromise = trpc.forecast.addPromise.useMutation({
    onSuccess: () => {
      toast.success("Promise-to-pay recorded");
      utils.customers.invalidate();
      utils.forecast.invalidate();
      setOpen(false);
      setForm({ amount: "", date: "", notes: "" });
    },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setCustomerId(defaultCustomerId ?? null);
      }}
    >
      {externalOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <HandCoins className="h-4 w-4" /> Promise-to-Pay
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Promise-to-Pay</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (€)</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Promised date</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!customerId || !form.amount || !form.date || addPromise.isPending}
            onClick={() =>
              addPromise.mutate({
                customerId: customerId!,
                amount: Number(form.amount),
                promisedDate: new Date(form.date).getTime(),
                notes: form.notes || undefined,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupDetail() {
  const [, params] = useRoute("/groups/:name");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const group = decodeURIComponent(params?.name ?? "");
  const [companyId, setCompanyId] = useState<string>("all");
  const [branch, setBranch] = useState<string>("all");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [invoiceView, setInvoiceView] = useState<"list" | "byBranch">("list");
  const [installmentFilter, setInstallmentFilter] = useState<"all" | "installments">("all");
  // The transactions list is a collection worklist, so settled invoices are hidden
  // by default; the toggle brings them back for reconciliation/history checks.
  const [showPaid, setShowPaid] = useState(false);

  // Convert aging bucket to minDaysOverdue for queries
  const getMinDaysOverdue = (bucket: AgingBucket): number | undefined => {
    if (bucket === "all") return undefined;
    if (bucket === "0-30") return 0;
    if (bucket === "31-60") return 31;
    if (bucket === "61-90") return 61;
    if (bucket === "91-120") return 91;
    if (bucket === "120+") return 120;
    return undefined;
  };



  const query = useMemo(
    () => ({
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
    }),
    [group, companyId, branch],
  );
  const { data, isLoading } = trpc.customers.groupDetail.useQuery(query, { enabled: !!group });
  const { data: groupForecast } = trpc.customers.groupForecast.useQuery({ group }, { enabled: !!group });

  /** Bucket an overdue invoice by days overdue (same rule as the Invoices page). */
  const bucketOf = (dueDate: number, now: number): "0-30" | "31-60" | "61-90" | "91-120" | "120+" | null => {
    if (now <= dueDate) return null;
    const d = Math.floor((now - dueDate) / (24 * 60 * 60 * 1000));
    if (d <= 30) return "0-30";
    if (d <= 60) return "31-60";
    if (d <= 90) return "61-90";
    if (d <= 120) return "91-120";
    return "120+";
  };

  // Full aging of the current scope — always computed over ALL invoices so the cards
  // keep showing every bucket's totals regardless of the selected filter (like Invoices page).
  const computedAging = useMemo(() => {
    if (!data?.invoices) return null;
    const mk = () => ({ amount: 0, count: 0, byCur: {} as Record<string, number> });
    const buckets: Record<"0-30" | "31-60" | "61-90" | "91-120" | "120+", ReturnType<typeof mk>> = {
      "0-30": mk(),
      "31-60": mk(),
      "61-90": mk(),
      "91-120": mk(),
      "120+": mk(),
    };
    let current = 0;
    let currentCount = 0;
    const now = Date.now();
    for (const inv of data.invoices) {
      if (inv.status === "Paid") continue;
      const outstandingEur = Number(inv.amountEur ?? inv.amount) - Number(inv.paidAmount) * (Number(inv.amountEur ?? inv.amount) / Math.max(Number(inv.amount), 0.01));
      const outstandingRaw = Number(inv.amount) - Number(inv.paidAmount);
      if (outstandingRaw <= 0) continue;
      const b = bucketOf(inv.dueDate, now);
      if (b === null) {
        current += outstandingEur;
        currentCount += 1;
        continue;
      }
      buckets[b].amount += outstandingEur;
      buckets[b].count += 1;
      const cur = (inv.currency ?? "EUR").toUpperCase();
      buckets[b].byCur[cur] = (buckets[b].byCur[cur] ?? 0) + outstandingRaw;
    }
    return { buckets, current, currentCount };
  }, [data?.invoices]);

  // Invoices matching the selected status + aging bucket — powers the list and totals row.
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    const now = Date.now();
    return data.invoices.filter(inv => {
      if (hideSettled(inv as any, showPaid, statusFilter)) return false;
      if (!matchesStatusFilter(inv as any, statusFilter)) return false;
      if (installmentFilter === "installments" && !(inv as any).isContractInstallment) return false;
      if (agingFilter !== "all") {
        if (inv.status === "Paid") return false;
        if (Number(inv.amount) - Number(inv.paidAmount) <= 0) return false;
        if (bucketOf(inv.dueDate, now) !== agingFilter) return false;
      }
      return true;
    });
  }, [data?.invoices, agingFilter, statusFilter, installmentFilter, showPaid]);

  /** How many settled invoices are currently being hidden (for the toggle label). */
  const paidHiddenCount = useMemo(() => {
    if (!data?.invoices) return 0;
    return countSettled(data.invoices as any);
  }, [data?.invoices]);

  /** Totals of the currently filtered invoice list: EUR + per-currency (like Invoices page). */
  const filteredTotals = useMemo(() => {
    let eurTotal = 0;
    const byCur: Record<string, number> = {};
    for (const i of filteredInvoices) {
      if (i.status === "Paid") continue;
      const raw = Number(i.amount) - Number(i.paidAmount);
      if (raw <= 0) continue;
      const ratio = Number(i.amount) > 0 ? Number(i.amountEur ?? i.amount) / Number(i.amount) : 1;
      eurTotal += raw * ratio;
      const cur = (i.currency ?? "EUR").toUpperCase();
      byCur[cur] = (byCur[cur] ?? 0) + raw;
    }
    return { eurTotal, byCur, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const exportSoa = trpc.reports.export.useMutation({
    onSuccess: r => {
      downloadBase64(r.filename, r.mimeType, r.base64);
      toast.success("Group Statement of Account downloaded");
    },
    onError: e => toast.error(e.message),
  });
  const doExport = (format: "pdf" | "xlsx") =>
    exportSoa.mutate({
      report: "soa-group",
      format,
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
      minDaysOverdue: getMinDaysOverdue(agingFilter),
    });

  const scopeLabel =
    companyId === "all" && branch === "all" && agingFilter === "all" && statusFilter === "all"
      ? "Whole group"
      : [
          companyId !== "all" ? data?.companies.find(c => String(c.id) === companyId)?.name : null,
          branch !== "all" ? branchShort(branch) : null,
          statusFilter !== "all" ? statusFilter : null,
          agingFilter !== "all" ? `${agingFilter} days overdue` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const defaultActionCustomerId =
    companyId !== "all"
      ? Number(companyId)
      : data
        ? [...data.companies].sort((a, b) => Number(b.openBalance ?? 0) - Number(a.openBalance ?? 0))[0]?.id
        : undefined;

  if (!group) return null;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4" /> Group List
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6" /> {group}
              {data?.rating && (
                <Badge
                  variant="outline"
                  className={`${ratingColors[data.rating.rating] ?? ""} font-mono text-sm`}
                  title={`Credit score ${data.rating.score}/100\n${data.rating.factors.map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`).join("\n")}`}
                >
                  {data.rating.rating} · {data.rating.score}
                </Badge>
              )}
              {data && <WatchStatusSelect group={group} effective={data.watchStatus ?? null} />}
              {data && (data as any).confirmationStatus && (
                <GroupConfirmationBadge
                  group={group}
                  companies={data.companies}
                  status={(data as any).confirmationStatus}
                  taskId={(data as any).confirmationTaskId ?? null}
                  taskOverdue={(data as any).confirmationTaskOverdue ?? false}
                />
              )}
              {data && (data as any).confirmationCarriedOver && (
                <span
                  className="text-[11px] text-amber-600 font-normal inline-flex items-center gap-1"
                  title="Recorded in a previous month — still active until its date"
                >
                  ↻ Carried over
                </span>
              )}
              {data && (
                <AccountManagerControl
                  manager={(data as any).accountManager ?? null}
                  groupName={group}
                />
              )}
              {data && (
                <AccountManagerControl
                  role="collector"
                  manager={(data as any).collector ?? null}
                  groupName={group}
                />
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Group card — {data ? `${data.companies.length} companies` : "…"} · showing: {scopeLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && data.companies.length > 0 && (
            <>
              {/* Actions Dropdown */}
              <ActionsMenu
                key={companyId}
                companies={data.companies}
                defaultCustomerId={defaultActionCustomerId}
                group={group}
              />
              <GroupAiSummaryDialog group={group} />
            </>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => doExport("pdf")} disabled={exportSoa.isPending}>
            <FileDown className="h-4 w-4" /> SOA (PDF)
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => doExport("xlsx")} disabled={exportSoa.isPending}>
            <FileDown className="h-4 w-4" /> SOA (Excel)
          </Button>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-64 h-9">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies (group)</SelectItem>
              {(data?.companies ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {(data?.branches ?? []).map(b => (
                <SelectItem key={b} value={b}>
                  {branchShort(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const).map(s => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* KPI cards for current scope */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Balance</div>
                <div className="text-xl font-bold font-mono">{fmtEur((data.totals as any).netOpenBalance ?? data.totals.openBalance)}</div>
                {((data.totals as any).unallocatedPayments ?? 0) > 0.005 && (
                  <div
                    className="text-[11px] font-mono mt-0.5 text-emerald-600"
                    title="Open invoices minus payments on account that are not yet allocated"
                  >
                    {fmtEur(data.totals.openBalance)} inv − {fmtEur((data.totals as any).unallocatedPayments)} on acct
                  </div>
                )}
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtByCurrency(data.totals.openByCurrency, { skipEurOnly: true })}
                </div>
                <div
                  className="text-[11px] font-mono mt-0.5 text-blue-600"
                  title="Open invoices falling due within the next calendar month"
                >
                  Due next month: {fmtEur((data.totals as any).dueNextMonth ?? 0)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className={`text-xl font-bold font-mono ${data.totals.overdueBalance > 0 ? "text-red-600" : ""}`}>
                  {fmtEur(data.totals.overdueBalance)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{data.totals.overdueCount} overdue invoice(s)</div>
                <div className="text-[11px] font-mono mt-0.5 text-orange-600" title="Overdue by end of the current month (today's overdue + invoices falling due until month end)">
                  EOM: {fmtEur(data.overdueEomBalance)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Forecast (this month)</div>
                {groupForecast && (groupForecast as any).hasForecast !== false ? (
                  <>
                    <EditableGroupForecast group={group} value={groupForecast.expectedAmount} reasoning={groupForecast.aiReasoning} />
                    <div className="text-[11px] font-mono mt-0.5">
                      <span className="text-muted-foreground">Expected: </span>
                      <span className="font-semibold">
                        {fmtEur((data as any).expectedToCollect ?? groupForecast.expectedAmount)}
                      </span>
                    </div>
                    {(() => {
                      const variance =
                        (data as any).expectedVariance ??
                        ((data as any).expectedToCollect ?? groupForecast.expectedAmount) - groupForecast.expectedAmount;
                      return (
                        <div
                          className={`text-[11px] font-mono mt-0.5 ${variance >= 0 ? "text-emerald-600" : "text-red-600"}`}
                          title="Expected to Collect vs Forecast"
                        >
                          {variance >= 0 ? "+" : ""}
                          {fmtEur(variance)} vs forecast
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="mt-1">
                    <EditableGroupForecast group={group} value={0} />
                    <div className="text-[11px] text-muted-foreground mt-0.5">No forecast yet — click to set one</div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Paid (this month)</div>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  {groupForecast ? fmtEur(groupForecast.collected) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">collected within current month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Remain to Collect (this month)</div>
                <div className={`text-xl font-bold font-mono ${groupForecast && groupForecast.remaining > 0 ? "text-amber-600" : ""}`}>
                  {groupForecast && (groupForecast as any).hasForecast !== false ? fmtEur(groupForecast.remaining) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">vs forecast expected this month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Turnover (up to day)</div>
                <div className="text-xl font-bold font-mono text-blue-700">
                  {data.totals.turnoverYtd > 0 ? fmtEur(data.totals.turnoverYtd) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                  last year: {data.totals.turnoverLastYear > 0 ? fmtEur(data.totals.turnoverLastYear) : "—"}
                  {data.totals.turnoverYtd > 0 && data.totals.turnoverLastYear > 0 && (
                    <span className={data.totals.turnoverYtd >= data.totals.turnoverLastYear ? "text-emerald-600" : "text-amber-600"}>
                      {" "}· {((data.totals.turnoverYtd / data.totals.turnoverLastYear - 1) * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Always-visible collection notes: call preferences & customer particularities */}
          <CollectionNotesBox group={group} />

          {/* Aging for current scope */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aging (current scope)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Current (not due)</div>
                  <div className="text-lg font-bold font-mono">{fmtEur(computedAging?.current ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">{computedAging?.currentCount ?? 0} invoice(s)</div>
                </div>
                {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setAgingFilter(agingFilter === b ? "all" : b)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      agingFilter === b ? "ring-2 ring-primary bg-primary/5" : "bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{b} days overdue</div>
                    <div className="text-lg font-bold font-mono">{fmtEur(computedAging?.buckets[b].amount ?? 0)}</div>
                    <div className="text-xs text-muted-foreground">{computedAging?.buckets[b].count ?? 0} invoice(s)</div>
                    {fmtByCurrency(computedAging?.buckets[b].byCur, { skipEurOnly: true }) && (
                      <div
                        className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate"
                        title={fmtByCurrency(computedAging?.buckets[b].byCur)}
                      >
                        {fmtByCurrency(computedAging?.buckets[b].byCur)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filtered totals: EUR + per-currency (like Invoices page) */}
          {filteredInvoices.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">{filteredTotals.count} invoice(s) shown</span>
              {statusFilter !== "all" && (
                <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30">
                  {statusFilter}
                  <button
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    title="Clear status filter"
                    onClick={() => setStatusFilter("all")}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {agingFilter !== "all" && (
                <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30">
                  {agingFilter} days overdue
                  <button
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    title="Clear aging filter"
                    onClick={() => setAgingFilter("all")}
                  >
                    ×
                  </button>
                </Badge>
              )}
              <span>
                Outstanding total: <span className="font-mono font-semibold">{fmtEur(filteredTotals.eurTotal)}</span>
              </span>
              {!showPaid && paidHiddenCount > 0 && (
                <span className="text-muted-foreground text-xs">
                  {paidHiddenCount} settled invoice(s) hidden
                </span>
              )}
              {fmtByCurrency(filteredTotals.byCur, { skipEurOnly: true }) && (
                <span className="text-muted-foreground">
                  Per currency: <span className="font-mono">{fmtByCurrency(filteredTotals.byCur)}</span>
                </span>
              )}
            </div>
          )}

          {/* Invoices for current scope */}
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Transactions ({scopeLabel})</CardTitle>
              <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={showPaid ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1.5 border"
                onClick={() => setShowPaid(p => !p)}
                title={
                  showPaid
                    ? "Hide fully paid invoices — show only what is still outstanding"
                    : "Also show fully paid invoices (history / reconciliation)"
                }
              >
                {showPaid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPaid ? "Hide paid" : `Show paid${paidHiddenCount > 0 ? ` (${paidHiddenCount})` : ""}`}
              </Button>
              <InstallmentToggle value={installmentFilter} onChange={setInstallmentFilter} />
              <div className="flex items-center rounded-md border p-0.5">
                <Button
                  size="sm"
                  variant={invoiceView === "list" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setInvoiceView("list")}
                >
                  List
                </Button>
                <Button
                  size="sm"
                  variant={invoiceView === "byBranch" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setInvoiceView("byBranch")}
                >
                  By branch
                </Button>
              </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoiceView === "byBranch" ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                        <TableHead className="text-right">Outstanding (EUR)</TableHead>
                        <TableHead className="text-right">% of total</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const byBranch = new Map<string, { count: number; totalEur: number }>();
                        for (const i of filteredInvoices) {
                          // Outstanding, not the invoice face value — a partly paid
                          // invoice must only contribute what is still owed.
                          const raw = Number(i.amount) - Number(i.paidAmount);
                          if (raw <= 0.005) continue;
                          const ratio = Number(i.amount) > 0 ? Number(i.amountEur ?? i.amount) / Number(i.amount) : 1;
                          const key = branchShort(i.company);
                          const cur = byBranch.get(key) ?? { count: 0, totalEur: 0 };
                          cur.count += 1;
                          cur.totalEur += raw * ratio;
                          byBranch.set(key, cur);
                        }
                        const grand = Array.from(byBranch.values()).reduce((s, b) => s + b.totalEur, 0);
                        const rows = Array.from(byBranch.entries()).sort((a, b) => b[1].totalEur - a[1].totalEur);
                        return rows.map(([b, v]) => (
                          <TableRow
                            key={b}
                            className="cursor-pointer"
                            onClick={() => {
                              const full = (data.branches ?? []).find(x => branchShort(x) === b);
                              setBranch(full && branchShort(branch) !== b ? full : "all");
                              setInvoiceView("list");
                            }}
                          >
                            <TableCell>
                              <Badge variant="outline" className={`text-[11px] ${branchColors[b] ?? ""}`}>
                                {b}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{v.count}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{fmtEur(v.totalEur)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {grand > 0 ? `${((v.totalEur / grand) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">View invoices →</TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  <p className="px-4 py-2 text-[11px] text-muted-foreground">
                    Open invoices in the current scope, grouped per Prime branch (non-EUR converted to EUR). Click a branch to see its invoices.
                  </p>
                </>
              ) : (
              <>
              <UnallocatedTransfersTable rows={(data as any).openTransfers ?? []} />
              <div className="max-h-[480px] overflow-auto">
                <InvoicesTable
                  rows={filteredInvoices as any}
                  onDisputeChanged={() => utils.customers.groupDetail.invalidate()}
                />
              </div>
              </>
              )}
            </CardContent>
          </Card>

          {/* Unified Activity Log */}
          {data?.activityLogs && <ActivityLog activities={data.activityLogs} />}

          {/* Payment history, contracts & tasks across the group (unified card) */}
          <GroupActivityTabs group={group} />
        </>
      )}
    </div>
  );
}

const taskStatusColors: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

/** Payment history, contracts, and tasks aggregated across the member companies (unified card tabs). */
function GroupActivityTabs({ group }: { group: string }) {
  const { data, isLoading } = trpc.customers.groupActivity.useQuery({ group });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Group activity</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="receipts">
          <TabsList>
            <TabsTrigger value="receipts">Payment History{data ? ` (${data.receipts.length})` : ""}</TabsTrigger>
            <TabsTrigger value="contracts">Contracts{data ? ` (${data.contracts.length})` : ""}</TabsTrigger>
            <TabsTrigger value="tasks">Tasks{data ? ` (${data.tasks.length})` : ""}</TabsTrigger>
            <TabsTrigger value="emails">Emails{data ? ` (${data.emails?.length ?? 0})` : ""}</TabsTrigger>
          </TabsList>
          {isLoading || !data ? (
            <Skeleton className="h-40 mt-3" />
          ) : (
            <>
              <TabsContent value="receipts">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.receipts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            No payments recorded
                          </TableCell>
                        </TableRow>
                      )}
                      {data.receipts.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.receiptDate)}</TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={r.customerName}>{r.customerName}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.receiptNumber || "—"}</TableCell>
                          <TableCell className="text-sm">{r.method || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtEur(Number(r.amount))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="contracts">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.contracts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                            No contracts
                          </TableCell>
                        </TableRow>
                      )}
                      {data.contracts.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.contractNumber}</TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={c.customerName}>{c.customerName}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.startDate)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{c.endDate ? fmtDate(c.endDate) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtEur(Number(c.totalValue))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="tasks">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tasks.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            No tasks
                          </TableCell>
                        </TableRow>
                      )}
                      {data.tasks.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm max-w-72">
                            <div className="truncate" title={t.title}>{t.title}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={t.customerName}>{t.customerName}</div>
                          </TableCell>
                          <TableCell className="text-xs">{t.type}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{t.dueDate ? fmtDate(t.dueDate) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${taskStatusColors[t.status] ?? ""}`}>{t.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="emails">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.emails.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                            No emails sent
                          </TableCell>
                        </TableRow>
                      )}
                      {data.emails.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(e.createdAt instanceof Date ? e.createdAt.getTime() : e.createdAt)}</TableCell>
                          <TableCell className="text-sm max-w-48">
                            <div className="truncate" title={e.recipientEmail}>{e.recipientEmail}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={e.customerName}>{e.customerName}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-64">
                            <div className="truncate" title={e.subject}>{e.subject}</div>
                          </TableCell>
                          <TableCell className="text-xs">{e.templateType}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${e.status === "Sent" ? "bg-green-50 text-green-700 border-green-200" : e.status === "Failed" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{e.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

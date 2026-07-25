import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import GroupAiSummaryDialog from "@/components/GroupAiSummaryDialog";
import GroupNotesDialog from "@/components/GroupNotesDialog";
import LogCallDialog from "@/components/LogCallDialog";
import SendEmailDialog from "@/components/SendEmailDialog";
import { ActivityLog } from "@/components/ActivityLog";
import WatchStatusSelect from "@/components/WatchStatusSelect";
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
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, onHoldStatusColors, ratingColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Building2, ChevronDown, FileDown, Filter, HandCoins, Layers, Pencil, Phone, Plus, Sparkles, StickyNote, Trash2, History, MoreVertical } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

const AGING_BUCKETS = ["all", "0-30", "31-60", "61-90", "91-120", "120+"] as const;
type AgingBucket = (typeof AGING_BUCKETS)[number];

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
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [callOpen, setCallOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" /> Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTaskOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setPromiseOpen(true)}>
            <HandCoins className="h-4 w-4 mr-2" /> Promise to Pay
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setEmailOpen(true)}>
            <StickyNote className="h-4 w-4 mr-2" /> Send Email
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNoteOpen(true)}>
            <StickyNote className="h-4 w-4 mr-2" /> Add Note
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCallOpen(true)}>
            <Phone className="h-4 w-4 mr-2" /> Log Call
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

      <GroupPromiseDialog
        companies={companies}
        defaultCustomerId={defaultCustomerId}
        open={promiseOpen}
        onOpenChange={setPromiseOpen}
      />

      <SendEmailDialog
        companies={companies}
        defaultCustomerId={defaultCustomerId}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />

      <GroupNotesDialog group={group} open={noteOpen} onOpenChange={setNoteOpen} />

      <LogCallDialog
        group={group}
        companies={companies}
        defaultCustomerId={defaultCustomerId}
        open={callOpen}
        onOpenChange={setCallOpen}
      />
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
  const group = decodeURIComponent(params?.name ?? "");
  const [companyId, setCompanyId] = useState<string>("all");
  const [branch, setBranch] = useState<string>("all");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("all");
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [invoiceView, setInvoiceView] = useState<"list" | "byBranch">("list");

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

  // Invoices matching the selected aging bucket — powers the list and totals row.
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    if (agingFilter === "all") return data.invoices;
    const now = Date.now();
    return data.invoices.filter(inv => {
      if (inv.status === "Paid") return false;
      if (Number(inv.amount) - Number(inv.paidAmount) <= 0) return false;
      return bucketOf(inv.dueDate, now) === agingFilter;
    });
  }, [data?.invoices, agingFilter]);

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
    companyId === "all" && branch === "all" && agingFilter === "all"
      ? "Whole group"
      : [
          companyId !== "all" ? data?.companies.find(c => String(c.id) === companyId)?.name : null,
          branch !== "all" ? branchShort(branch) : null,
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
            <ArrowLeft className="h-4 w-4" /> Customers
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
          <Select value={agingFilter} onValueChange={(v) => setAgingFilter(v as AgingBucket)}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Aging" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All invoices</SelectItem>
              <SelectItem value="0-30">0-30 days overdue</SelectItem>
              <SelectItem value="31-60">31-60 days overdue</SelectItem>
              <SelectItem value="61-90">61-90 days overdue</SelectItem>
              <SelectItem value="91-120">91-120 days overdue</SelectItem>
              <SelectItem value="120+">120+ days overdue</SelectItem>
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
                <div className="text-xl font-bold font-mono">{fmtEur(data.totals.openBalance)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtByCurrency(data.totals.openByCurrency, { skipEurOnly: true })}
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
                <div className="text-xs text-muted-foreground">AI Forecast (this month)</div>
                {groupForecast ? (
                  <>
                    <div className="text-[11px] text-muted-foreground font-mono mb-1">
                      Initial: {fmtEur(groupForecast.initialForecast ?? 0)} · Current: {fmtEur(groupForecast.expectedAmount)}
                    </div>
                    <div className="text-xl font-bold font-mono text-emerald-700" title={groupForecast.aiReasoning ?? undefined}>
                      {fmtEur(groupForecast.expectedAmount)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                      collected {fmtEur(groupForecast.collected)} · remaining {fmtEur(groupForecast.remaining)}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground mt-1">No forecast this month</div>
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
                  {groupForecast ? fmtEur(groupForecast.remaining) : "—"}
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
              <CardTitle className="text-base">Invoices ({scopeLabel})</CardTitle>
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
                          const key = branchShort(i.company);
                          const cur = byBranch.get(key) ?? { count: 0, totalEur: 0 };
                          cur.count += 1;
                          cur.totalEur += Number(i.amountEur ?? i.amount ?? 0);
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
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Doc. Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInvoices.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                        <TableCell className="text-sm max-w-52">
                          <div className="truncate" title={i.customerName}>{i.customerName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${branchColors[branchShort(i.company)] ?? ""}`}>
                            {branchShort(i.company)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.issueDate)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${invoiceStatusColors[i.status] ?? ""}`}>
                            {i.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtCur(Number(i.amount), i.currency ?? "EUR")}
                          {i.currency && i.currency !== "EUR" && i.amountEur != null && (
                            <div className="text-[10px] text-muted-foreground">≈ {fmtEur(Number(i.amountEur))}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              )}
            </CardContent>
          </Card>

          {/* Member companies (folded by default) */}
          <Card>
            <CardHeader
              className="pb-2 cursor-pointer select-none"
              onClick={() => setCompaniesOpen(o => !o)}
              role="button"
              aria-expanded={companiesOpen}
            >
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Companies of the group
                <span className="text-xs font-normal text-muted-foreground">({data.companies.length})</span>
                {branch !== "all" && (
                  <Badge variant="outline" className={branchColors[branchShort(branch)] ?? ""}>
                    {branchShort(branch)} only
                  </Badge>
                )}
                <ChevronDown
                  className={`ml-auto h-4 w-4 text-muted-foreground transition-transform duration-200 ${companiesOpen ? "rotate-180" : ""}`}
                />
              </CardTitle>
            </CardHeader>
            {companiesOpen && (
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Behavior</TableHead>
                    <TableHead className="text-right">Open Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Open Inv.</TableHead>
                    <TableHead className="text-right">Card</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map(c => (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer ${String(c.id) === companyId ? "bg-primary/5" : ""}`}
                      onClick={() => setCompanyId(String(c.id) === companyId ? "all" : String(c.id))}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        {c.onHoldStatus && c.onHoldStatus !== "Active" ? (
                          <Badge variant="outline" className={onHoldStatusColors[c.onHoldStatus] ?? ""}>
                            {c.onHoldStatus}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.medianDaysLate !== null ? (
                          <span
                            className={`font-mono text-xs ${
                              Number(c.medianDaysLate) > 30 ? "text-red-600" : Number(c.medianDaysLate) > 7 ? "text-amber-600" : "text-emerald-700"
                            }`}
                            title={`Last year: median ${c.medianDaysLate}d / avg ${c.avgDaysLate}d late (${c.historyPayments} payments)`}
                          >
                            med {c.medianDaysLate}d
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtEur(c.openBalance)}</TableCell>
                      <TableCell className={`text-right font-mono ${c.overdueBalance > 0 ? "text-red-600" : ""}`}>
                        {fmtEur(c.overdueBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{c.invoiceCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/customers/${c.id}`);
                          }}
                        >
                          Customer 360 →
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground">
                Click a company row to scope all data above to that company; click again to return to the whole group.
              </p>
            </CardContent>
            )}
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

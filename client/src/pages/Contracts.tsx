import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Calendar, Plus, ScrollText, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

/* ─── Status Colors ─── */
const contractStatusColors: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Expiring Soon": "bg-amber-100 text-amber-800 border-amber-200",
  Expired: "bg-gray-100 text-gray-600 border-gray-200",
  Terminated: "bg-red-100 text-red-700 border-red-200",
};

const instStatusColor: Record<string, string> = {
  Upcoming: "bg-sky-100 text-sky-800 border-sky-200",
  Invoiced: "bg-violet-100 text-violet-800 border-violet-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Overdue: "bg-red-100 text-red-700 border-red-200",
};

/* ─── Column Defaults ─── */
type SortKey = "contractNumber" | "title" | "customerName" | "totalValue" | "collectedAmount" | "startDate" | "endDate" | "status";

const COL_DEFAULTS: Record<string, number> = {
  contractNumber: 130,
  title: 200,
  customerName: 200,
  status: 120,
  totalValue: 130,
  collectedAmount: 130,
  installments: 130,
  startDate: 120,
  endDate: 120,
  progress: 100,
};

export default function Contracts() {
  const { data: contracts, isLoading } = trpc.contracts.list.useQuery();
  const { data: customers } = trpc.customers.options.useQuery();
  const utils = trpc.useUtils();

  /* ─── Search & Filters ─── */
  const [search, setSearch] = useState(() =>
    typeof window === "undefined" ? "" : (new URLSearchParams(window.location.search).get("q") ?? ""),
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");

  /* ─── Sort ─── */
  const [sortKey, setSortKey] = useState<SortKey>("endDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const cols = useResizableColumns("contracts-list", COL_DEFAULTS);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const descFirst: SortKey[] = ["totalValue", "collectedAmount"];
      setSortDir(descFirst.includes(key) ? "desc" : "asc");
    }
  };

  /* ─── Detail Dialog ─── */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const { data: detail } = trpc.contracts.get.useQuery(
    { id: selectedId! },
    { enabled: selectedId !== null && detailOpen },
  );

  const openDetail = (id: number) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  /* ─── Create Dialog ─── */
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    contractNumber: "",
    title: "",
    totalValue: "",
    startDate: "",
    endDate: "",
    installmentCount: "1",
    notes: "",
  });
  const resetForm = () =>
    setForm({ customerId: "", contractNumber: "", title: "", totalValue: "", startDate: "", endDate: "", installmentCount: "1", notes: "" });

  const create = trpc.contracts.create.useMutation({
    onSuccess: () => {
      toast.success("Contract created with annual installment schedule");
      utils.contracts.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: e => toast.error(e.message),
  });

  /* ─── Invoice Installment Dialog ─── */
  const [invDialog, setInvDialog] = useState<{ installmentId: number } | null>(null);
  const [invNumber, setInvNumber] = useState("");
  const invoiceInstallment = trpc.contracts.invoiceInstallment.useMutation({
    onSuccess: () => {
      toast.success("Installment invoiced");
      utils.contracts.invalidate();
      utils.invoices.invalidate();
      setInvDialog(null);
      setInvNumber("");
    },
    onError: e => toast.error(e.message),
  });

  /* ─── Filtering & Sorting ─── */
  const now = Date.now();
  const twoMonths = 61 * 24 * 60 * 60 * 1000;

  const filtered = useMemo(() => {
    if (!contracts) return [];
    let rows = contracts.filter(c => {
      const matchesSearch = matchesAllTokens(search, [c.contractNumber, c.title, c.customerName]);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && c.status === "Active") ||
        (statusFilter === "expiring" && (c.status === "Expiring Soon" || (c.status === "Active" && c.endDate - now < twoMonths && c.endDate > now))) ||
        (statusFilter === "expired" && c.status === "Expired") ||
        (statusFilter === "terminated" && c.status === "Terminated");
      return matchesSearch && matchesStatus;
    });

    const dir = sortDir === "asc" ? 1 : -1;
    rows = [...rows].sort((a, b) => {
      let va: string | number, vb: string | number;
      switch (sortKey) {
        case "contractNumber":
          va = a.contractNumber;
          vb = b.contractNumber;
          break;
        case "title":
          va = a.title;
          vb = b.title;
          break;
        case "customerName":
          va = a.customerName;
          vb = b.customerName;
          break;
        case "totalValue":
          va = Number(a.totalValue);
          vb = Number(b.totalValue);
          break;
        case "collectedAmount":
          va = a.collectedAmount;
          vb = b.collectedAmount;
          break;
        case "startDate":
          va = a.startDate;
          vb = b.startDate;
          break;
        case "endDate":
          va = a.endDate;
          vb = b.endDate;
          break;
        case "status":
          va = a.status;
          vb = b.status;
          break;
        default:
          va = 0;
          vb = 0;
      }
      if (typeof va === "string" && typeof vb === "string") {
        return va.toLowerCase().localeCompare(vb.toLowerCase()) * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
    return rows;
  }, [contracts, search, statusFilter, sortKey, sortDir, now, twoMonths]);

  /* ─── Summary Totals ─── */
  const totals = useMemo(() => {
    return {
      count: filtered.length,
      totalValue: filtered.reduce((s, c) => s + Number(c.totalValue), 0),
      collected: filtered.reduce((s, c) => s + c.collectedAmount, 0),
      active: filtered.filter(c => c.status === "Active").length,
      expiring: filtered.filter(c => c.status === "Active" && c.endDate - now < twoMonths && c.endDate > now).length,
    };
  }, [filtered, now, twoMonths]);

  /* ─── Sortable Header ─── */
  const SortableHead = ({ label, k, align }: { label: string; k: SortKey; align?: "right" }) => (
    <TableHead className={`relative ${align === "right" ? "text-right" : ""}`} style={cols.style(k)}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors select-none max-w-full pr-1 ${align === "right" ? "justify-end w-full" : ""} ${sortKey === k ? "text-foreground font-semibold" : ""}`}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3 shrink-0" /> : <ArrowDown className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30 shrink-0" />
        )}
      </button>
      <ColResizer col={k} api={cols} />
    </TableHead>
  );

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* ─── Page Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Contracts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Service agreements with annual installment schedules — expiry alerts fire 2 months in advance
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Contract
        </Button>
      </div>

      {/* ─── Filters ─── */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search contract number, title, customer…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 h-9 bg-background">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expiring">Expiring Soon</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="terminated">Terminated</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ─── Summary Strip ─── */}
      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">{totals.count} contract(s)</span>
          <span>
            Total value: <span className="font-mono font-semibold">{fmtEur(totals.totalValue)}</span>
          </span>
          <span>
            Collected: <span className="font-mono font-semibold text-emerald-700">{fmtEur(totals.collected)}</span>
          </span>
          <span className="text-muted-foreground">{totals.active} active</span>
          {totals.expiring > 0 && (
            <span className="flex items-center gap-1 text-amber-700 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" /> {totals.expiring} expiring soon
            </span>
          )}
        </div>
      )}

      {/* ─── Table ─── */}
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
              {search || statusFilter !== "all"
                ? "No contracts match the current filters."
                : "No contracts yet. Create the first service agreement."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed" style={{ width: cols.totalWidth, minWidth: "100%" }}>
                <TableHeader>
                  <TableRow>
                    <SortableHead label="Contract No" k="contractNumber" />
                    <SortableHead label="Title" k="title" />
                    <SortableHead label="Customer" k="customerName" />
                    <SortableHead label="Status" k="status" />
                    <SortableHead label="Total Value" k="totalValue" align="right" />
                    <SortableHead label="Collected" k="collectedAmount" align="right" />
                    <TableHead className="relative text-center" style={cols.style("installments")}>
                      Installments
                      <ColResizer col="installments" api={cols} />
                    </TableHead>
                    <SortableHead label="Start" k="startDate" />
                    <SortableHead label="End" k="endDate" />
                    <TableHead className="relative" style={cols.style("progress")}>
                      Progress
                      <ColResizer col="progress" api={cols} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(c => {
                    const expiringSoon = c.status === "Active" && c.endDate - now < twoMonths && c.endDate > now;
                    const progress = Number(c.totalValue) > 0 ? Math.round((c.collectedAmount / Number(c.totalValue)) * 100) : 0;
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(c.id)}>
                        <TableCell className="font-mono text-sm">
                          <button
                            type="button"
                            className="text-primary hover:underline underline-offset-2 truncate block max-w-full"
                            onClick={e => {
                              e.stopPropagation();
                              openDetail(c.id);
                            }}
                          >
                            {c.contractNumber}
                          </button>
                        </TableCell>
                        <TableCell className="text-sm overflow-hidden">
                          <span className="block truncate" title={c.title}>{c.title}</span>
                        </TableCell>
                        <TableCell className="text-sm overflow-hidden">
                          <span className="block truncate" title={c.customerName}>{c.customerName}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${contractStatusColors[c.status] ?? ""}`}>
                            {expiringSoon ? "Expiring Soon" : c.status}
                          </Badge>
                          {expiringSoon && (
                            <div className="text-[10px] text-amber-700 mt-0.5 flex items-center gap-0.5">
                              <AlertTriangle className="h-3 w-3" /> {fmtDate(c.endDate)}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">{fmtEur(c.totalValue)}</TableCell>
                        <TableCell className="text-right font-mono text-emerald-700">{fmtEur(c.collectedAmount)}</TableCell>
                        <TableCell className="text-center text-sm">
                          <span className="font-mono">{c.installmentsPaid}/{c.installmentsTotal}</span>
                          <span className="text-muted-foreground text-xs ml-1">paid</span>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.startDate)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.endDate)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress value={progress} className="h-2 flex-1" />
                            <span className="text-xs text-muted-foreground font-mono w-8 text-right">{progress}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Contract Detail Dialog ─── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <ResizableDialogContent storageKey="contract-detail" className="sm:max-w-none w-[56rem] max-w-[95vw] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              {detail?.contract ? `${detail.contract.contractNumber} — ${detail.contract.title}` : "Contract"}
            </DialogTitle>
            {detail?.contract && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge variant="outline" className={contractStatusColors[detail.contract.status] ?? ""}>
                  {detail.contract.status}
                </Badge>
                <Badge variant="outline" className="gap-1 font-mono">
                  <Calendar className="h-3 w-3" /> {fmtDate(detail.contract.startDate)} → {fmtDate(detail.contract.endDate)}
                </Badge>
              </div>
            )}
          </DialogHeader>

          {!detail ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
              <Skeleton className="h-48" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Total Value</div>
                    <div className="text-lg font-bold font-mono">{fmtEur(detail.contract.totalValue)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Collected</div>
                    <div className="text-lg font-bold font-mono text-emerald-700">
                      {fmtEur(detail.installments.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0))}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Remaining</div>
                    <div className="text-lg font-bold font-mono">
                      {fmtEur(
                        Number(detail.contract.totalValue) -
                          detail.installments.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0),
                      )}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground">Installments</div>
                    <div className="text-lg font-bold">
                      {detail.installments.filter(i => i.status === "Paid").length}/{detail.installments.length}
                      <span className="text-sm font-normal text-muted-foreground ml-1">paid</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Contract Info */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm rounded-lg border bg-muted/30 p-4">
                <div>
                  <div className="text-xs text-muted-foreground">Customer</div>
                  <div className="font-medium">{detail.customer?.name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Contract Number</div>
                  <div className="font-mono">{detail.contract.contractNumber}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Period</div>
                  <div>{fmtDate(detail.contract.startDate)} → {fmtDate(detail.contract.endDate)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Status</div>
                  <div>
                    <Badge variant="outline" className={contractStatusColors[detail.contract.status] ?? ""}>
                      {detail.contract.status}
                    </Badge>
                  </div>
                </div>
                {detail.contract.notes && (
                  <div className="col-span-2">
                    <div className="text-xs text-muted-foreground">Notes</div>
                    <div className="whitespace-pre-wrap">{detail.contract.notes}</div>
                  </div>
                )}
              </div>

              {/* Progress Bar */}
              <div>
                <div className="flex items-center justify-between text-sm mb-1.5">
                  <span className="text-muted-foreground">Collection progress</span>
                  <span className="font-mono font-semibold">
                    {Number(detail.contract.totalValue) > 0
                      ? Math.round(
                          (detail.installments.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0) /
                            Number(detail.contract.totalValue)) *
                            100,
                        )
                      : 0}
                    %
                  </span>
                </div>
                <Progress
                  value={
                    Number(detail.contract.totalValue) > 0
                      ? Math.round(
                          (detail.installments.filter(i => i.status === "Paid").reduce((s, i) => s + Number(i.amount), 0) /
                            Number(detail.contract.totalValue)) *
                            100,
                        )
                      : 0
                  }
                  className="h-2.5"
                />
              </div>

              {/* Installments Table */}
              <div>
                <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                  <Calendar className="h-4 w-4" /> Installment Schedule ({detail.installments.length})
                </div>
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">#</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.installments.map(inst => {
                        const isOverdue = inst.status === "Upcoming" && inst.dueDate < now;
                        return (
                          <TableRow key={inst.id}>
                            <TableCell className="font-mono text-sm">{inst.installmentNumber}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{fmtDate(inst.dueDate)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={instStatusColor[isOverdue ? "Overdue" : inst.status] ?? ""}>
                                {isOverdue ? "Overdue" : inst.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{fmtEur(inst.amount)}</TableCell>
                            <TableCell className="text-right">
                              {(inst.status === "Upcoming" || inst.status === "Overdue" || isOverdue) && !inst.invoiceId ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setInvDialog({ installmentId: inst.id });
                                  }}
                                >
                                  Invoice it
                                </Button>
                              ) : inst.status === "Invoiced" ? (
                                <span className="text-xs text-violet-600 font-medium">Invoiced</span>
                              ) : inst.status === "Paid" ? (
                                <span className="text-xs text-emerald-600 font-medium">Paid</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Create Contract Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <ResizableDialogContent storageKey="contract-create" defaultWidth={560} defaultHeight={520} minWidth={420} minHeight={400}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> New Contract
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Customer *</Label>
              <Select value={form.customerId} onValueChange={v => setForm({ ...form, customerId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Contract No *</Label>
              <Input value={form.contractNumber} onChange={e => setForm({ ...form, contractNumber: e.target.value })} placeholder="e.g. CTR-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Service agreement title" />
            </div>
            <div className="space-y-1.5">
              <Label>Total Value (€) *</Label>
              <Input type="number" value={form.totalValue} onChange={e => setForm({ ...form, totalValue: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Annual Installments *</Label>
              <Input type="number" min="1" max="30" value={form.installmentCount} onChange={e => setForm({ ...form, installmentCount: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Start date *</Label>
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>End date *</Label>
              <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={
                !form.customerId || !form.contractNumber || !form.title || !form.totalValue || !form.startDate || !form.endDate || create.isPending
              }
              onClick={() =>
                create.mutate({
                  customerId: Number(form.customerId),
                  contractNumber: form.contractNumber,
                  title: form.title,
                  totalValue: Number(form.totalValue),
                  startDate: new Date(form.startDate).getTime(),
                  endDate: new Date(form.endDate).getTime(),
                  installmentCount: Number(form.installmentCount || 1),
                  notes: form.notes || undefined,
                })
              }
            >
              {create.isPending ? "Creating…" : "Create Contract"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Invoice Installment Dialog ─── */}
      <Dialog open={invDialog !== null} onOpenChange={o => !o && setInvDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invoice Installment</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Invoice Number *</Label>
            <Input value={invNumber} onChange={e => setInvNumber(e.target.value)} placeholder="e.g. INV-2026-104" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!invNumber || invoiceInstallment.isPending}
              onClick={() => invDialog && invoiceInstallment.mutate({ installmentId: invDialog.installmentId, invoiceNumber: invNumber })}
            >
              {invoiceInstallment.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

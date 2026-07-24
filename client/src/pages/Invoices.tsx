import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { ChevronRight, FileDown, FileText, HandCoins, Plus, Users } from "lucide-react";
import { StickyNote, ListPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const STATUSES = ["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const;
const BUCKETS = ["all", "0-30", "31-60", "61-90", "91-120", "120+"] as const;
const METHODS = ["Cash", "Bank Transfer", "Cheque", "Card"] as const;

export default function Invoices() {
  const { data: invoices, isLoading } = trpc.invoices.list.useQuery();
  const { data: aging } = trpc.invoices.aging.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bucketFilter, setBucketFilter] = useState<(typeof BUCKETS)[number]>(() => {
    if (typeof window === "undefined") return "all";
    const b = new URLSearchParams(window.location.search).get("bucket");
    return b && (BUCKETS as readonly string[]).includes(b) ? (b as (typeof BUCKETS)[number]) : "all";
  });
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [groupView, setGroupView] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("view") === "group";
  });
  /** Drill-down: when set, the invoice list shows only this group's invoices (within the active filters). */
  const [groupDrill, setGroupDrill] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("group");
  });
  const [search, setSearch] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });

  // New invoice dialog
  const [invOpen, setInvOpen] = useState(false);
  const [invoiceAction, setInvoiceAction] = useState<{ invoiceId: number; customerId: number; kind: "note" | "promise" | "task" } | null>(null);
  const updateInvoiceStatus = trpc.invoices.updateStatus.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate();
      toast.success("Status updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const setGroupWatchStatus = trpc.customers.setWatchStatus.useMutation({
    onSuccess: () => {
      utils.invoices.list.invalidate();
      toast.success("Group status updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const [invForm, setInvForm] = useState({ customerId: "", invoiceNumber: "", issueDate: "", dueDate: "", amount: "" });
  const createInvoice = trpc.invoices.create.useMutation({
    onSuccess: () => {
      toast.success("Invoice created");
      utils.invoices.invalidate();
      setInvOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  // Receipt dialog
  const [rcOpen, setRcOpen] = useState(false);
  const [rcForm, setRcForm] = useState({ customerId: "", receiptNumber: "", receiptDate: "", amount: "", method: "Bank Transfer" as (typeof METHODS)[number] });
  const [allocations, setAllocations] = useState<Record<number, string>>({});
  const createReceipt = trpc.receipts.create.useMutation({
    onSuccess: () => {
      toast.success("Receipt recorded and matched against invoices");
      utils.invoices.invalidate();
      utils.receipts.invalidate();
      utils.forecast.dashboard.invalidate();
      setRcOpen(false);
      setAllocations({});
    },
    onError: e => toast.error(e.message),
  });

  const exportReport = trpc.reports.export.useMutation({
    onSuccess: r => downloadBase64(r.filename, r.mimeType, r.base64),
    onError: e => toast.error(e.message),
  });

  const rcCustomerInvoices = useMemo(() => {
    if (!invoices || !rcForm.customerId) return [];
    return invoices.filter(i => i.customerId === Number(rcForm.customerId) && i.status !== "Paid");
  }, [invoices, rcForm.customerId]);

  const allocatedTotal = Object.values(allocations).reduce((s, v) => s + Number(v || 0), 0);

  const branches = useMemo(() => {
    if (!invoices) return [] as string[];
    return Array.from(new Set(invoices.map(i => i.company).filter((c): c is string => !!c))).sort();
  }, [invoices]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (branchFilter !== "all" && i.company !== branchFilter) return false;
      if (groupDrill && ((i as any).customerGroup ?? i.customerName) !== groupDrill) return false;
      if (bucketFilter !== "all") {
        if (i.daysOverdue <= 0) return false;
        const b =
          i.daysOverdue <= 30 ? "0-30" : i.daysOverdue <= 60 ? "31-60" : i.daysOverdue <= 90 ? "61-90" : i.daysOverdue <= 120 ? "91-120" : "120+";
        if (b !== bucketFilter) return false;
      }
      if (search && !i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) && !i.customerName.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [invoices, statusFilter, bucketFilter, branchFilter, search, groupDrill]);

  /** Totals of the currently filtered list: EUR + per-currency breakdown. */
  const filteredTotals = useMemo(() => {
    let eurTotal = 0;
    const byCur: Record<string, number> = {};
    for (const i of filtered) {
      if (i.status === "Paid") continue;
      eurTotal += i.outstanding;
      const cur = (i.currency ?? "EUR").toUpperCase();
      byCur[cur] = (byCur[cur] ?? 0) + (Number(i.amount) - Number(i.paidAmount));
    }
    return { eurTotal, byCur, count: filtered.length };
  }, [filtered]);

  /** Per-group aggregation of the currently filtered invoices (e.g. all 120+ invoices grouped by customer group). */
  const byGroup = useMemo(() => {
    const map = new Map<string, { group: string; outstanding: number; count: number; byCur: Record<string, number> }>();
    for (const i of filtered) {
      if (i.status === "Paid") continue;
      const key = (i as any).customerGroup ?? i.customerName;
      let g = map.get(key);
      if (!g) {
        g = { group: key, outstanding: 0, count: 0, byCur: {} };
        map.set(key, g);
      }
      g.outstanding += i.outstanding;
      g.count += 1;
      const cur = (i.currency ?? "EUR").toUpperCase();
      g.byCur[cur] = (g.byCur[cur] ?? 0) + (Number(i.amount) - Number(i.paidAmount));
    }
    return Array.from(map.values()).sort((a, b) => b.outstanding - a.outstanding);
  }, [filtered]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileText className="h-6 w-6" /> Invoices
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Aging report, status filters and receipt reconciliation</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReport.mutate({ report: "aging", format: "xlsx" })} disabled={exportReport.isPending}>
            <FileDown className="h-4 w-4" /> Aging (Excel)
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportReport.mutate({ report: "aging", format: "pdf" })} disabled={exportReport.isPending}>
            <FileDown className="h-4 w-4" /> Aging (PDF)
          </Button>
          <Dialog open={rcOpen} onOpenChange={setRcOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" className="gap-1.5">
                <HandCoins className="h-4 w-4" /> Record Receipt
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Record Receipt & Match Invoices</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Customer *</Label>
                  <Select value={rcForm.customerId} onValueChange={v => { setRcForm({ ...rcForm, customerId: v }); setAllocations({}); }}>
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
                  <Label>Receipt No *</Label>
                  <Input value={rcForm.receiptNumber} onChange={e => setRcForm({ ...rcForm, receiptNumber: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Date *</Label>
                  <Input type="date" value={rcForm.receiptDate} onChange={e => setRcForm({ ...rcForm, receiptDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (€) *</Label>
                  <Input type="number" value={rcForm.amount} onChange={e => setRcForm({ ...rcForm, amount: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Method</Label>
                  <Select value={rcForm.method} onValueChange={v => setRcForm({ ...rcForm, method: v as any })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METHODS.map(m => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {rcForm.customerId && (
                <div className="space-y-2 max-h-52 overflow-y-auto border rounded-md p-3">
                  <div className="text-sm font-medium">Allocate to open invoices</div>
                  {rcCustomerInvoices.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No open invoices.</div>
                  ) : (
                    rcCustomerInvoices.map(i => (
                      <div key={i.id} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={allocations[i.id] !== undefined}
                          onCheckedChange={ck => {
                            const next = { ...allocations };
                            if (ck) next[i.id] = String(i.outstanding.toFixed(2));
                            else delete next[i.id];
                            setAllocations(next);
                          }}
                        />
                        <span className="font-mono flex-1">{i.invoiceNumber}</span>
                        <span className="text-muted-foreground">out. {fmtEur(i.outstanding)}</span>
                        {allocations[i.id] !== undefined && (
                          <Input
                            type="number"
                            className="w-28 h-8"
                            value={allocations[i.id]}
                            onChange={e => setAllocations({ ...allocations, [i.id]: e.target.value })}
                          />
                        )}
                      </div>
                    ))
                  )}
                  <div className="text-xs text-muted-foreground pt-1 border-t">
                    Allocated: <span className="font-mono">{fmtEur(allocatedTotal)}</span> / receipt{" "}
                    <span className="font-mono">{fmtEur(Number(rcForm.amount || 0))}</span>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button
                  disabled={
                    !rcForm.customerId || !rcForm.receiptNumber || !rcForm.receiptDate || !rcForm.amount || createReceipt.isPending
                  }
                  onClick={() =>
                    createReceipt.mutate({
                      customerId: Number(rcForm.customerId),
                      receiptNumber: rcForm.receiptNumber,
                      receiptDate: new Date(rcForm.receiptDate).getTime(),
                      amount: Number(rcForm.amount),
                      method: rcForm.method,
                      allocations: Object.entries(allocations)
                        .filter(([, v]) => Number(v) > 0)
                        .map(([invoiceId, amount]) => ({ invoiceId: Number(invoiceId), amount: Number(amount) })),
                    })
                  }
                >
                  Save Receipt
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={invOpen} onOpenChange={setInvOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Invoice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Invoice</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5 col-span-2">
                  <Label>Customer *</Label>
                  <Select value={invForm.customerId} onValueChange={v => setInvForm({ ...invForm, customerId: v })}>
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
                  <Label>Invoice No *</Label>
                  <Input value={invForm.invoiceNumber} onChange={e => setInvForm({ ...invForm, invoiceNumber: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Amount (€) *</Label>
                  <Input type="number" value={invForm.amount} onChange={e => setInvForm({ ...invForm, amount: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Issue date *</Label>
                  <Input type="date" value={invForm.issueDate} onChange={e => setInvForm({ ...invForm, issueDate: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Due date *</Label>
                  <Input type="date" value={invForm.dueDate} onChange={e => setInvForm({ ...invForm, dueDate: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!invForm.customerId || !invForm.invoiceNumber || !invForm.issueDate || !invForm.dueDate || !invForm.amount || createInvoice.isPending}
                  onClick={() =>
                    createInvoice.mutate({
                      customerId: Number(invForm.customerId),
                      invoiceNumber: invForm.invoiceNumber,
                      issueDate: new Date(invForm.issueDate).getTime(),
                      dueDate: new Date(invForm.dueDate).getTime(),
                      amount: Number(invForm.amount),
                    })
                  }
                >
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Aging summary strip */}
      {aging && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
            <button
              key={b}
              onClick={() => setBucketFilter(bucketFilter === b ? "all" : b)}
              className={`rounded-lg border p-3 text-left transition-colors ${bucketFilter === b ? "ring-2 ring-primary bg-primary/5" : "bg-card hover:bg-muted/50"}`}
            >
              <div className="text-xs text-muted-foreground">{b} days overdue</div>
              <div className="text-lg font-bold font-mono">{fmtEur(aging.buckets[b].amount)}</div>
              <div className="text-xs text-muted-foreground">{aging.buckets[b].count} invoice(s)</div>
              {fmtByCurrency((aging as any).bucketsByCurrency?.[b], { skipEurOnly: true }) && (
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate" title={fmtByCurrency((aging as any).bucketsByCurrency?.[b])}>
                  {fmtByCurrency((aging as any).bucketsByCurrency?.[b])}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Input className="flex-1 min-w-52" placeholder="Search invoice number or customer…" value={search} onChange={e => setSearch(e.target.value)} />
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-52">
            <SelectValue placeholder="All branches" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Prime branches</SelectItem>
            {branches.map(b => (
              <SelectItem key={b} value={b}>
                {branchShort(b)} — {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {STATUSES.map(s => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filtered totals: EUR + per-currency */}
      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">{filteredTotals.count} invoice(s) shown</span>
          {groupDrill && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30 max-w-64">
                <span className="truncate" title={groupDrill}>{groupDrill}</span>
                <button
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  title="Clear group filter"
                  onClick={() => {
                    setGroupDrill(null);
                    setGroupView(true);
                  }}
                >
                  ×
                </button>
              </Badge>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs">
                    Group Status
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => {
                    setGroupWatchStatus.mutate({ group: groupDrill, status: "Auto" });
                  }}>
                    Normal (Active)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => {
                    setGroupWatchStatus.mutate({ group: groupDrill, status: "Problematic" });
                  }}>
                    Problematic (On Watch)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <span>
            Outstanding total: <span className="font-mono font-semibold">{fmtEur(filteredTotals.eurTotal)}</span>
          </span>
          {fmtByCurrency(filteredTotals.byCur, { skipEurOnly: true }) && (
            <span className="text-muted-foreground">
              Per currency: <span className="font-mono">{fmtByCurrency(filteredTotals.byCur)}</span>
            </span>
          )}
          <Button
            variant={groupView ? "default" : "outline"}
            size="sm"
            className="ml-auto gap-1.5 h-7"
            onClick={() => setGroupView(v => !v)}
          >
            <Users className="h-3.5 w-3.5" /> By group
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No invoices match the current filters.</div>
          ) : groupView ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell />
                  <TableCell>TOTAL — {byGroup.length} group(s)</TableCell>
                  <TableCell className="text-right font-mono">
                    <button
                      className="hover:underline underline-offset-2 text-primary"
                      title="View all these invoices"
                      onClick={() => setGroupView(false)}
                    >
                      {byGroup.reduce((s, g) => s + g.count, 0)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtEur(byGroup.reduce((s, g) => s + g.outstanding, 0))}</TableCell>
                  <TableCell className="text-right font-mono">100%</TableCell>
                </TableRow>
                {byGroup.map((g, idx) => (
                  <TableRow key={g.group}>
                    <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      <Link href={`/groups/${encodeURIComponent(g.group)}`} className="font-medium hover:underline inline-flex items-center gap-1">
                        {g.group}
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                      </Link>
                      {fmtByCurrency(g.byCur, { skipEurOnly: true }) && (
                        <div className="text-[11px] text-muted-foreground font-mono">{fmtByCurrency(g.byCur)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <button
                        className="hover:underline underline-offset-2 text-primary"
                        title={`View the ${g.count} invoice(s) of ${g.group}`}
                        onClick={() => {
                          setGroupDrill(g.group);
                          setGroupView(false);
                        }}
                      >
                        {g.count}
                      </button>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtEur(g.outstanding)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {filteredTotals.eurTotal > 0 ? `${((g.outstanding / filteredTotals.eurTotal) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Prime Branch</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-sm">{i.invoiceNumber}</TableCell>
                    <TableCell className="font-medium max-w-64">
                      <span className="block truncate" title={i.customerName}>{i.customerName}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={branchColors[branchShort(i.company)] ?? "bg-gray-50 text-gray-600 border-gray-200"} title={i.company ?? undefined}>
                        {branchShort(i.company)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{fmtDate(i.dueDate)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Badge variant="outline" className={`${invoiceStatusColors[i.status]} cursor-pointer hover:opacity-80`}>
                            {i.status}
                          </Badge>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {STATUSES.map(s => (
                            <DropdownMenuItem key={s} onClick={() => updateInvoiceStatus.mutate({ id: i.id, status: s as any })}>
                              {s}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {i.currency && i.currency !== "EUR" ? (
                        <span>
                          {fmtCur(i.amount, i.currency, 2)}
                          <span className="block text-xs text-muted-foreground">≈ {fmtEur(Number(i.amountEur ?? i.amount))}</span>
                        </span>
                      ) : (
                        fmtEur(i.amount)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {i.currency && i.currency !== "EUR" ? (
                        <span>
                          {fmtCur(Number(i.amount) - Number(i.paidAmount), i.currency, 2)}
                          <span className="block text-xs text-muted-foreground font-normal">≈ {fmtEur(i.outstanding)}</span>
                        </span>
                      ) : (
                        fmtEur(i.outstanding)
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${i.daysOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>
                      {i.daysOverdue > 0 ? i.daysOverdue : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Add note" onClick={() => setInvoiceAction({ invoiceId: i.id, customerId: i.customerId, kind: "note" })}>
                          <StickyNote className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Promise-to-pay" onClick={() => setInvoiceAction({ invoiceId: i.id, customerId: i.customerId, kind: "promise" })}>
                          <HandCoins className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="New task" onClick={() => setInvoiceAction({ invoiceId: i.id, customerId: i.customerId, kind: "task" })}>
                          <ListPlus className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
       </CardContent>
     </Card>

      {invoiceAction && <InvoiceQuickActionDialog action={invoiceAction} onClose={() => setInvoiceAction(null)} />}
    </div>
  );
}

function InvoiceQuickActionDialog({ action, onClose }: { action: { invoiceId: number; customerId: number; kind: "note" | "promise" | "task" }; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  const done = (msg: string) => {
    toast.success(msg);
    utils.invoices.list.invalidate();
    onClose();
  };

  const addNote = trpc.customers.addGroupNote.useMutation({ onSuccess: () => done("Note added"), onError: e => toast.error(e.message) });
  const addPromise = trpc.forecast.addPromise.useMutation({ onSuccess: () => done("Promise recorded"), onError: e => toast.error(e.message) });
  const createTask = trpc.tasks.create.useMutation({ onSuccess: () => done("Task created"), onError: e => toast.error(e.message) });

  const pending = addNote.isPending || addPromise.isPending || createTask.isPending;
  const canSubmit =
    !pending &&
    (action.kind !== "note" || text.trim().length > 0) &&
    (action.kind !== "promise" || (amount !== "" && Number(amount) > 0)) &&
    (action.kind !== "task" || text.trim().length > 0);

  const submit = () => {
    if (action.kind === "note") {
      addNote.mutate({ group: "Invoice", content: text.trim() });
    } else if (action.kind === "promise") {
      addPromise.mutate({
        customerId: action.customerId,
        amount: Number(amount),
        promisedDate: new Date(date).getTime(),
      });
    } else if (action.kind === "task") {
      createTask.mutate({
        customerId: action.customerId,
        title: text.trim(),
        type: "Follow-up +2",
        dueDate: new Date(date).getTime(),
      });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {action.kind === "note" && "Add Note"}
            {action.kind === "promise" && "Record Promise to Pay"}
            {action.kind === "task" && "Create Task"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(action.kind === "note" || action.kind === "task") && (
            <div>
              <Label>{action.kind === "note" ? "Note" : "Task Title"}</Label>
              <Input value={text} onChange={e => setText(e.target.value)} placeholder={action.kind === "note" ? "Enter note..." : "Enter task title..."} />
            </div>
          )}
          {action.kind === "promise" && (
            <>
              <div>
                <Label>Amount (€)</Label>
                <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" step="0.01" />
              </div>
              <div>
                <Label>Promised Date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </>
          )}
          {action.kind === "task" && (
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!canSubmit}>{pending ? "Saving..." : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

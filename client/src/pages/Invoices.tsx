import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors } from "@/lib/format";
import { InvoicesTable } from "@/components/InvoicesTable";
import { matchesStatusFilter } from "@/lib/invoiceFilters";
import InstallmentToggle from "@/components/InstallmentToggle";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { matchesAllTokens } from "@shared/textMatch";
import { ChevronRight, FileDown, FileMinus2, FileText, Filter, HandCoins, Ship, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const STATUSES = ["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const;
const BUCKETS = ["all", "0-30", "31-60", "61-90", "91-120", "120+"] as const;
const METHODS = ["Cash", "Bank Transfer", "Cheque", "Card"] as const;

export default function Invoices() {
  const { data: invoices, isLoading } = trpc.invoices.list.useQuery();
  const { data: customers } = trpc.customers.options.useQuery();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bucketFilter, setBucketFilter] = useState<(typeof BUCKETS)[number]>(() => {
    if (typeof window === "undefined") return "all";
    const b = new URLSearchParams(window.location.search).get("bucket");
    return b && (BUCKETS as readonly string[]).includes(b) ? (b as (typeof BUCKETS)[number]) : "all";
  });
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [vesselFilter, setVesselFilter] = useState<string>("all");
  const [contractFilter, setContractFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    const c = new URLSearchParams(window.location.search).get("contract");
    return c === "overdue" || c === "contract" ? "installments" : "all";
  });
  /** When arriving from the dashboard "overdue contract installments" card, also show only overdue rows. */
  const [overdueOnly] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("contract") === "overdue";
  });
  /** The aging cards follow the installments filter, so they always describe the rows below them. */
  const installmentsOnly = contractFilter === "installments";
  const agingInput = useMemo(() => ({ installmentsOnly }), [installmentsOnly]);
  const { data: aging } = trpc.invoices.aging.useQuery(agingInput);
  const [groupView, setGroupView] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("view") === "group";
  });
  /** Aggregate by vessel instead of listing invoices. Mutually exclusive with the group view. */
  const [vesselView, setVesselView] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("view") === "vessel";
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
  /**
   * Credit-note view: the open credits we have issued and the customer has not
   * used yet. It lives on this page because it is the only place that looks at the
   * whole book — inside a group card you only ever see that group's credits.
   */
  const [creditView, setCreditView] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("view") === "credits";
  });
  const { data: creditNotes } = trpc.invoices.creditNotes.useQuery();
  const openCreditNotes = useMemo(
    () => (creditNotes ?? []).filter(c => c.creditStatus !== "Used"),
    [creditNotes],
  );
  const [creditStatusFilter, setCreditStatusFilter] = useState("all");

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

  /** Vessels present in the invoice data (id + name), for the vessel filter dropdown. */
  const vesselOptions = useMemo(() => {
    if (!invoices) return [] as { id: number; name: string }[];
    const map = new Map<number, string>();
    for (const i of invoices) {
      const vid = (i as any).vesselId as number | null;
      const vname = (i as any).vesselName as string | null;
      if (vid && vname && !map.has(vid)) map.set(vid, vname);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter(i => {
      if (!matchesStatusFilter(i, statusFilter)) return false;
      if (branchFilter !== "all" && i.company !== branchFilter) return false;
      if (vesselFilter === "none") {
        if ((i as any).vesselId != null) return false;
      } else if (vesselFilter !== "all" && String((i as any).vesselId ?? "") !== vesselFilter) {
        return false;
      }
      if (contractFilter === "installments" && !(i as any).isContractInstallment) return false;
      if (overdueOnly && contractFilter === "installments" && i.daysOverdue <= 0) return false;
      if (groupDrill && ((i as any).customerGroup ?? i.customerName) !== groupDrill) return false;
      if (bucketFilter !== "all") {
        if (i.daysOverdue <= 0) return false;
        const b =
          i.daysOverdue <= 30 ? "0-30" : i.daysOverdue <= 60 ? "31-60" : i.daysOverdue <= 90 ? "61-90" : i.daysOverdue <= 120 ? "91-120" : "120+";
        if (b !== bucketFilter) return false;
      }
      if (search) {
        // Accent-insensitive and order-independent: "μπουκουβαλα 1234" matches a
        // Latin-spelled customer plus an invoice number, in either order.
        const vessel = ((i as any).vesselName ?? "") as string;
        const group = ((i as any).customerGroup ?? "") as string;
        if (!matchesAllTokens(search, [i.invoiceNumber, i.customerName, vessel, group])) return false;
      }
      return true;
    });
  }, [invoices, statusFilter, bucketFilter, branchFilter, vesselFilter, contractFilter, search, groupDrill]);

  /**
   * How many filters are narrowing the list right now. Shown next to a Clear
   * button so a forgotten filter never silently hides invoices.
   */
  /**
   * Contract installments across all invoices, plus how many of them the other
   * filters currently hide. The toggle uses this to show a count and to disable
   * itself when there is nothing to switch to.
   */
  const installmentCounts = useMemo(() => {
    const all = ((invoices ?? []) as any[]).filter(i => i.isContractInstallment);
    if (all.length === 0) return { total: 0, hidden: 0 };
    const shown = all.filter(i => {
      if (!matchesStatusFilter(i, statusFilter)) return false;
      if (branchFilter !== "all" && i.company !== branchFilter) return false;
      if (vesselFilter === "none") {
        if (i.vesselId != null) return false;
      } else if (vesselFilter !== "all" && String(i.vesselId ?? "") !== vesselFilter) {
        return false;
      }
      if (groupDrill && (i.customerGroup ?? i.customerName) !== groupDrill) return false;
      if (bucketFilter !== "all") {
        if (i.daysOverdue <= 0) return false;
        const b =
          i.daysOverdue <= 30 ? "0-30" : i.daysOverdue <= 60 ? "31-60" : i.daysOverdue <= 90 ? "61-90" : i.daysOverdue <= 120 ? "91-120" : "120+";
        if (b !== bucketFilter) return false;
      }
      if (search) {
        const vessel = (i.vesselName ?? "") as string;
        const group = (i.customerGroup ?? "") as string;
        if (!matchesAllTokens(search, [i.invoiceNumber, i.customerName, vessel, group])) return false;
      }
      return true;
    });
    return { total: all.length, hidden: all.length - shown.length };
  }, [invoices, statusFilter, branchFilter, vesselFilter, bucketFilter, search, groupDrill]);

  const activeFilterCount = useMemo(
    () =>
      [
        search.trim() !== "",
        branchFilter !== "all",
        creditView ? creditStatusFilter !== "all" : statusFilter !== "all",
        vesselFilter !== "all",
        contractFilter === "installments",
        bucketFilter !== "all",
      ].filter(Boolean).length,
    [search, branchFilter, statusFilter, creditStatusFilter, creditView, vesselFilter, contractFilter, bucketFilter],
  );

  // Incremental rendering: mounting 5000+ table rows freezes the browser for
  // seconds. Render a window and grow it on demand.
  const [visibleCount, setVisibleCount] = useState(100);
  useEffect(() => {
    setVisibleCount(200);
  }, [statusFilter, bucketFilter, branchFilter, vesselFilter, contractFilter, search, groupDrill]);
  const visibleRows = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

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

  /**
   * Credit notes matching the free-text search and the branch/vessel/group filters
   * that also make sense for them. Status, aging bucket and installments describe
   * invoices only, so they are ignored here instead of emptying the list.
   */
  const filteredCreditNotes = useMemo(() => {
    const rows = (creditNotes ?? []) as any[];
    return rows.filter(c => {
      if (creditStatusFilter !== "all" && c.creditStatus !== creditStatusFilter) return false;
      if (branchFilter !== "all" && c.branch !== branchFilter) return false;
      if (vesselFilter === "none") {
        if (c.vesselId != null) return false;
      } else if (vesselFilter !== "all" && String(c.vesselId ?? "") !== vesselFilter) {
        return false;
      }
      if (groupDrill && c.customerGroup !== groupDrill) return false;
      if (search && !matchesAllTokens(search, [c.docNumber, c.customerName, c.vesselName ?? "", c.customerGroup ?? ""]))
        return false;
      return true;
    });
  }, [creditNotes, creditStatusFilter, branchFilter, vesselFilter, groupDrill, search]);

  const creditTotals = useMemo(() => {
    let eurTotal = 0;
    const byCur: Record<string, number> = {};
    for (const c of filteredCreditNotes) {
      eurTotal += Number(c.openEur ?? 0);
      const cur = (c.currency ?? "EUR").toUpperCase();
      byCur[cur] = (byCur[cur] ?? 0) + Number(c.open ?? 0);
    }
    return { eurTotal, byCur, count: filteredCreditNotes.length };
  }, [filteredCreditNotes]);

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

  /**
   * Per-vessel aggregation of the currently filtered invoices. Invoices without a
   * vessel are collected under a single "No vessel" row (id null) so the totals of
   * this view always match the list totals.
   */
  const byVessel = useMemo(() => {
    const map = new Map<
      string,
      { key: string; vesselId: number | null; vessel: string; outstanding: number; count: number; byCur: Record<string, number> }
    >();
    for (const i of filtered) {
      if (i.status === "Paid") continue;
      const vid = ((i as any).vesselId ?? null) as number | null;
      const vname = ((i as any).vesselName ?? null) as string | null;
      const key = vid != null ? String(vid) : "none";
      let v = map.get(key);
      if (!v) {
        v = { key, vesselId: vid, vessel: vname ?? "No vessel", outstanding: 0, count: 0, byCur: {} };
        map.set(key, v);
      }
      v.outstanding += i.outstanding;
      v.count += 1;
      const cur = (i.currency ?? "EUR").toUpperCase();
      v.byCur[cur] = (v.byCur[cur] ?? 0) + (Number(i.amount) - Number(i.paidAmount));
    }
    // Real vessels first (by exposure), "No vessel" always last.
    return Array.from(map.values()).sort((a, b) => {
      if (a.vesselId == null) return 1;
      if (b.vesselId == null) return -1;
      return b.outstanding - a.outstanding;
    });
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
        {/* Same clusters as the customer cards: what I DO, then what I TAKE AWAY. */}
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
          <Dialog open={rcOpen} onOpenChange={setRcOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
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
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
            <Button variant="outline" size="sm" className="gap-1.5 bg-background" onClick={() => exportReport.mutate({ report: "aging", format: "xlsx" })} disabled={exportReport.isPending}>
              <FileDown className="h-4 w-4" /> Aging Excel
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 bg-background" onClick={() => exportReport.mutate({ report: "aging", format: "pdf" })} disabled={exportReport.isPending}>
              <FileDown className="h-4 w-4" /> Aging PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Aging summary strip */}
      {aging && (
        <div className="space-y-2">
          {installmentsOnly && (
            <div className="text-xs text-violet-700 dark:text-violet-300 font-medium">
              Aging of contract installments only
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => {
              // A bucket with nothing in it must not be clickable: selecting it
              // would empty the table and make the whole strip look broken.
              const empty = aging.buckets[b].count === 0;
              const selected = bucketFilter === b;
              return (
            <button
              key={b}
              onClick={() => setBucketFilter(selected ? "all" : b)}
              disabled={empty && !selected}
              title={empty && !selected ? `No ${installmentsOnly ? "installments" : "invoices"} in this bucket` : undefined}
              className={`rounded-lg border p-3 text-left transition-colors ${selected ? "ring-2 ring-primary bg-primary/5" : empty ? "bg-muted/20 border-dashed opacity-60 cursor-default" : installmentsOnly ? "bg-violet-50/60 dark:bg-violet-950/20 border-violet-200 dark:border-violet-900 hover:bg-violet-100/60 dark:hover:bg-violet-950/40" : "bg-card hover:bg-muted/50"}`}
            >
              <div className="text-xs text-muted-foreground">{b} days overdue</div>
              <div className="text-lg font-bold font-mono">{fmtEur(aging.buckets[b].amount)}</div>
              <div className="text-xs text-muted-foreground">
                {aging.buckets[b].count} {installmentsOnly ? "installment(s)" : "invoice(s)"}
              </div>
              {fmtByCurrency((aging as any).bucketsByCurrency?.[b], { skipEurOnly: true }) && (
                <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate" title={fmtByCurrency((aging as any).bucketsByCurrency?.[b])}>
                  {fmtByCurrency((aging as any).bucketsByCurrency?.[b])}
                </div>
              )}
            </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters cluster — boxed and labelled, same idiom as the group card. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
        <Filter className="h-4 w-4 text-muted-foreground shrink-0 ml-0.5" />
        <Input
          className="flex-1 min-w-52 h-9 bg-background"
          placeholder="Search invoice number or customer…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-48 h-9 bg-background">
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
        <Select
          value={creditView ? creditStatusFilter : statusFilter}
          onValueChange={creditView ? setCreditStatusFilter : setStatusFilter}
        >
          <SelectTrigger className="w-40 h-9 bg-background">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {(creditView ? ["Open", "Partially Used", "Used"] : STATUSES).map(s => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {vesselOptions.length > 0 && (
          <Select value={vesselFilter} onValueChange={setVesselFilter}>
            <SelectTrigger className="w-44 h-9 bg-background">
              <SelectValue placeholder="All vessels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vessels</SelectItem>
              <SelectItem value="none">No vessel</SelectItem>
              {vesselOptions.map(v => (
                <SelectItem key={v.id} value={String(v.id)}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!creditView && (
          <InstallmentToggle
            value={contractFilter === "installments" ? "installments" : "all"}
            onChange={v => setContractFilter(v)}
            count={installmentCounts.total}
            hiddenCount={installmentCounts.hidden}
          />
        )}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => {
              setSearch("");
              setBranchFilter("all");
              setStatusFilter("all");
              setCreditStatusFilter("all");
              setVesselFilter("all");
              setContractFilter("all");
              setBucketFilter("all");
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear {activeFilterCount}
          </Button>
        )}
      </div>

      {/* Filtered totals: EUR + per-currency */}
      {!isLoading && (filtered.length > 0 || creditView) && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">
            {creditView
              ? `${creditTotals.count} credit note(s)`
              : `${filteredTotals.count} invoice(s) shown`}
          </span>
          {groupDrill && (
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
          )}
          {creditView ? (
            <>
              <span className="text-sky-700 dark:text-sky-300">
                Unused credit: <span className="font-mono font-semibold">−{fmtEur(creditTotals.eurTotal)}</span>
              </span>
              {fmtByCurrency(creditTotals.byCur, { skipEurOnly: true }) && (
                <span className="text-muted-foreground">
                  Per currency: <span className="font-mono">{fmtByCurrency(creditTotals.byCur)}</span>
                </span>
              )}
            </>
          ) : (
            <>
              <span>
                Outstanding total: <span className="font-mono font-semibold">{fmtEur(filteredTotals.eurTotal)}</span>
              </span>
              {fmtByCurrency(filteredTotals.byCur, { skipEurOnly: true }) && (
                <span className="text-muted-foreground">
                  Per currency: <span className="font-mono">{fmtByCurrency(filteredTotals.byCur)}</span>
                </span>
              )}
            </>
          )}
          <Button
            variant={groupView ? "default" : "outline"}
            size="sm"
            className="ml-auto gap-1.5 h-7"
            onClick={() => {
              setGroupView(v => !v);
              setVesselView(false);
              setCreditView(false);
            }}
          >
            <Users className="h-3.5 w-3.5" /> By group
          </Button>
          <Button
            variant={vesselView ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-7"
            onClick={() => {
              setVesselView(v => !v);
              setGroupView(false);
              setCreditView(false);
            }}
          >
            <Ship className="h-3.5 w-3.5" /> By vessel
          </Button>
          {/* Permanent entry point to the credits the customer has not used yet. */}
          <Button
            variant={creditView ? "default" : "outline"}
            size="sm"
            className="gap-1.5 h-7"
            onClick={() => {
              setCreditView(v => !v);
              setGroupView(false);
              setVesselView(false);
            }}
            title="Show every credit note across all groups"
          >
            <FileMinus2 className="h-3.5 w-3.5" /> Credit notes ({(creditNotes ?? []).length})
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
          ) : creditView ? (
            filteredCreditNotes.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">
                No credit notes{activeFilterCount > 0 ? " match the current filters" : ""}.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Credit Note</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Matched</TableHead>
                    <TableHead className="text-right">Still open</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCreditNotes.map((c: any) => (
                    <TableRow key={c.id} className="bg-sky-50/40 dark:bg-sky-950/10">
                      <TableCell className="text-xs whitespace-nowrap">{fmtDate(c.docDate)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        <span className="inline-flex items-center gap-1">
                          <FileMinus2 className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                          {c.docNumber}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={`/customers/${c.customerId}`} className="hover:underline">
                          {c.customerName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link
                          href={`/groups/${encodeURIComponent(c.customerGroup ?? "")}`}
                          className="text-muted-foreground hover:underline"
                        >
                          {c.customerGroup}
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{c.vesselName ?? "—"}</TableCell>
                      <TableCell>
                        {c.branch ? (
                          <Badge variant="outline" className={branchColors[c.branch] ?? ""}>
                            {branchShort(c.branch)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={c.creditStatus === "Used" ? "bg-emerald-50 text-emerald-700" : c.creditStatus === "Partially Used" ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"}>
                          {c.creditStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtCur(c.amount, c.currency)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {Number(c.amount) - Number(c.open) > 0.005
                          ? fmtCur(Number(c.amount) - Number(c.open), c.currency)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold text-sky-700 dark:text-sky-300">
                        −{fmtCur(c.open, c.currency)}
                        {(c.currency ?? "EUR").toUpperCase() !== "EUR" && (
                          <div className="text-[11px] text-muted-foreground">≈ {fmtEur(c.openEur)}</div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="text-muted-foreground">
                {bucketFilter !== "all" && installmentsOnly
                  ? `No contract installments are ${bucketFilter} days overdue.`
                  : bucketFilter !== "all"
                    ? `No invoices are ${bucketFilter} days overdue under the current filters.`
                    : "No invoices match the current filters."}
              </div>
              {activeFilterCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 bg-background"
                  onClick={() => {
                    setSearch("");
                    setBranchFilter("all");
                    setStatusFilter("all");
                    setVesselFilter("all");
                    setContractFilter("all");
                    setBucketFilter("all");
                  }}
                >
                  <X className="h-3.5 w-3.5" /> Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                </Button>
              )}
            </div>
          ) : vesselView ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead className="text-right">% of total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/40 font-semibold">
                  <TableCell />
                  <TableCell>TOTAL — {byVessel.length} vessel(s)</TableCell>
                  <TableCell className="text-right font-mono">
                    <button
                      className="hover:underline underline-offset-2 text-primary"
                      title="View all these invoices"
                      onClick={() => setVesselView(false)}
                    >
                      {byVessel.reduce((s, v) => s + v.count, 0)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtEur(byVessel.reduce((s, v) => s + v.outstanding, 0))}</TableCell>
                  <TableCell className="text-right font-mono">100%</TableCell>
                </TableRow>
                {byVessel.map((v, idx) => (
                  <TableRow key={v.key}>
                    <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                    <TableCell>
                      {v.vesselId != null ? (
                        <Link href={`/vessels/${v.vesselId}`} className="font-medium hover:underline inline-flex items-center gap-1">
                          {v.vessel}
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </Link>
                      ) : (
                        <span className="font-medium text-muted-foreground">{v.vessel}</span>
                      )}
                      {fmtByCurrency(v.byCur, { skipEurOnly: true }) && (
                        <div className="text-[11px] text-muted-foreground font-mono">{fmtByCurrency(v.byCur)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <button
                        className="hover:underline underline-offset-2 text-primary"
                        title={`View the ${v.count} invoice(s) of ${v.vessel}`}
                        onClick={() => {
                          setVesselFilter(v.vesselId != null ? String(v.vesselId) : "none");
                          setVesselView(false);
                        }}
                      >
                        {v.count}
                      </button>
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtEur(v.outstanding)}</TableCell>
                    <TableCell className="text-right font-mono text-muted-foreground">
                      {filteredTotals.eurTotal > 0 ? `${((v.outstanding / filteredTotals.eurTotal) * 100).toFixed(1)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
            <InvoicesTable rows={visibleRows as any} />
          )}
          {!isLoading && !groupView && !vesselView && !creditView && filtered.length > visibleCount && (
            <div className="flex items-center justify-center gap-3 py-4 border-t">
              <span className="text-sm text-muted-foreground">
                Showing {visibleCount.toLocaleString()} of {filtered.length.toLocaleString()} invoices
              </span>
              <Button variant="outline" size="sm" onClick={() => setVisibleCount(c => c + 500)}>
                Load 500 more
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setVisibleCount(filtered.length)}>
                Show all
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { downloadBase64, fmtDate, fmtEur, monthName } from "@/lib/format";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, FileDown, Info, Pencil, Plus, RotateCcw, Search, Sparkles, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

function SmartForecastSection() {
  const now = new Date();
  const [sel, setSel] = useState(() => ({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 }));
  const { data: months } = trpc.forecast.smartMonths.useQuery();
  const { data, isLoading } = trpc.forecast.smartEntries.useQuery(sel);
  const utils = trpc.useUtils();

  const [editId, setEditId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: "due" | "overdue" | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });

  const toggleSort = (key: "due" | "overdue") =>
    setSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));

  const visibleRows = useMemo(() => {
    let rows = data?.entries ?? [];
    const q = search.trim().toLowerCase();
    if (q) rows = rows.filter(e => e.customerName.toLowerCase().includes(q));
    if (sort.key) {
      const field = sort.key === "due" ? "dueAmount" : "overdueAmount";
      rows = [...rows].sort((a, b) => {
        const diff = Number(a[field]) - Number(b[field]);
        return sort.dir === "asc" ? diff : -diff;
      });
    }
    return rows;
  }, [data?.entries, search, sort]);

  const generate = trpc.forecast.generateSmart.useMutation({
    onSuccess: r => {
      toast.success(`Forecast generated for ${r.customers} customers (${r.aiCount} AI, ${r.heuristicCount} statistical)`);
      utils.forecast.smartEntries.invalidate();
      utils.forecast.smartMonths.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const adjust = trpc.forecast.adjustEntry.useMutation({
    onSuccess: () => {
      toast.success("Expected amount updated");
      utils.forecast.smartEntries.invalidate();
      setEditId(null);
    },
    onError: e => toast.error(e.message),
  });

  const reset = trpc.forecast.resetEntry.useMutation({
    onSuccess: () => {
      toast.success("Reset to AI suggestion");
      utils.forecast.smartEntries.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const monthOptions = (() => {
    const opts = new Map<string, { year: number; month: number }>();
    const cur = { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
    const next = cur.month === 12 ? { year: cur.year + 1, month: 1 } : { year: cur.year, month: cur.month + 1 };
    opts.set(`${cur.year}-${cur.month}`, cur);
    opts.set(`${next.year}-${next.month}`, next);
    for (const m of months ?? []) opts.set(`${m.year}-${m.month}`, m);
    return Array.from(opts.values()).sort((a, b) => b.year - a.year || b.month - a.month);
  })();

  const totals = data?.totals;
  const collectedPct = totals && totals.expected > 0 ? Math.min(100, Math.round((totals.collected / totals.expected) * 100)) : 0;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> Smart Forecast per Customer Group — AI suggestion, user-adjustable (all amounts EUR)
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search group…"
                className="h-8 w-44 pl-7 text-sm"
              />
            </div>
            <Select
              value={`${sel.year}-${sel.month}`}
              onValueChange={v => {
                const [y, m] = v.split("-").map(Number);
                setSel({ year: y, month: m });
              }}
            >
              <SelectTrigger className="w-40 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map(m => (
                  <SelectItem key={`${m.year}-${m.month}`} value={`${m.year}-${m.month}`}>
                    {monthName(m.month)} {m.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" onClick={() => generate.mutate({ ...sel, useAi: true })} disabled={generate.isPending}>
              <Sparkles className="h-4 w-4" />
              {generate.isPending ? "Generating…" : (data?.entries.length ?? 0) > 0 ? "Refresh Forecast" : "Generate Forecast"}
            </Button>
          </div>
        </div>
        {generate.isPending && (
          <p className="text-xs text-muted-foreground">Analyzing payment behavior per customer and asking the AI for suggestions — this can take up to a minute…</p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-40" />
          </div>
        ) : (data?.entries.length ?? 0) === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            No smart forecast for {monthName(sel.month)} {sel.year} yet. Click "Refresh Forecast" — the system scans invoices due in the month
            (plus overdue balances) across all companies of each customer group, profiles the group's payment behavior and suggests the
            expected collection per group in EUR. The forecast is generated only when you press the button.
          </div>
        ) : (
          <>
            {/* Totals strip */}
            {totals && (
              <div className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: "Total Due (month)", value: totals.due },
                  { label: "of which Overdue", value: totals.overdue },
                  { label: "AI Suggested", value: totals.aiSuggested },
                  { label: "Expected (final)", value: totals.expected },
                  { label: "Collected so far", value: totals.collected },
                  { label: "Remaining to collect", value: totals.remaining },
                ].map(k => (
                  <div key={k.label} className="rounded-md border bg-muted/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{k.label}</div>
                    <div className="text-sm font-bold font-mono">{fmtEur(k.value)}</div>
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-3 lg:col-span-6">
                  <Progress value={collectedPct} className="h-2" />
                  <div className="text-[11px] text-muted-foreground mt-1">{collectedPct}% of the expected amount collected</div>
                </div>
              </div>
            )}
            <div className="max-h-[520px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Group</TableHead>
                    <TableHead className="text-right">Behavior (days)</TableHead>
                    <TableHead className="text-right">
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("due")}>
                        Due (month)
                        {sort.key === "due" ? (sort.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort("overdue")}>
                        Overdue
                        {sort.key === "overdue" ? (sort.dir === "desc" ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">AI Suggested</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Collected</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                        No groups match "{search}".
                      </TableCell>
                    </TableRow>
                  )}
                  {visibleRows.map(e => {
                    const isEditing = editId === e.id;
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="font-medium max-w-56">
                          <Link href={`/groups/${encodeURIComponent(e.customerGroup ?? e.customerName)}`}>
                            <div className="truncate hover:underline cursor-pointer" title={e.customerName}>{e.customerName}</div>
                          </Link>
                          {(e.companiesCount ?? 1) > 1 && (
                            <Badge variant="outline" className="mt-0.5 text-[10px]">
                              {e.companiesCount} companies
                            </Badge>
                          )}
                          {e.userAdjusted === 1 && (
                            <Badge variant="outline" className="mt-0.5 text-[10px] bg-amber-50 text-amber-800 border-amber-200">
                              User adjusted
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {e.medianDaysLate !== null || e.groupMedianDaysLate !== null ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex flex-col items-end cursor-help">
                                  {e.medianDaysLate !== null && (
                                    <span
                                      className={`font-mono text-xs ${
                                        Number(e.medianDaysLate) > 30 ? "text-red-600" : Number(e.medianDaysLate) > 7 ? "text-amber-600" : "text-emerald-700"
                                      }`}
                                    >
                                      med {e.medianDaysLate}
                                    </span>
                                  )}
                                  {e.groupMedianDaysLate !== null && (
                                    <span
                                      className={`font-mono text-[10px] ${
                                        Number(e.groupMedianDaysLate) > 30 ? "text-red-600/80" : Number(e.groupMedianDaysLate) > 7 ? "text-amber-600/80" : "text-emerald-700/80"
                                      }`}
                                    >
                                      grp {e.groupMedianDaysLate}
                                    </span>
                                  )}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-64 text-xs">
                                {e.medianDaysLate !== null
                                  ? `Customer last year: median ${e.medianDaysLate}d / avg ${e.avgDaysLate}d late vs due date (${e.historyPayments} payments). `
                                  : "No own payment history. "}
                                {e.groupMedianDaysLate !== null && e.customerGroup
                                  ? `Group "${e.customerGroup}": median ${e.groupMedianDaysLate}d / avg ${e.groupAvgDaysLate}d late.`
                                  : ""}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtEur(Number(e.dueAmount))}</TableCell>
                        <TableCell className="text-right font-mono text-red-600">{fmtEur(Number(e.overdueAmount))}</TableCell>
                        <TableCell className="text-right font-mono">
                          <span className="inline-flex items-center gap-1">
                            {fmtEur(Number(e.aiSuggestedAmount))}
                            {e.aiReasoning && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                                </TooltipTrigger>
                                <TooltipContent className="max-w-72 text-xs">{e.aiReasoning}</TooltipContent>
                              </Tooltip>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {isEditing ? (
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                min={0}
                                className="h-7 w-28 text-right font-mono"
                                value={editAmount}
                                onChange={ev => setEditAmount(ev.target.value)}
                                autoFocus
                              />
                            </div>
                          ) : (
                            fmtEur(Number(e.expectedAmount))
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-emerald-700">{fmtEur(e.collected)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtEur(e.remaining)}</TableCell>
                        <TableCell className="text-right">
                          {isEditing ? (
                            <div className="flex flex-col items-end gap-1">
                              <Input
                                className="h-7 w-44 text-xs"
                                placeholder="Reason (optional)"
                                value={editNote}
                                onChange={ev => setEditNote(ev.target.value)}
                              />
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-emerald-700"
                                  disabled={adjust.isPending || editAmount === ""}
                                  onClick={() => adjust.mutate({ id: e.id, expectedAmount: Number(editAmount), note: editNote || undefined })}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditId(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-1 justify-end">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    onClick={() => {
                                      setEditId(e.id);
                                      setEditAmount(String(Number(e.expectedAmount)));
                                      setEditNote(e.adjustmentNote ?? "");
                                    }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">Adjust expected amount</TooltipContent>
                              </Tooltip>
                              {e.userAdjusted === 1 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => reset.mutate({ id: e.id })}>
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">Reset to AI suggestion</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function Forecast() {
  const { data: plans, isLoading } = trpc.forecast.plans.useQuery();
  const { data: promises } = trpc.forecast.promises.useQuery();
  const { data: dash } = trpc.forecast.dashboard.useQuery();
  const utils = trpc.useUtils();

  const now = new Date();
  const [targetOpen, setTargetOpen] = useState(false);
  const [tYear, setTYear] = useState(now.getUTCFullYear());
  const [tMonth, setTMonth] = useState(now.getUTCMonth() + 1);
  const [tAmount, setTAmount] = useState("");

  const exportPlan = trpc.reports.export.useMutation({
    onSuccess: r => downloadBase64(r.filename, r.mimeType, r.base64),
    onError: e => toast.error(e.message),
  });

  const setTarget = trpc.forecast.setTarget.useMutation({
    onSuccess: () => {
      toast.success("Monthly target saved");
      utils.forecast.invalidate();
      setTargetOpen(false);
      setTAmount("");
    },
    onError: e => toast.error(e.message),
  });

  const setPromiseStatus = trpc.forecast.updatePromise.useMutation({
    onSuccess: () => {
      utils.forecast.promises.invalidate();
      toast.success("Promise updated");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Collection Forecast Plan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly Target vs Actual tracking, promise-to-pay follow-up and plan exports
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Set Monthly Target
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Monthly Collection Target</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Year</Label>
                  <Input type="number" value={tYear} onChange={e => setTYear(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Month (1-12)</Label>
                  <Input type="number" min={1} max={12} value={tMonth} onChange={e => setTMonth(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Target amount (€)</Label>
                  <Input type="number" min={0} value={tAmount} onChange={e => setTAmount(e.target.value)} placeholder="e.g. 500000" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={setTarget.isPending || !tAmount}
                  onClick={() => setTarget.mutate({ year: tYear, month: tMonth, targetAmount: Number(tAmount) })}
                >
                  Save Target
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPlan.mutate({ report: "forecast", format: "xlsx" })} disabled={exportPlan.isPending}>
            <FileDown className="h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPlan.mutate({ report: "forecast", format: "pdf" })} disabled={exportPlan.isPending}>
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Smart per-customer forecast (AI + user overrides) */}
      <SmartForecastSection />

      {/* 6-month expected inflow overview */}
      {dash && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expected Inflows — Next 6 Months</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">From Invoices</TableHead>
                  <TableHead className="text-right">From Contracts</TableHead>
                  <TableHead className="text-right">Total Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dash.forecast.map(f => (
                  <TableRow key={`${f.year}-${f.month}`}>
                    <TableCell className="font-medium">
                      {monthName(f.month)} {f.year}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(f.fromInvoices)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(f.fromContracts)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtEur(f.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Target vs Actual per plan month */}
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (plans ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No monthly targets set yet. Use "Set Monthly Target" to create the collection plan.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(plans ?? []).map(m => {
            const target = Number(m.targetAmount);
            const pct = target > 0 ? Math.min(100, Math.round((m.actual / target) * 100)) : 0;
            const isCurrent = m.year === now.getUTCFullYear() && m.month === now.getUTCMonth() + 1;
            return (
              <Card key={`${m.year}-${m.month}`} className={isCurrent ? "ring-2 ring-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {monthName(m.month)} {m.year}
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-2">
                          Current
                        </Badge>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Actual collected</div>
                      <div className="text-xl font-bold font-mono">{fmtEur(m.actual)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Target</div>
                      <div className="text-xl font-bold font-mono">{target > 0 ? fmtEur(target) : "—"}</div>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{target > 0 ? `${pct}% of target` : "No target set"}</span>
                    <span>
                      Variance:{" "}
                      <span className={`font-mono ${m.actual - target >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {target > 0 ? fmtEur(m.actual - target) : "—"}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promises-to-Pay</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(promises ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No promises recorded. Add them from the Customer 360 View.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Promised Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(promises ?? []).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.customerName}</TableCell>
                    <TableCell>{fmtDate(p.promisedDate)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          p.status === "Kept"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : p.status === "Broken"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : "bg-sky-100 text-sky-800 border-sky-200"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-52 truncate">{p.notes || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(Number(p.amount))}</TableCell>
                    <TableCell className="text-right">
                      {p.status === "Pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="text-emerald-700" onClick={() => setPromiseStatus.mutate({ id: p.id, status: "Kept" })}>
                            Kept
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setPromiseStatus.mutate({ id: p.id, status: "Broken" })}>
                            Broken
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

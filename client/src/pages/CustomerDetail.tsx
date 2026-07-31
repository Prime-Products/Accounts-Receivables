import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import GroupAiSummaryDialog from "@/components/GroupAiSummaryDialog";
import GroupNotesDialog from "@/components/GroupNotesDialog";
import { BankDetails } from "@/components/BankDetails";
import { WireTransfers } from "@/components/WireTransfers";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { AccountManagerControl } from "@/components/AccountManagerControl";
import { InvoicesTable } from "@/components/InvoicesTable";
import { hideSettled, countSettled, matchesStatusFilter } from "@/lib/invoiceFilters";
import InstallmentToggle from "@/components/InstallmentToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, ratingColors, taskStatusColors, taskTypeColors, tierColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Banknote, Eye, EyeOff, FileDown, FileMinus2, HandCoins, Layers, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.customers.get360.useQuery({ id }, { enabled: !isNaN(id) });
  const utils = trpc.useUtils();
  const { data: groupForecast } = trpc.customers.groupForecast.useQuery(
    { group: (data as any)?.groupKey ?? "" },
    { enabled: !!(data as any)?.groupKey },
  );

  const [promiseOpen, setPromiseOpen] = useState(false);
  const [promiseForm, setPromiseForm] = useState({ amount: "", date: "", notes: "" });
  const addPromise = trpc.forecast.addPromise.useMutation({
    onSuccess: () => {
      toast.success("Promise-to-pay recorded");
      utils.customers.get360.invalidate({ id });
      setPromiseOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [installmentFilter, setInstallmentFilter] = useState<"all" | "installments">("all");
  // Credit-note toggle: when on, the transactions list shows only credit notes.
  const [creditOnly, setCreditOnly] = useState(false);
  // Payments toggle: when on, the transactions list shows only wire transfers.
  const [paymentsOnly, setPaymentsOnly] = useState(false);
  // Settled invoices are hidden by default (same rule as the group card).
  const [showPaid, setShowPaid] = useState(false);

  const exportSoa = trpc.reports.export.useMutation({
    onSuccess: r => {
      downloadBase64(r.filename, r.mimeType, r.base64);
      toast.success("Statement of Account downloaded");
    },
    onError: e => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { customer, invoices, receipts, contracts, installments, promises, tasks, aging } = data;
  const openInvoices = invoices.filter(i => i.status !== "Paid");
  const agingAny = aging as any;
  const now = Date.now();
  const visibleInvoices = invoices.filter(i => {
    if (creditOnly || paymentsOnly) return false;
    if (hideSettled(i as any, showPaid, statusFilter)) return false;
    if (!matchesStatusFilter(i as any, statusFilter)) return false;
    if (installmentFilter === "installments" && !(i as any).isContractInstallment) return false;
    return true;
  });
  const paidHiddenCount = countSettled(invoices as any);
  // Credit notes are part of the same list; the installment/status filters apply
  // to invoices only, so they are hidden while those filters are narrowing down.
  const allCreditNotes = ((data as any).openCreditNotes ?? []) as any[];
  const visibleCreditNotes =
    paymentsOnly || installmentFilter === "installments" || (statusFilter !== "all" && !creditOnly)
      ? []
      : allCreditNotes;
  // Payments (wire transfers with an unallocated remainder) live in the same list.
  const allTransfers = ((data as any).openTransfers ?? []) as any[];
  const visibleTransfers =
    creditOnly || installmentFilter === "installments" || (statusFilter !== "all" && !paymentsOnly)
      ? []
      : allTransfers;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate("/customers")}>
        <ArrowLeft className="h-4 w-4" /> Group List
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            {data.rating && (
              <Badge
                variant="outline"
                className={`${ratingColors[data.rating.rating] ?? ""} font-mono`}
                title={`Credit score ${data.rating.score}/100\n${data.rating.factors.map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`).join("\n")}`}
              >
                {data.rating.rating} · {data.rating.score}
              </Badge>
            )}
            <WatchStatusSelect group={data.groupKey} effective={data.watchStatus ?? null} />
            {customer.customerGroup && (
              <Badge
                variant="outline"
                className="cursor-pointer gap-1 bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100"
                onClick={() => navigate(`/groups/${encodeURIComponent(customer.customerGroup!.trim())}`)}
                title="Open the group card"
              >
                <Layers className="h-3 w-3" /> {customer.customerGroup}
              </Badge>
            )}
            <AccountManagerControl
              manager={(data as any).accountManager ?? null}
              customerId={id}
              onChanged={() => utils.customers.get360.invalidate({ id })}
            />
            <AccountManagerControl
              role="collector"
              manager={(data as any).collector ?? null}
              customerId={id}
              onChanged={() => utils.customers.get360.invalidate({ id })}
            />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {customer.code} · VAT {customer.vatNumber || "—"} · {customer.email || "no email"} · terms{" "}
            {customer.paymentTermsDays} days
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <NewTaskDialog
            defaultCustomerId={id}
            hideCustomerPicker
            trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> New Task
              </Button>
            }
          />
          <GroupNotesDialog group={data.groupKey} />
          <GroupAiSummaryDialog group={data.groupKey} />
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportSoa.mutate({ report: "soa", format: "pdf", customerId: id })}
            disabled={exportSoa.isPending}
          >
            <FileDown className="h-4 w-4" /> SOA (PDF)
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => exportSoa.mutate({ report: "soa", format: "xlsx", customerId: id })}
            disabled={exportSoa.isPending}
          >
            <FileDown className="h-4 w-4" /> SOA (Excel)
          </Button>
          <Dialog open={promiseOpen} onOpenChange={setPromiseOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <HandCoins className="h-4 w-4" /> Promise-to-Pay
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Promise-to-Pay</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Amount (€)</Label>
                  <Input type="number" value={promiseForm.amount} onChange={e => setPromiseForm({ ...promiseForm, amount: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Promised date</Label>
                  <Input type="date" value={promiseForm.date} onChange={e => setPromiseForm({ ...promiseForm, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea value={promiseForm.notes} onChange={e => setPromiseForm({ ...promiseForm, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={!promiseForm.amount || !promiseForm.date || addPromise.isPending}
                  onClick={() =>
                    addPromise.mutate({
                      customerId: id,
                      amount: Number(promiseForm.amount),
                      promisedDate: new Date(promiseForm.date).getTime(),
                      notes: promiseForm.notes || undefined,
                    })
                  }
                >
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Open Balance</div>
            <div className="text-xl font-bold font-mono">
              {fmtEur(
                aging.current +
                  aging.totalOverdue -
                  ((data as any).unallocatedPayments ?? 0) -
                  ((data as any).openCreditNotesTotal ?? 0),
              )}
            </div>
            {(((data as any).unallocatedPayments ?? 0) > 0.005 ||
              ((data as any).openCreditNotesTotal ?? 0) > 0.005) && (
              <div
                className="text-[11px] font-mono mt-0.5 text-emerald-600"
                title="Open invoices minus payments on account and credit notes that are not yet matched"
              >
                {fmtEur(aging.current + aging.totalOverdue)} inv
                {((data as any).unallocatedPayments ?? 0) > 0.005 && ` − ${fmtEur((data as any).unallocatedPayments)} on acct`}
                {((data as any).openCreditNotesTotal ?? 0) > 0.005 && (
                  <span className="text-sky-600"> − {fmtEur((data as any).openCreditNotesTotal)} credit</span>
                )}
              </div>
            )}
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {fmtByCurrency(agingAny.totalByCurrency, { skipEurOnly: true }) || `${openInvoices.length} open invoice(s)`}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className={`text-xl font-bold font-mono ${aging.totalOverdue > 0 ? "text-red-600" : ""}`}>{fmtEur(aging.totalOverdue)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {openInvoices.filter(i => now > i.dueDate).length} overdue invoice(s)
            </div>
            <div className="text-[11px] font-mono mt-0.5 text-orange-600" title="Overdue by end of the current month (today's overdue + invoices falling due until month end)">
              EOM: {fmtEur(data.overdueEomBalance)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Forecast (this month)</div>
            {groupForecast ? (
              <>
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
            <div className="text-xs text-muted-foreground">Payment Behavior (last year)</div>
            {data.behavior && data.behavior.payments > 0 ? (
              <>
                <div
                  className={`text-xl font-bold font-mono ${
                    data.behavior.medianDaysLate > 30 ? "text-red-600" : data.behavior.medianDaysLate > 7 ? "text-amber-600" : "text-emerald-700"
                  }`}
                >
                  {data.behavior.medianDaysLate > 0 ? `+${Math.round(data.behavior.medianDaysLate)}` : Math.round(data.behavior.medianDaysLate)}d median
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  avg {Math.round(data.behavior.avgDaysLate)}d vs due date · {data.behavior.payments} payments
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground mt-1">No payment history</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Turnover (up to day)</div>
            <div className="text-xl font-bold font-mono text-blue-700">
              {customer.turnoverYtd != null ? fmtEur(customer.turnoverYtd) : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">credit limit {fmtEur(customer.creditLimit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Turnover Last Year</div>
            <div className="text-xl font-bold font-mono">
              {customer.turnoverLastYear != null ? fmtEur(customer.turnoverLastYear) : "—"}
            </div>
            {customer.turnoverYtd != null && customer.turnoverLastYear != null && Number(customer.turnoverLastYear) > 0 && (
              <div className={`text-[10px] font-mono mt-0.5 ${Number(customer.turnoverYtd) >= Number(customer.turnoverLastYear) ? "text-emerald-600" : "text-amber-600"}`}>
                {((Number(customer.turnoverYtd) / Number(customer.turnoverLastYear) - 1) * 100).toFixed(0)}% vs last year
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aging — same card style as the group view */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Aging</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <div className="text-[11px] text-muted-foreground">Current (not due)</div>
              <div className="text-sm font-bold font-mono">{fmtEur(aging.current)}</div>
            </div>
            {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
              <div key={b} className="rounded-md border bg-muted/40 px-3 py-2">
                <div className="text-[11px] text-muted-foreground">{b} days overdue</div>
                <div className="text-sm font-bold font-mono">{fmtEur(aging.buckets[b].amount)}</div>
                <div className="text-[10px] text-muted-foreground">{aging.buckets[b].count} inv.</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Transactions ({invoices.length})</TabsTrigger>
          <TabsTrigger value="receipts">Payment History ({receipts.length})</TabsTrigger>
          <TabsTrigger value="contracts">Contracts ({contracts.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
          <TabsTrigger value="bankDetails">Bank Details</TabsTrigger>
          <TabsTrigger value="wireTransfers">Wire Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {statusFilter === "all"
                  ? `${visibleInvoices.length} invoice(s)${!showPaid && paidHiddenCount > 0 ? ` · ${paidHiddenCount} settled hidden` : ""}`
                  : `${visibleInvoices.length} ${statusFilter} invoice(s) · outstanding ${fmtEur(visibleInvoices.reduce((s, i) => s + Number((i as any).amountEur != null && Number(i.amount) > 0 ? ((Number(i.amount) - Number(i.paidAmount)) / Number(i.amount)) * Number((i as any).amountEur) : Number(i.amount) - Number(i.paidAmount)), 0))}`}
                {visibleCreditNotes.length > 0 && (
                  <span className="text-sky-700"> · {visibleCreditNotes.length} credit note(s) −{fmtEur(visibleCreditNotes.reduce((s, c) => s + Number(c.openEur ?? 0), 0))}</span>
                )}
                {visibleTransfers.length > 0 && (
                  <span className="text-emerald-700"> · {visibleTransfers.length} payment(s) on account</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
              {allTransfers.length > 0 && (
                <Button
                  size="sm"
                  variant={paymentsOnly ? "secondary" : "ghost"}
                  className={`h-8 px-2.5 text-xs gap-1.5 border ${paymentsOnly ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""}`}
                  onClick={() => { setPaymentsOnly(v => !v); setCreditOnly(false); }}
                  title={paymentsOnly ? "Show invoices again" : "Show only payments on account"}
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Payments ({allTransfers.length})
                </Button>
              )}
              {allCreditNotes.length > 0 && (
                <Button
                  size="sm"
                  variant={creditOnly ? "secondary" : "ghost"}
                  className={`h-8 px-2.5 text-xs gap-1.5 border ${creditOnly ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-100" : ""}`}
                  onClick={() => { setCreditOnly(v => !v); setPaymentsOnly(false); }}
                  title={creditOnly ? "Show invoices again" : "Show only credit notes"}
                >
                  <FileMinus2 className="h-3.5 w-3.5" />
                  Credit notes ({allCreditNotes.length})
                </Button>
              )}
              <Button
                size="sm"
                variant={showPaid ? "secondary" : "ghost"}
                className="h-8 px-2.5 text-xs gap-1.5 border"
                onClick={() => setShowPaid(p => !p)}
                title={showPaid ? "Hide fully paid invoices" : "Also show fully paid invoices"}
              >
                {showPaid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPaid ? "Hide paid" : `Show paid${paidHiddenCount > 0 ? ` (${paidHiddenCount})` : ""}`}
              </Button>
              <InstallmentToggle value={installmentFilter} onChange={setInstallmentFilter} />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44 h-8 text-xs">
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
            <CardContent className="p-0">
              {visibleInvoices.length === 0 && visibleCreditNotes.length === 0 && visibleTransfers.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No invoices for this customer.</div>
              ) : (
                <InvoicesTable
                  rows={visibleInvoices as any}
                  creditNotes={visibleCreditNotes as any}
                  transfers={visibleTransfers as any}
                  showCustomer={false}
                  onDisputeChanged={() => utils.customers.get360.invalidate()}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="receipts">
          <Card>
            <CardContent className="p-0">
              {receipts.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No receipts recorded yet.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.receiptNumber}</TableCell>
                        <TableCell className="text-sm">{fmtDate(r.receiptDate)}</TableCell>
                        <TableCell className="text-sm">{r.method}</TableCell>
                        <TableCell className="text-right font-mono">{fmtEur(r.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <div className="space-y-3">
            {contracts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No contracts.</CardContent>
              </Card>
            ) : (
              contracts.map(c => {
                const insts = installments.filter(i => i.contractId === c.id);
                return (
                  <Card key={c.id}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
                        <span>
                          {c.contractNumber} — {c.title}
                        </span>
                        <span className="font-mono text-sm text-muted-foreground">
                          {fmtDate(c.startDate)} → {fmtDate(c.endDate)} · {fmtEur(c.totalValue)}
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {insts.map(inst => (
                            <TableRow key={inst.id}>
                              <TableCell>{inst.installmentNumber}</TableCell>
                              <TableCell>{fmtDate(inst.dueDate)}</TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    inst.status === "Paid"
                                      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                                      : inst.status === "Overdue"
                                        ? "bg-red-100 text-red-700 border-red-200"
                                        : inst.status === "Invoiced"
                                          ? "bg-violet-100 text-violet-800 border-violet-200"
                                          : "bg-sky-100 text-sky-800 border-sky-200"
                                  }
                                >
                                  {inst.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{fmtEur(inst.amount)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <Card>
            <CardContent className="p-0">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No tasks for this customer.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map(t => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Badge variant="outline" className={taskTypeColors[t.type] ?? ""}>
                            {t.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{t.title}</TableCell>
                        <TableCell className="text-sm">{fmtDate(t.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={taskStatusColors[t.status]}>
                            {t.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bankDetails">
          <BankDetails customerId={customer.id} />
        </TabsContent>

        <TabsContent value="wireTransfers">
          <WireTransfers customerId={customer.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

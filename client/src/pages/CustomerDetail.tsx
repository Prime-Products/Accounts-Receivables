import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import { BankDetails } from "@/components/BankDetails";
import { WireTransfers } from "@/components/WireTransfers";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { PeopleRow } from "@/components/PeopleRow";
import { InvoicesTable } from "@/components/InvoicesTable";
import { RecordBreadcrumb } from "@/components/RecordBreadcrumb";
import { hideSettled, countSettled, matchesStatusFilter } from "@/lib/invoiceFilters";
import InstallmentToggle from "@/components/InstallmentToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CommunicationPanel, CommunicationToggle, useCommunicationPanel } from "@/components/CommunicationPanel";
import { buildTimeline } from "@/lib/timeline";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, ratingColors, taskStatusColors, taskTypeColors, tierColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Banknote, Eye, EyeOff, FileDown, FileMinus2, HandCoins, HelpCircle, Layers, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState } from "react";
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
  /**
   * Collections history lives at group level (that is how calls are logged), so
   * the company card shows the same timeline for its group, plus this company's
   * own tasks and payments.
   */
  const groupKey = ((data as any)?.groupKey ?? "") as string;
  const { data: groupDetail, isLoading: historyLoading } = trpc.customers.groupDetail.useQuery(
    { group: groupKey },
    { enabled: !!groupKey },
  );
  const { data: groupNoteRows } = trpc.customers.groupNotes.useQuery({ group: groupKey }, { enabled: !!groupKey });
  const timelineEntries = useMemo(
    () =>
      buildTimeline({
        activityLogs: (groupDetail as any)?.activityLogs,
        notes: groupNoteRows as any,
        tasks: (data as any)?.tasks,
        receipts: (data as any)?.receipts,
      }),
    [groupDetail, groupNoteRows, data],
  );

  /** Show/hide the communication side panel; shared with the group card. */
  const commPanel = useCommunicationPanel();

  const [askOpen, setAskOpen] = useState(false);
  /*
   * Promise-to-Pay is offered here as well as on the group card — the collector may be
   * looking at one company when the customer commits. What it must NOT do is create a
   * company-level commitment: the group is the unit of collection, so this saves through
   * `recordGroupPromise`, which moves the group's existing open promise instead of
   * opening a second one for the same money.
   */
  const [promiseOpen, setPromiseOpen] = useState(false);
  const [promiseForm, setPromiseForm] = useState({ amount: "", date: "", notes: "" });
  const recordPromise = trpc.calls.recordGroupPromise.useMutation({
    onSuccess: res => {
      toast.success(res.moved ? "The group's open promise was moved to the new date" : "Promise-to-Pay recorded for the group");
      utils.customers.invalidate();
      utils.calls.invalidate();
      setPromiseOpen(false);
      setPromiseForm({ amount: "", date: "", notes: "" });
    },
    onError: e => toast.error(e.message),
  });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [installmentFilter, setInstallmentFilter] = useState<"all" | "installments">("all");
  // Credit-note toggle: when on, the transactions list shows only credit notes.
  const [creditOnly, setCreditOnly] = useState(false);
  // Payments toggle: when on, the transactions list shows only remittances.
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
  /**
   * Contract installments on this company and how many of them the other filters
   * are hiding, so the toggle can show a count and disable itself at zero.
   */
  const allInstallmentInvoices = invoices.filter(i => (i as any).isContractInstallment);
  const installmentHiddenCount = allInstallmentInvoices.filter(i => {
    if (hideSettled(i as any, showPaid, statusFilter)) return true;
    if (!matchesStatusFilter(i as any, statusFilter)) return true;
    return false;
  }).length;
  // Credit notes are part of the same list; the installment/status filters apply
  // to invoices only, so they are hidden while those filters are narrowing down.
  const allCreditNotes = ((data as any).openCreditNotes ?? []) as any[];
  /** A filter that only invoices can satisfy (status, installments) is narrowing the list. */
  const invoiceOnlyFilterActive = installmentFilter === "installments" || statusFilter !== "all";
  const visibleCreditNotes =
    paymentsOnly || (invoiceOnlyFilterActive && !creditOnly) ? [] : allCreditNotes;
  // Payments (customer remittances) live in the same list, matched ones included.
  const allTransfers = ((data as any).openTransfers ?? []) as any[];
  const visibleTransfers =
    creditOnly || (invoiceOnlyFilterActive && !paymentsOnly) ? [] : allTransfers;

  /**
   * Turning on a credit-notes-only or payments-only view drops the invoice-only
   * filters, so the toggle always reveals the rows instead of an empty table.
   */
  const clearInvoiceOnlyFilters = () => {
    setStatusFilter("all");
    setInstallmentFilter("all");
  };
  const toggleCreditOnly = () => {
    setPaymentsOnly(false);
    setCreditOnly(v => {
      if (!v) clearInvoiceOnlyFilters();
      return !v;
    });
  };
  const togglePaymentsOnly = () => {
    setCreditOnly(false);
    setPaymentsOnly(v => {
      if (!v) clearInvoiceOnlyFilters();
      return !v;
    });
  };

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/*
       * One locator line. A company card looks identical to a group card, so the
       * COMPANY badge states the kind, and the way out goes up to the owning group
       * (falling back to the list for a company with no group) — never a dead end.
       */}
      <RecordBreadcrumb
        entity="company"
        parent={
          customer.customerGroup?.trim()
            ? {
                label: customer.customerGroup.trim(),
                href: `/groups/${encodeURIComponent(customer.customerGroup.trim())}`,
              }
            : { label: "Customers", href: "/customers" }
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3 !mt-1">
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
            {/*
             * The owning group used to be a chip here; it now lives in the
             * breadcrumb above, where an ancestor belongs, so it is not repeated.
             */}
            {/* Ownership inline after the badges, same compact strip as the group card. */}
            <span className="border-l pl-2 text-base font-normal">
              <PeopleRow
                manager={(data as any).accountManager ?? null}
                collector={(data as any).collector ?? null}
                watchers={(data as any).watchers ?? []}
                watcherGroupName={(data as any).watcherGroupKey ?? data.groupKey}
                customerId={id}
                onChanged={() => utils.customers.get360.invalidate({ id })}
              />
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {customer.code} · VAT {customer.vatNumber || "—"} · {customer.email || "no email"} · terms{" "}
            {customer.paymentTermsDays} days
          </p>
        </div>
        {/*
         * Same two clusters as the group card: what I DO with this company, and
         * what I TAKE AWAY. Notes live in Collection Notes, not in this bar.
         */}
        <div className="flex items-start gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
            <NewTaskDialog
              defaultCustomerId={id}
              hideCustomerPicker
              trigger={
                <Button size="sm" variant="outline" className="gap-1.5 bg-background">
                  <Plus className="h-4 w-4" /> New Task
                </Button>
              }
            />
            <Button variant="outline" size="sm" className="gap-1.5 bg-background" onClick={() => setAskOpen(true)}>
              <HelpCircle className="h-4 w-4" /> Ask for help
            </Button>
            <Dialog open={promiseOpen} onOpenChange={setPromiseOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 bg-background">
                  <HandCoins className="h-4 w-4" /> Promise-to-Pay
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Promise-to-Pay</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  {/* The record belongs to the group, so say so before anything is typed. */}
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    Recorded for <strong>{data.groupKey}</strong> — collection is tracked per group, so this is
                    the group's single payment commitment, not a separate promise for {customer.name}.
                  </p>
                  <div className="space-y-1.5">
                    <Label>Amount (€) — optional</Label>
                    <Input
                      type="number"
                      placeholder="leave empty if not stated"
                      value={promiseForm.amount}
                      onChange={e => setPromiseForm({ ...promiseForm, amount: e.target.value })}
                    />
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
                    disabled={!promiseForm.date || recordPromise.isPending}
                    onClick={() =>
                      recordPromise.mutate({
                        group: data.groupKey,
                        customerId: id,
                        amount: promiseForm.amount ? Number(promiseForm.amount) : undefined,
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
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-background"
              onClick={() => exportSoa.mutate({ report: "soa", format: "pdf", customerId: id })}
              disabled={exportSoa.isPending}
            >
              <FileDown className="h-4 w-4" /> SOA PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 bg-background"
              onClick={() => exportSoa.mutate({ report: "soa", format: "xlsx", customerId: id })}
              disabled={exportSoa.isPending}
            >
              <FileDown className="h-4 w-4" /> SOA Excel
            </Button>
            <CommunicationToggle open={commPanel.open} onToggle={commPanel.toggle} count={timelineEntries.length} />
          </div>
          {/* Same New Task dialog, pre-typed as Help — one flow for asking a colleague. */}
          <NewTaskDialog
            defaultCustomerId={id}
            hideCustomerPicker
            defaultType="Help"
            defaultTitle={`Help needed: ${data.customer.name}`}
            trigger={<Button className="hidden">Hidden</Button>}
            open={askOpen}
            onOpenChange={setAskOpen}
          />
        </div>
      </div>

      {/* Summary cards */}
      {/*
       * Receivables-only card: no top-level tabs. The directory record for this
       * company is reached from the Address Book instead.
       */}
      <div className="mt-4 space-y-4">
      {/*
       * Money at full width in one uninterrupted flow (KPIs → aging →
       * transactions); the communication history floats in a movable window
       * above the page instead of taking a column here.
       */}
      <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Open Balance</div>
            <div
              className="text-xl font-bold font-mono"
              title={[
                `Open invoices: ${fmtEur(aging.current + aging.totalOverdue)}`,
                ((data as any).unallocatedPayments ?? 0) > 0.005
                  ? `Payments on account (unmatched): −${fmtEur((data as any).unallocatedPayments)}`
                  : null,
                ((data as any).openCreditNotesTotal ?? 0) > 0.005
                  ? `Open credit notes: −${fmtEur((data as any).openCreditNotesTotal)}`
                  : null,
                fmtByCurrency(agingAny.totalByCurrency, { skipEurOnly: true })
                  ? `By currency: ${fmtByCurrency(agingAny.totalByCurrency, { skipEurOnly: true })}`
                  : null,
                `${openInvoices.length} open invoice(s)`,
              ]
                .filter(Boolean)
                .join("\n")}
            >
              {fmtEur(
                aging.current +
                  aging.totalOverdue -
                  ((data as any).unallocatedPayments ?? 0) -
                  ((data as any).openCreditNotesTotal ?? 0),
              )}
            </div>
            {/* Same reading as the group card: balance plus next month's
                exposure, with the breakdown moved into the tooltip. */}
            <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
              <span className="text-[11px] text-muted-foreground">Due next month</span>
              <span className="text-[11px] font-mono font-medium" title="Open invoices falling due within the next calendar month">
                {fmtEur((data as any).dueNextMonth ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Overdue</div>
            <div className={`text-xl font-bold font-mono ${aging.totalOverdue > 0 ? "text-red-600" : ""}`}>{fmtEur(aging.totalOverdue)}</div>
            {/* Same treatment as the group card: the second amount sits on a
                labelled row under a divider so it is easy to read. */}
            <div
              className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5"
              title="Overdue by end of the current month (today's overdue + invoices falling due until month end)"
            >
              <span className="text-[11px] text-muted-foreground">
                End of month · {openInvoices.filter(i => now > i.dueDate).length} inv.
              </span>
              <span className="text-[11px] font-mono font-medium">{fmtEur(data.overdueEomBalance)}</span>
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
                <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
                  <span className="text-[11px] text-muted-foreground">Collected</span>
                  <span className="text-[11px] font-mono font-medium">{fmtEur(groupForecast.collected)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Remaining</span>
                  <span className="text-[11px] font-mono font-medium">{fmtEur(groupForecast.remaining)}</span>
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
                <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
                  <span className="text-[11px] text-muted-foreground">Average · {data.behavior.payments} payments</span>
                  <span className="text-[11px] font-mono font-medium">{Math.round(data.behavior.avgDaysLate)}d</span>
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
            <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
              <span className="text-[11px] text-muted-foreground">Credit limit</span>
              <span className="text-[11px] font-mono font-medium">{fmtEur(customer.creditLimit)}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Turnover Last Year</div>
            <div className="text-xl font-bold font-mono">
              {customer.turnoverLastYear != null ? fmtEur(customer.turnoverLastYear) : "—"}
            </div>
            {customer.turnoverYtd != null && customer.turnoverLastYear != null && Number(customer.turnoverLastYear) > 0 && (
              <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
                <span className="text-[11px] text-muted-foreground">vs this year</span>
                <span
                  className={`text-[11px] font-mono font-medium ${Number(customer.turnoverYtd) >= Number(customer.turnoverLastYear) ? "text-emerald-600" : "text-amber-600"}`}
                >
                  {((Number(customer.turnoverYtd) / Number(customer.turnoverLastYear) - 1) * 100).toFixed(0)}%
                </span>
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
          <TabsTrigger value="wireTransfers">Remittances</TabsTrigger>
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
              {/* Always present, like on the group card: disabled at zero, never removed. */}
              <Button
                size="sm"
                variant={paymentsOnly ? "secondary" : "ghost"}
                disabled={allTransfers.length === 0}
                className={`h-8 px-2.5 text-xs gap-1.5 border ${paymentsOnly ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""}`}
                onClick={togglePaymentsOnly}
                title={
                  allTransfers.length === 0
                    ? "No payments on account for this company"
                    : paymentsOnly
                      ? "Show invoices again"
                      : visibleTransfers.length === 0
                        ? "Payments are hidden by the current filters — click to show them"
                        : "Show only payments on account"
                }
              >
                <Banknote className="h-3.5 w-3.5" />
                Payments ({allTransfers.length})
                {allTransfers.length > 0 && !paymentsOnly && visibleTransfers.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">hidden</span>
                )}
              </Button>
              <Button
                size="sm"
                variant={creditOnly ? "secondary" : "ghost"}
                disabled={allCreditNotes.length === 0}
                className={`h-8 px-2.5 text-xs gap-1.5 border ${creditOnly ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-100" : ""}`}
                onClick={toggleCreditOnly}
                title={
                  allCreditNotes.length === 0
                    ? "No open credit notes for this company"
                    : creditOnly
                      ? "Show invoices again"
                      : visibleCreditNotes.length === 0
                        ? "Credit notes are hidden by the current filters — click to show them"
                        : "Show only credit notes"
                }
              >
                <FileMinus2 className="h-3.5 w-3.5" />
                Credit notes ({allCreditNotes.length})
                {allCreditNotes.length > 0 && !creditOnly && visibleCreditNotes.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">hidden</span>
                )}
              </Button>
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
              <InstallmentToggle
                value={installmentFilter}
                onChange={v => {
                  if (v === "installments") {
                    setCreditOnly(false);
                    setPaymentsOnly(false);
                  }
                  setInstallmentFilter(v);
                }}
                count={allInstallmentInvoices.length}
                hiddenCount={installmentHiddenCount}
              />
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
                  group={data.groupKey}
                  showCustomer={false}
                  maxHeight="480px"
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

      {/* Collections history for the group this company belongs to */}
      <CommunicationPanel
        open={commPanel.open}
        onClose={commPanel.toggle}
        entries={timelineEntries}
        isLoading={isLoading || historyLoading}
        group={groupKey || undefined}
        title={groupKey && groupKey !== customer.name ? `Communication — ${groupKey}` : "Communication"}
      />
      </div>
    </div>
  );
}

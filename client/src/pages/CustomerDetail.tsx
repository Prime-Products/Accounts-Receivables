import { Badge } from "@/components/ui/badge";
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
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, onHoldStatusColors, taskStatusColors, taskTypeColors, tierColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, FileDown, HandCoins, Layers, PauseCircle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.customers.get360.useQuery({ id }, { enabled: !isNaN(id) });
  const utils = trpc.useUtils();

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

  const [onHoldOpen, setOnHoldOpen] = useState(false);
  const [onHoldReason, setOnHoldReason] = useState("");
  const [agingFilter, setAgingFilter] = useState<string>("all");
  const updateTier = trpc.customers.update.useMutation({
    onSuccess: () => {
      toast.success("Tier updated");
      utils.customers.get360.invalidate({ id });
      utils.customers.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const submitOnHold = trpc.onHold.submit.useMutation({
    onSuccess: () => {
      toast.success("On-Hold proposal submitted — status: Under Review");
      utils.customers.get360.invalidate({ id });
      utils.onHold.list.invalidate();
      setOnHoldOpen(false);
    },
    onError: e => toast.error(e.message),
  });

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
  const TIERS = ["Platinum", "Gold", "Silver", "Bronze", "New"] as const;
  const agingAny = aging as any;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const visibleInvoices =
    agingFilter === "all"
      ? invoices
      : invoices.filter(i => {
          if (i.status === "Paid" || now <= i.dueDate) return false;
          return (now - i.dueDate) / dayMs >= Number(agingFilter);
        });

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => navigate("/customers")}>
        <ArrowLeft className="h-4 w-4" /> Customers
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight">{customer.name}</h1>
            <Select
              value={customer.tier}
              onValueChange={v => updateTier.mutate({ id: customer.id, tier: v as (typeof TIERS)[number] })}
            >
              <SelectTrigger
                className={`h-6 gap-1 rounded-full border px-2.5 text-xs font-semibold w-auto ${tierColors[customer.tier] ?? ""}`}
                title="Change customer tier"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIERS.map(t => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="outline" className={onHoldStatusColors[customer.onHoldStatus] ?? ""}>
              {customer.onHoldStatus}
            </Badge>
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
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {customer.code} · VAT {customer.vatNumber || "—"} · {customer.email || "no email"} · terms{" "}
            {customer.paymentTermsDays} days
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
          <Dialog open={onHoldOpen} onOpenChange={setOnHoldOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="gap-1.5">
                <PauseCircle className="h-4 w-4" /> Propose On-Hold
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit On-Hold Proposal</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Supporting data (overdue invoices, amounts, days overdue) is aggregated automatically. The proposal
                starts as <strong>Under Review</strong> and Management decides the next step.
              </p>
              <div className="space-y-1.5">
                <Label>Reason *</Label>
                <Textarea value={onHoldReason} onChange={e => setOnHoldReason(e.target.value)} placeholder="Why should this customer be placed on hold?" />
              </div>
              <DialogFooter>
                <Button
                  variant="destructive"
                  disabled={!onHoldReason || submitOnHold.isPending}
                  onClick={() => submitOnHold.mutate({ customerId: id, reason: onHoldReason })}
                >
                  Submit Proposal
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Total Overdue</div>
            <div className="text-xl font-bold font-mono text-red-600">{fmtEur(aging.totalOverdue)}</div>
            {fmtByCurrency(agingAny.totalByCurrency, { skipEurOnly: true }) && (
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate" title={fmtByCurrency(agingAny.totalByCurrency)}>
                {fmtByCurrency(agingAny.totalByCurrency)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Current (not due)</div>
            <div className="text-xl font-bold font-mono">{fmtEur(aging.current)}</div>
            {fmtByCurrency(agingAny.currentByCurrency, { skipEurOnly: true }) && (
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate" title={fmtByCurrency(agingAny.currentByCurrency)}>
                {fmtByCurrency(agingAny.currentByCurrency)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Credit Limit</div>
            <div className="text-xl font-bold font-mono">{fmtEur(customer.creditLimit)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Aging 90+</div>
            <div className="text-xl font-bold font-mono">{fmtEur(aging.buckets["90+"].amount)}</div>
            {fmtByCurrency(agingAny.bucketsByCurrency?.["90+"], { skipEurOnly: true }) && (
              <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate" title={fmtByCurrency(agingAny.bucketsByCurrency?.["90+"])}>
                {fmtByCurrency(agingAny.bucketsByCurrency?.["90+"])}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Invoices ({invoices.length})</TabsTrigger>
          <TabsTrigger value="receipts">Payment History ({receipts.length})</TabsTrigger>
          <TabsTrigger value="contracts">Contracts ({contracts.length})</TabsTrigger>
          <TabsTrigger value="promises">Promises ({promises.length})</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices">
          <Card>
            <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-1 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {agingFilter === "all"
                  ? `${invoices.length} invoices`
                  : `${visibleInvoices.length} overdue ${agingFilter === "1" ? "" : `${agingFilter}+ days `}invoice(s) · outstanding ${fmtEur(visibleInvoices.reduce((s, i) => s + Number((i as any).amountEur != null && Number(i.amount) > 0 ? ((Number(i.amount) - Number(i.paidAmount)) / Number(i.amount)) * Number((i as any).amountEur) : Number(i.amount) - Number(i.paidAmount)), 0))}`}
              </div>
              <Select value={agingFilter} onValueChange={setAgingFilter}>
                <SelectTrigger className="w-44 h-8 text-xs">
                  <SelectValue placeholder="Aging" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All invoices</SelectItem>
                  <SelectItem value="1">Overdue (any)</SelectItem>
                  <SelectItem value="60">Overdue 60+ days</SelectItem>
                  <SelectItem value="120">Overdue 120+ days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <CardContent className="p-0">
              {visibleInvoices.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No invoices for this customer.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Doc. Date</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleInvoices.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-sm">{i.invoiceNumber}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={branchColors[branchShort(i.company)] ?? "bg-gray-50 text-gray-600 border-gray-200"} title={i.company ?? undefined}>
                            {branchShort(i.company)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(i.issueDate)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(i.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={invoiceStatusColors[i.status]}>
                            {i.status}
                          </Badge>
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
                        <TableCell className="text-right font-mono">{i.currency && i.currency !== "EUR" ? fmtCur(i.paidAmount, i.currency, 2) : fmtEur(i.paidAmount)}</TableCell>
                        <TableCell className="text-right font-mono font-semibold">
                          {i.currency && i.currency !== "EUR"
                            ? fmtCur(Number(i.amount) - Number(i.paidAmount), i.currency, 2)
                            : fmtEur(Number(i.amount) - Number(i.paidAmount))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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

        <TabsContent value="promises">
          <Card>
            <CardContent className="p-0">
              {promises.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">No promises-to-pay recorded.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Promised Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {promises.map(p => (
                      <TableRow key={p.id}>
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
                        <TableCell className="text-sm text-muted-foreground">{p.notes || "—"}</TableCell>
                        <TableCell className="text-right font-mono">{fmtEur(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  );
}

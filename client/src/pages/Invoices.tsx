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
import { downloadBase64, fmtDate, fmtEur, invoiceStatusColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { FileDown, FileText, HandCoins, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const STATUSES = ["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const;
const BUCKETS = ["all", "0-30", "31-60", "61-90", "90+"] as const;
const METHODS = ["Cash", "Bank Transfer", "Cheque", "Card"] as const;

export default function Invoices() {
  const { data: invoices, isLoading } = trpc.invoices.list.useQuery();
  const { data: aging } = trpc.invoices.aging.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const utils = trpc.useUtils();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [bucketFilter, setBucketFilter] = useState<(typeof BUCKETS)[number]>("all");
  const [search, setSearch] = useState("");

  // New invoice dialog
  const [invOpen, setInvOpen] = useState(false);
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

  const filtered = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (bucketFilter !== "all") {
        if (i.daysOverdue <= 0) return false;
        const b = i.daysOverdue <= 30 ? "0-30" : i.daysOverdue <= 60 ? "31-60" : i.daysOverdue <= 90 ? "61-90" : "90+";
        if (b !== bucketFilter) return false;
      }
      if (search && !i.invoiceNumber.toLowerCase().includes(search.toLowerCase()) && !i.customerName.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });
  }, [invoices, statusFilter, bucketFilter, search]);

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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(["0-30", "31-60", "61-90", "90+"] as const).map(b => (
            <button
              key={b}
              onClick={() => setBucketFilter(bucketFilter === b ? "all" : b)}
              className={`rounded-lg border p-3 text-left transition-colors ${bucketFilter === b ? "ring-2 ring-primary bg-primary/5" : "bg-card hover:bg-muted/50"}`}
            >
              <div className="text-xs text-muted-foreground">{b} days overdue</div>
              <div className="text-lg font-bold font-mono">{fmtEur(aging.buckets[b].amount)}</div>
              <div className="text-xs text-muted-foreground">{aging.buckets[b].count} invoice(s)</div>
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Input className="flex-1 min-w-52" placeholder="Search invoice number or customer…" value={search} onChange={e => setSearch(e.target.value)} />
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Outstanding (€)</TableHead>
                  <TableHead className="text-right">Days Overdue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-mono text-sm">{i.invoiceNumber}</TableCell>
                    <TableCell className="font-medium">{i.customerName}</TableCell>
                    <TableCell className="text-sm">{fmtDate(i.dueDate)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={invoiceStatusColors[i.status]}>
                        {i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {i.currency && i.currency !== "EUR" ? (
                        <span>
                          {Number(i.amount).toLocaleString("el-GR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                          <span className="text-xs text-muted-foreground">{i.currency}</span>
                          <span className="block text-xs text-muted-foreground">≈ {fmtEur(Number(i.amountEur ?? i.amount))}</span>
                        </span>
                      ) : (
                        fmtEur(i.amount)
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtEur(i.outstanding)}</TableCell>
                    <TableCell className={`text-right font-mono ${i.daysOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>
                      {i.daysOverdue > 0 ? i.daysOverdue : "—"}
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

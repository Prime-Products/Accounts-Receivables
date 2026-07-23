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
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Plus, ScrollText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const instStatusColor: Record<string, string> = {
  Upcoming: "bg-sky-100 text-sky-800 border-sky-200",
  Invoiced: "bg-violet-100 text-violet-800 border-violet-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Overdue: "bg-red-100 text-red-700 border-red-200",
};

export default function Contracts() {
  const { data: contracts, isLoading } = trpc.contracts.list.useQuery();
  const { data: customers } = trpc.customers.list.useQuery();
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: detail } = trpc.contracts.get.useQuery({ id: selectedId! }, { enabled: selectedId !== null });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ customerId: "", contractNumber: "", title: "", totalValue: "", startDate: "", endDate: "", installmentCount: "1" });
  const create = trpc.contracts.create.useMutation({
    onSuccess: () => {
      toast.success("Contract created with annual installment schedule");
      utils.contracts.invalidate();
      setOpen(false);
    },
    onError: e => toast.error(e.message),
  });

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

  const now = Date.now();
  const twoMonths = 61 * 24 * 60 * 60 * 1000;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6" /> Contracts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Service agreements with annual installment schedules — expiry alerts fire 2 months in advance
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Contract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Contract</DialogTitle>
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
                <Input value={form.contractNumber} onChange={e => setForm({ ...form, contractNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Total Value (€) *</Label>
                <Input type="number" value={form.totalValue} onChange={e => setForm({ ...form, totalValue: e.target.value })} />
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
            </div>
            <DialogFooter>
              <Button
                disabled={!form.customerId || !form.contractNumber || !form.title || !form.totalValue || !form.startDate || !form.endDate || create.isPending}
                onClick={() =>
                  create.mutate({
                    customerId: Number(form.customerId),
                    contractNumber: form.contractNumber,
                    title: form.title,
                    totalValue: Number(form.totalValue),
                    startDate: new Date(form.startDate).getTime(),
                    endDate: new Date(form.endDate).getTime(),
                    installmentCount: Number(form.installmentCount || 1),
                  })
                }
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (contracts ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">No contracts yet. Create the first service agreement.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {(contracts ?? []).map(c => {
            const expiringSoon = c.status === "Active" && c.endDate - now < twoMonths && c.endDate > now;
            const progress = Number(c.totalValue) > 0 ? Math.round((c.collectedAmount / Number(c.totalValue)) * 100) : 0;
            return (
              <Card
                key={c.id}
                className={`cursor-pointer transition-shadow hover:shadow-md ${selectedId === c.id ? "ring-2 ring-primary" : ""}`}
                onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      {c.contractNumber} — {c.title}
                      {expiringSoon && (
                        <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Expires {fmtDate(c.endDate)}
                        </Badge>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground font-normal">{c.customerName}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                    <span>
                      Value: <span className="font-mono font-semibold">{fmtEur(c.totalValue)}</span>
                    </span>
                    <span>
                      Collected: <span className="font-mono font-semibold text-emerald-700">{fmtEur(c.collectedAmount)}</span>
                    </span>
                    <span>
                      Installments: {c.installmentsPaid}/{c.installmentsTotal} paid
                    </span>
                    <span className="text-muted-foreground">
                      {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                    </span>
                  </div>
                  <Progress value={progress} className="h-2 mt-3" />
                  {selectedId === c.id && detail && detail.contract.id === c.id && (
                    <div className="mt-4 border rounded-md" onClick={e => e.stopPropagation()}>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detail.installments.map(inst => (
                            <TableRow key={inst.id}>
                              <TableCell>{inst.installmentNumber}</TableCell>
                              <TableCell>{fmtDate(inst.dueDate)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={instStatusColor[inst.status] ?? ""}>
                                  {inst.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{fmtEur(inst.amount)}</TableCell>
                              <TableCell className="text-right">
                                {inst.status === "Upcoming" || inst.status === "Overdue" ? (
                                  !inst.invoiceId ? (
                                    <Button size="sm" variant="outline" onClick={() => setInvDialog({ installmentId: inst.id })}>
                                      Invoice it
                                    </Button>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">Invoiced</span>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
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
            );
          })}
        </div>
      )}

      <Dialog open={invDialog !== null} onOpenChange={o => !o && setInvDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invoice Installment</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Invoice Number *</Label>
            <Input value={invNumber} onChange={e => setInvNumber(e.target.value)} placeholder="e.g. INV-2026-104" />
          </div>
          <DialogFooter>
            <Button
              disabled={!invNumber || invoiceInstallment.isPending}
              onClick={() => invDialog && invoiceInstallment.mutate({ installmentId: invDialog.installmentId, invoiceNumber: invNumber })}
            >
              Create Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

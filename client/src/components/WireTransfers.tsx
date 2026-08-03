import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Textarea } from "@/components/ui/textarea";
import { fmtCur, fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  DEFAULT_REMITTANCE_METHOD,
  REMITTANCE_METHODS,
  normalizeRemittanceMethod,
  type RemittanceMethod,
} from "@shared/remittanceMethods";
import { Building2, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AllocateWireTransferDialog } from "@/components/AllocateWireTransferDialog";

interface WireTransfersProps {
  customerId: number;
}

const CURRENCIES = ["EUR", "USD", "AED", "SGD", "GBP", "NOK", "JPY"];
/** Instruments a customer can remit with — same list as the Remittances page. */
const METHODS = REMITTANCE_METHODS;
type Method = RemittanceMethod;
const METHOD_STYLES: Record<Method, string> = {
  Transfer: "bg-sky-50 text-sky-700 border-sky-200",
  Cheque: "bg-amber-50 text-amber-800 border-amber-200",
  "Credit Card": "bg-violet-50 text-violet-700 border-violet-200",
};
function MethodBadge({ method }: { method?: string | null }) {
  const m = normalizeRemittanceMethod(method);
  return (
    <span className={cn("inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap", METHOD_STYLES[m])}>
      {m}
    </span>
  );
}

export function WireTransfers({ customerId }: WireTransfersProps) {
  const utils = trpc.useUtils();
  const wtCols = useResizableColumns("remittances-card", {
    date: 110,
    branch: 150,
    method: 120,
    amount: 130,
    status: 120,
    reference: 160,
    notes: 220,
    actions: 100,
  });
  const payCols = useResizableColumns("wire-payments", {
    date: 110,
    amount: 130,
    invoice: 130,
    branch: 130,
    fromBranch: 130,
    viaFrom: 190,
    transfer: 200,
  });
  const { data: transfers = [], isLoading } = trpc.customers.listWireTransfers.useQuery({ customerId });
  const { data: branches = [] } = trpc.customers.listBranches.useQuery();
  // Amounts credited to THIS company's invoices from any wire transfer (incl. other group members)
  const { data: incoming = [] } = trpc.customers.listIncomingAllocations.useQuery({ customerId });

  const [open, setOpen] = useState(false);
  /**
   * Money received from the client is what matters here; the derived
   * intercompany (inter-office) transfers stay hidden behind a toggle.
   */
  const [showInternal, setShowInternal] = useState(false);
  const internalCount = useMemo(
    () => (transfers as any[]).filter((t: any) => t.isInternal).length,
    [transfers]
  );
  const visibleTransfers = useMemo(
    () => (transfers as any[]).filter((t: any) => showInternal || !t.isInternal),
    [transfers, showInternal]
  );
  const [form, setForm] = useState({
    amount: "",
    currency: "EUR",
    branch: "none",
    method: DEFAULT_REMITTANCE_METHOD as Method,
    transferDate: new Date().toISOString().split("T")[0],
    status: "Pending",
    referenceNumber: "",
    notes: "",
  });

  const createMutation = trpc.customers.createWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Remittance recorded");
      utils.customers.listWireTransfers.invalidate({ customerId });
      setOpen(false);
      setForm({
        amount: "",
        currency: "EUR",
        branch: "none",
        method: DEFAULT_REMITTANCE_METHOD,
        transferDate: new Date().toISOString().split("T")[0],
        status: "Pending",
        referenceNumber: "",
        notes: "",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.customers.updateWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Remittance updated");
      utils.customers.listWireTransfers.invalidate({ customerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.customers.deleteWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Remittance deleted");
      utils.customers.listWireTransfers.invalidate({ customerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.amount) {
      toast.error("Amount is required");
      return;
    }

    const transferDate = new Date(form.transferDate).getTime();
    createMutation.mutate({
      customerId,
      amount: Number(form.amount),
      currency: form.currency,
      branch: form.branch !== "none" ? form.branch : null,
      method: form.method,
      transferDate,
      status: form.status as "Pending" | "Received",
      referenceNumber: form.referenceNumber || null,
      notes: form.notes || null,
      receivedDate: form.status === "Received" ? new Date().getTime() : null,
    });
  };

  const handleStatusChange = (id: number, newStatus: "Pending" | "Received") => {
    updateMutation.mutate({
      id,
      customerId,
      status: newStatus,
      receivedDate: newStatus === "Received" ? new Date().getTime() : null,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this remittance?")) {
      deleteMutation.mutate({ id, customerId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Remittances</h3>
        <div className="flex items-center gap-2">
          {internalCount > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowInternal(v => !v)}
              aria-pressed={showInternal}
              title={
                showInternal
                  ? "Hide the intercompany transfers between our own offices"
                  : "Also show the intercompany transfers between our own offices"
              }
              className={cn(
                "gap-2",
                showInternal
                  ? "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  : "text-muted-foreground"
              )}
            >
              <Building2 className="w-4 h-4" />
              Internal ({internalCount})
            </Button>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Remittance
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Remittance</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v as Method })}>
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

              <div>
                <Label>Branch (received at)</Label>
                <Select value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(branches as string[]).map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{form.method === "Cheque" ? "Cheque date" : "Payment date"}</Label>
                  <Input
                    type="date"
                    value={form.transferDate}
                    onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Received">Received</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Reference Number (optional)</Label>
                <Input
                  placeholder={
                    form.method === "Cheque"
                      ? "Cheque number"
                      : form.method === "Credit Card"
                        ? "Card authorisation / transaction ID"
                        : "Bank reference or transaction ID"
                  }
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                />
              </div>

              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      ) : visibleTransfers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              {internalCount > 0 && !showInternal
                ? "No customer remittances recorded yet — use the Internal button to see the intercompany transfers."
                : "No remittances recorded yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table className="table-fixed" style={{ width: wtCols.totalWidth, minWidth: "100%" }}>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["date", "Date"],
                      ["branch", "Branch"],
                      ["method", "Method"],
                      ["amount", "Amount"],
                      ["status", "Status"],
                      ["reference", "Reference"],
                      ["notes", "Notes"],
                    ] as const
                  ).map(([key, label]) => (
                    <TableHead key={key} className="relative" style={wtCols.style(key)}>
                      <span className="block truncate pr-1">{label}</span>
                      <ColResizer col={key} api={wtCols} />
                    </TableHead>
                  ))}
                  <TableHead style={wtCols.style("actions")}>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleTransfers.map((t: any) => (
                  <TableRow key={t.id} className={t.isInternal ? "bg-violet-50/40" : undefined}>
                    <TableCell>{fmtDate(Number(t.transferDate))}</TableCell>
                    <TableCell className="text-sm">
                      {t.isInternal ? (
                        <span className="inline-flex items-center gap-1 text-violet-700" title={`${t.fromBranch ?? "Our office"} → ${t.toBranch ?? "-"}`}>
                          <Building2 className="w-3 h-3 shrink-0" />
                          <span className="truncate">{t.toBranch ?? "Internal"}</span>
                        </span>
                      ) : (
                        t.branch || "-"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.isInternal ? <span className="text-muted-foreground">—</span> : <MethodBadge method={t.method} />}
                    </TableCell>
                    <TableCell>{fmtCur(t.amount, t.currency)}</TableCell>
                    <TableCell>
                      {t.isInternal ? (
                        <span className="text-sm text-muted-foreground">{t.status}</span>
                      ) : (
                      <Select
                        value={t.status}
                        onValueChange={(v) => handleStatusChange(t.id, v as "Pending" | "Received")}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Received">Received</SelectItem>
                        </SelectContent>
                      </Select>
                      )}
                    </TableCell>
                    <TableCell className="text-sm overflow-hidden">
                      <span className="block truncate">{t.referenceNumber || "-"}</span>
                    </TableCell>
                    <TableCell className="text-sm overflow-hidden">
                      <span className="block truncate" title={t.notes ?? undefined}>{t.notes || "-"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!t.isInternal && t.status === "Received" && (
                          <AllocateWireTransferDialog
                            transfer={{
                              id: t.id,
                              customerId: t.customerId,
                              amount: t.amount,
                              currency: t.currency,
                              status: t.status as "Pending" | "Received",
                            }}
                          />
                        )}
                        {!t.isInternal && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDelete(t.id)}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Incoming allocations: money credited to this company's invoices via remittances (possibly from other group members) */}
      {(incoming as any[]).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Incoming allocations{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (amounts settled on this company's invoices via remittances)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table className="table-fixed" style={{ width: payCols.totalWidth, minWidth: "100%" }}>
              <TableHeader>
                <TableRow>
                  {(
                    [
                      ["date", "Date"],
                      ["amount", "Amount"],
                      ["invoice", "Invoice"],
                      ["branch", "Branch"],
                      ["fromBranch", "From branch"],
                      ["viaFrom", "Via remittance from"],
                      ["transfer", "Remittance"],
                    ] as const
                  ).map(([key, label]) => (
                    <TableHead key={key} className="relative" style={payCols.style(key)}>
                      <span className="block truncate pr-1">{label}</span>
                      <ColResizer col={key} api={payCols} />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(incoming as any[]).map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{fmtDate(Number(a.createdAt))}</TableCell>
                    <TableCell className="font-mono font-semibold text-green-700">
                      {fmtCur(Number(a.amount), a.currency)}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{a.invoiceNumber ?? `#${a.invoiceId}`}</TableCell>
                    <TableCell className="text-sm">
                      {a.invoiceBranch ? (
                        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          {a.invoiceBranch}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {a.sourceBranch ? (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                          {a.sourceBranch}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-medium">{a.sourceCustomerName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtCur(Number(a.sourceAmount), a.sourceCurrency)} · {fmtDate(Number(a.sourceTransferDate))}
                      {a.sourceReference ? ` · ${a.sourceReference}` : ""}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

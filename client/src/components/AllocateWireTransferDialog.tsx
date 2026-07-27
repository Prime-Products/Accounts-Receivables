import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { fmtCur, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Trash2, Search, X } from "lucide-react";

/**
 * Allocation (συμψηφισμός) dialog: match a RECEIVED wire transfer against open
 * invoices of ANY company in the sender's group. E.g. a DYNACOM transfer can
 * settle CREST invoices — the settled amount is credited to the invoice's company.
 */
export function AllocateWireTransferDialog({
  transfer,
  trigger,
}: {
  transfer: {
    id: number;
    customerId: number;
    customerName?: string;
    amount: string | number;
    currency: string;
    status: "Pending" | "Received";
    allocatedAmount?: number;
  };
  trigger?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // invoiceId -> amount string being typed
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");

  const utils = trpc.useUtils();
  const { data: openInvoices = [], isLoading: invLoading } = trpc.customers.listGroupOpenInvoices.useQuery(
    { customerId: transfer.customerId },
    { enabled: isOpen }
  );
  const { data: allocations = [], isLoading: allocLoading } = trpc.customers.listWireTransferAllocations.useQuery(
    { wireTransferId: transfer.id },
    { enabled: isOpen }
  );

  const allocatedSoFar = useMemo(
    () => allocations.reduce((s: number, a: any) => s + Number(a.amount), 0),
    [allocations]
  );
  const remaining = Math.max(0, Number(transfer.amount) - allocatedSoFar);

  const pendingTotal = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0),
    [amounts]
  );
  const overAllocated = pendingTotal > remaining + 0.005;

  const invalidRows = useMemo(() => {
    const bad: number[] = [];
    for (const inv of openInvoices as any[]) {
      const v = Number(amounts[inv.id] || 0);
      if (v > 0 && v > inv.outstandingOriginal + 0.005) bad.push(inv.id);
    }
    return bad;
  }, [amounts, openInvoices]);

  // Filter invoices by search term (invoice number, company, branch, amount).
  // Rows where the user already typed an amount stay visible so the entered
  // total always matches what's on screen.
  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return openInvoices as any[];
    return (openInvoices as any[]).filter(inv => {
      if (Number(amounts[inv.id] || 0) > 0) return true;
      return (
        String(inv.invoiceNumber ?? "").toLowerCase().includes(q) ||
        String(inv.customerName ?? "").toLowerCase().includes(q) ||
        String(inv.company ?? "").toLowerCase().includes(q) ||
        String(inv.outstandingOriginal ?? "").includes(q)
      );
    });
  }, [openInvoices, search, amounts]);

  const allocateMutation = trpc.customers.allocateWireTransfer.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Allocated to ${res.results.length} invoice(s): ` +
          res.results.map(r => `${r.invoiceNumber} → ${r.newStatus}`).join(", ")
      );
      setAmounts({});
      utils.customers.listWireTransferAllocations.invalidate({ wireTransferId: transfer.id });
      utils.customers.listGroupOpenInvoices.invalidate({ customerId: transfer.customerId });
      utils.customers.getAllWireTransfers.invalidate();
      utils.invoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMutation = trpc.customers.removeWireTransferAllocation.useMutation({
    onSuccess: () => {
      toast.success("Allocation removed — invoice reverted");
      utils.customers.listWireTransferAllocations.invalidate({ wireTransferId: transfer.id });
      utils.customers.listGroupOpenInvoices.invalidate({ customerId: transfer.customerId });
      utils.customers.getAllWireTransfers.invalidate();
      utils.invoices.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleAllocate = () => {
    const entries = Object.entries(amounts)
      .map(([id, v]) => ({ invoiceId: Number(id), amount: Number(v) || 0 }))
      .filter(e => e.amount > 0);
    if (entries.length === 0) {
      toast.error("Enter an amount on at least one invoice");
      return;
    }
    if (overAllocated) {
      toast.error("Total exceeds the remaining unallocated amount of the transfer");
      return;
    }
    if (invalidRows.length > 0) {
      toast.error("Some amounts exceed the invoice outstanding balance");
      return;
    }
    allocateMutation.mutate({ wireTransferId: transfer.id, allocations: entries });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" disabled={transfer.status !== "Received"}>
            Allocate
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[96vw] sm:max-w-[1200px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Allocate Wire Transfer — {transfer.customerName ?? `Customer #${transfer.customerId}`}
          </DialogTitle>
        </DialogHeader>

        {/* Totals bar */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Transfer amount</div>
            <div className="font-mono font-semibold">{fmtCur(Number(transfer.amount), transfer.currency)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Already allocated</div>
            <div className="font-mono font-semibold">{fmtCur(allocatedSoFar, transfer.currency)}</div>
          </div>
          <div className={`rounded-md border p-3 ${overAllocated ? "border-red-500" : ""}`}>
            <div className="text-muted-foreground">Remaining to allocate</div>
            <div className={`font-mono font-semibold ${overAllocated ? "text-red-600" : ""}`}>
              {fmtCur(Math.max(0, remaining - pendingTotal), transfer.currency)}
            </div>
          </div>
        </div>

        {/* Existing allocations */}
        {allocations.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Existing allocations</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Company (credited)</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(allocations as any[]).map(a => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-sm">{a.invoiceNumber ?? `#${a.invoiceId}`}</TableCell>
                    <TableCell className="text-sm">{a.invoiceCustomerName}</TableCell>
                    <TableCell className="text-sm">{a.invoiceCompany ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtCur(Number(a.amount), a.invoiceCurrency ?? transfer.currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeMutation.mutate({ allocationId: a.id })}
                        disabled={removeMutation.isPending}
                        title="Remove allocation (reverts the invoice)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Open invoices of the whole group */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            Open invoices of the group{" "}
            <span className="font-normal text-muted-foreground">
              (all member companies — the amount is credited to the invoice's company)
            </span>
          </h4>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search invoice number, company, branch or amount..."
              className="h-9 pl-8 pr-8"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          {invLoading || allocLoading ? (
            <p className="text-sm text-muted-foreground py-4">Loading invoices...</p>
          ) : (openInvoices as any[]).length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No open invoices in this group</p>
          ) : filteredInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No invoices match "{search}" — clear the search to see all {(openInvoices as any[]).length} open invoices
            </p>
          ) : (
            <div className="max-h-[45vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Branch</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Outstanding</TableHead>
                    <TableHead className="w-36 text-right">Allocate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInvoices.map(inv => {
                    const invalid = invalidRows.includes(inv.id);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell className="font-mono text-sm">
                          {inv.invoiceNumber}
                          {inv.status === "Partially Paid" && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">Partial</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{inv.customerName}</TableCell>
                        <TableCell className="text-sm">{inv.company ?? "—"}</TableCell>
                        <TableCell className="text-sm">{fmtDate(Number(inv.dueDate))}</TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtCur(inv.outstandingOriginal, inv.currency)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center gap-1 justify-end">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              className={`h-8 w-28 text-right font-mono text-sm ${invalid ? "border-red-500" : ""}`}
                              value={amounts[inv.id] ?? ""}
                              onChange={e => setAmounts({ ...amounts, [inv.id]: e.target.value })}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 px-2 text-xs"
                              title="Fill full outstanding"
                              onClick={() =>
                                setAmounts({ ...amounts, [inv.id]: String(Math.min(inv.outstandingOriginal, Math.max(0, remaining - (pendingTotal - (Number(amounts[inv.id]) || 0)))).toFixed(2).replace(/\.00$/, "")) })
                              }
                            >
                              Max
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="text-sm text-muted-foreground">
            Entered total:{" "}
            <span className={`font-mono font-semibold ${overAllocated ? "text-red-600" : "text-foreground"}`}>
              {fmtCur(pendingTotal, transfer.currency)}
            </span>
            {overAllocated && <span className="ml-2 text-red-600">exceeds remaining amount</span>}
          </div>
          <Button
            onClick={handleAllocate}
            disabled={allocateMutation.isPending || pendingTotal <= 0 || overAllocated || invalidRows.length > 0}
          >
            {allocateMutation.isPending ? "Allocating..." : "Allocate (Συμψηφισμός)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

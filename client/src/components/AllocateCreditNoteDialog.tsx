import { useMemo, useState } from "react";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { fmtCur, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Trash2, Search, X } from "lucide-react";

/**
 * Matching (συμψηφισμός) dialog for an open credit note: settle it against open
 * invoices of any company in the same group, exactly like the wire-transfer
 * allocation. Only invoices in the credit note's currency are offered, because a
 * credit note cancels a debt document 1:1 without an FX decision.
 */
export function AllocateCreditNoteDialog({
  creditNote,
  trigger,
}: {
  creditNote: {
    id: number;
    customerId: number;
    customerName?: string | null;
    docNumber: string;
    currency?: string | null;
    amount: number;
    open: number;
  };
  trigger?: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [search, setSearch] = useState("");
  const currency = creditNote.currency ?? "EUR";

  const utils = trpc.useUtils();
  const { data: openInvoices = [], isLoading: invLoading } = trpc.customers.listGroupOpenInvoices.useQuery(
    { customerId: creditNote.customerId },
    { enabled: isOpen },
  );
  const { data: allocations = [], isLoading: allocLoading } = trpc.customers.listCreditNoteAllocations.useQuery(
    { creditNoteId: creditNote.id },
    { enabled: isOpen },
  );

  // Invoices in another currency can never be settled by this credit note, so
  // they are filtered out instead of failing on submit.
  const eligibleInvoices = useMemo(
    () => (openInvoices as any[]).filter(inv => (inv.currency ?? "EUR") === currency),
    [openInvoices, currency],
  );
  const skippedCurrencyCount = (openInvoices as any[]).length - eligibleInvoices.length;

  const matchedSoFar = useMemo(
    () => (allocations as any[]).reduce((s: number, a: any) => s + Number(a.amount), 0),
    [allocations],
  );
  // `open` already has previous matches subtracted (it comes from the payload),
  // so it is the authoritative remaining amount.
  const remaining = Math.max(0, creditNote.open);

  const pendingTotal = useMemo(
    () => Object.values(amounts).reduce((s, v) => s + (Number(v) || 0), 0),
    [amounts],
  );
  const overAllocated = pendingTotal > remaining + 0.005;

  const invalidRows = useMemo(() => {
    const bad: number[] = [];
    for (const inv of eligibleInvoices) {
      const v = Number(amounts[inv.id] || 0);
      if (v > 0 && v > inv.outstandingOriginal + 0.005) bad.push(inv.id);
    }
    return bad;
  }, [amounts, eligibleInvoices]);

  const filteredInvoices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleInvoices;
    return eligibleInvoices.filter(inv => {
      if (Number(amounts[inv.id] || 0) > 0) return true;
      return (
        String(inv.invoiceNumber ?? "").toLowerCase().includes(q) ||
        String(inv.customerName ?? "").toLowerCase().includes(q) ||
        String(inv.company ?? "").toLowerCase().includes(q) ||
        String(inv.outstandingOriginal ?? "").includes(q)
      );
    });
  }, [eligibleInvoices, search, amounts]);

  const refresh = () => {
    utils.customers.listCreditNoteAllocations.invalidate({ creditNoteId: creditNote.id });
    utils.customers.listGroupOpenInvoices.invalidate({ customerId: creditNote.customerId });
    utils.customers.get360.invalidate();
    utils.customers.groupDetail.invalidate();
    utils.invoices.invalidate();
  };

  const allocateMutation = trpc.customers.allocateCreditNote.useMutation({
    onSuccess: res => {
      toast.success(
        `Matched against ${res.results.length} invoice(s): ` +
          res.results.map(r => `${r.invoiceNumber} → ${r.newStatus}`).join(", "),
      );
      setAmounts({});
      refresh();
    },
    onError: err => toast.error(err.message),
  });

  const removeMutation = trpc.customers.removeCreditNoteAllocation.useMutation({
    onSuccess: () => {
      toast.success("Match removed — invoice reverted");
      refresh();
    },
    onError: err => toast.error(err.message),
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
      toast.error("Total exceeds the open amount of the credit note");
      return;
    }
    if (invalidRows.length > 0) {
      toast.error("Some amounts exceed the invoice outstanding balance");
      return;
    }
    allocateMutation.mutate({ creditNoteId: creditNote.id, allocations: entries });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[11px] bg-white border-sky-200 text-sky-700 hover:bg-sky-100"
            title={`Match credit note ${creditNote.docNumber} against invoices`}
          >
            Match
          </Button>
        )}
      </DialogTrigger>
      <ResizableDialogContent
        storageKey="allocate-credit-note"
        className="sm:max-w-none w-[96vw] max-w-[1200px] max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>
            Match credit note {creditNote.docNumber} — {creditNote.customerName ?? `Customer #${creditNote.customerId}`}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Credit note amount</div>
            <div className="font-mono font-semibold">{fmtCur(creditNote.amount, currency)}</div>
          </div>
          <div className="rounded-md border p-3">
            <div className="text-muted-foreground">Already matched</div>
            <div className="font-mono font-semibold">{fmtCur(matchedSoFar, currency)}</div>
          </div>
          <div className={`rounded-md border p-3 ${overAllocated ? "border-red-500" : ""}`}>
            <div className="text-muted-foreground">Remaining to match</div>
            <div className={`font-mono font-semibold ${overAllocated ? "text-red-600" : ""}`}>
              {fmtCur(Math.max(0, remaining - pendingTotal), currency)}
            </div>
          </div>
        </div>

        {(allocations as any[]).length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Existing matches</h4>
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
                      {fmtCur(Number(a.amount), a.invoiceCurrency ?? currency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeMutation.mutate({ allocationId: a.id })}
                        disabled={removeMutation.isPending}
                        title="Remove the match (reverts the invoice)"
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
          ) : eligibleInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No open {currency} invoices in this group
              {skippedCurrencyCount > 0 ? ` (${skippedCurrencyCount} invoice(s) in another currency cannot be matched)` : ""}
            </p>
          ) : filteredInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No invoices match "{search}" — clear the search to see all {eligibleInvoices.length} open invoices
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
                    <TableHead className="w-36 text-right">Match</TableHead>
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
                              title="Fill the smaller of invoice outstanding and remaining credit"
                              onClick={() =>
                                setAmounts({
                                  ...amounts,
                                  [inv.id]: String(
                                    Math.min(
                                      inv.outstandingOriginal,
                                      Math.max(0, remaining - (pendingTotal - (Number(amounts[inv.id]) || 0))),
                                    )
                                      .toFixed(2)
                                      .replace(/\.00$/, ""),
                                  ),
                                })
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
              {fmtCur(pendingTotal, currency)}
            </span>
            {overAllocated && <span className="ml-2 text-red-600">exceeds the open credit amount</span>}
          </div>
          <Button
            onClick={handleAllocate}
            disabled={allocateMutation.isPending || pendingTotal <= 0 || overAllocated || invalidRows.length > 0}
          >
            {allocateMutation.isPending ? "Matching..." : "Match (Συμψηφισμός)"}
          </Button>
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}

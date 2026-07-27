import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { branchColors, branchShort, fmtCur, fmtDate, fmtEur, invoiceStatusColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Ship, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

/** The unified invoice row shape shared by invoices.list, groupDetail and get360. */
export interface InvoiceRowData {
  id: number;
  invoiceNumber: string;
  customerName?: string | null;
  vesselId?: number | null;
  vesselName?: string | null;
  company?: string | null;
  currency?: string | null;
  amount: string | number;
  amountEur?: string | number | null;
  paidAmount: string | number;
  status: string;
  issueDate: number;
  dueDate: number;
  outstanding: number;
  daysOverdue: number;
}

type SortKey =
  | "invoiceNumber"
  | "customerName"
  | "vesselName"
  | "company"
  | "issueDate"
  | "dueDate"
  | "status"
  | "amount"
  | "paidAmount"
  | "outstanding"
  | "daysOverdue";

function sortValue(row: InvoiceRowData, key: SortKey): string | number {
  switch (key) {
    case "invoiceNumber": return row.invoiceNumber ?? "";
    case "customerName": return (row.customerName ?? "").toLowerCase();
    case "vesselName": return (row.vesselName ?? "").toLowerCase();
    case "company": return (row.company ?? "").toLowerCase();
    case "issueDate": return row.issueDate ?? 0;
    case "dueDate": return row.dueDate ?? 0;
    case "status": return row.status ?? "";
    case "amount": return Number(row.amountEur ?? row.amount) || 0;
    case "paidAmount": return Number(row.paidAmount) || 0;
    case "outstanding": return Number(row.outstanding) || 0;
    case "daysOverdue": return Number(row.daysOverdue) || 0;
  }
}

/**
 * Shared invoice table used by the Invoices page, the group card and the customer card,
 * so every view shows exactly the same information and actions.
 */
export function InvoicesTable({
  rows,
  showCustomer = true,
  onDisputeChanged,
}: {
  rows: InvoiceRowData[];
  /** Show the Customer column (hidden on the single-customer card). */
  showCustomer?: boolean;
  /** Called after a dispute change so the parent can refresh its own query. */
  onDisputeChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const [dispTarget, setDispTarget] = useState<{ id: number; invoiceNumber: string } | null>(null);
  const [dispReason, setDispReason] = useState("");
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const markDisputed = trpc.invoices.markDisputed.useMutation({
    onSuccess: (_r, vars) => {
      toast.success(vars.disputed ? "Invoice marked as Disputed" : "Dispute cleared");
      utils.invoices.invalidate();
      onDisputeChanged?.();
      setDispTarget(null);
      setDispReason("");
    },
    onError: e => toast.error(e.message),
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortKey(null); setSortDir("asc"); } // third click clears sorting
    } else {
      setSortKey(key);
      // Numeric/date columns usually want "largest first" on first click
      const descFirst: SortKey[] = ["amount", "paidAmount", "outstanding", "daysOverdue"];
      setSortDir(descFirst.includes(key) ? "desc" : "asc");
    }
  };

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb) * dir;
      return ((va as number) - (vb as number)) * dir;
    });
  }, [rows, sortKey, sortDir]);

  const SortableHead = ({ label, k, align }: { label: string; k: SortKey; align?: "right" }) => (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors select-none ${align === "right" ? "justify-end w-full" : ""} ${sortKey === k ? "text-foreground font-semibold" : ""}`}
        title={`Sort by ${label}`}
      >
        {label}
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </TableHead>
  );

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <SortableHead label="Invoice" k="invoiceNumber" />
            {showCustomer && <SortableHead label="Customer" k="customerName" />}
            <SortableHead label="Vessel" k="vesselName" />
            <SortableHead label="Prime Branch" k="company" />
            <SortableHead label="Doc. Date" k="issueDate" />
            <SortableHead label="Due Date" k="dueDate" />
            <SortableHead label="Status" k="status" />
            <SortableHead label="Amount" k="amount" align="right" />
            <SortableHead label="Paid" k="paidAmount" align="right" />
            <SortableHead label="Outstanding" k="outstanding" align="right" />
            <SortableHead label="Days Overdue" k="daysOverdue" align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map(i => (
            <TableRow key={i.id}>
              <TableCell className="font-mono text-sm">{i.invoiceNumber}</TableCell>
              {showCustomer && (
                <TableCell className="font-medium max-w-64">
                  <span className="block truncate" title={i.customerName ?? undefined}>{i.customerName ?? "—"}</span>
                </TableCell>
              )}
              <TableCell className="max-w-48">
                {i.vesselName ? (
                  i.vesselId ? (
                    <Link href={`/vessels/${i.vesselId}`}>
                      <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1 font-normal max-w-44 cursor-pointer hover:bg-sky-100 transition-colors" title={`View vessel: ${i.vesselName}`}>
                        <Ship className="h-3 w-3 shrink-0" />
                        <span className="truncate">{i.vesselName}</span>
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1 font-normal max-w-44" title={`Vessel: ${i.vesselName}`}>
                      <Ship className="h-3 w-3 shrink-0" />
                      <span className="truncate">{i.vesselName}</span>
                    </Badge>
                  )
                ) : (
                  <span className="text-muted-foreground/50 text-xs">—</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={branchColors[branchShort(i.company)] ?? "bg-gray-50 text-gray-600 border-gray-200"} title={i.company ?? undefined}>
                  {branchShort(i.company)}
                </Badge>
              </TableCell>
              <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.issueDate)}</TableCell>
              <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.dueDate)}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="group inline-flex items-center gap-0.5" title="Change status">
                      <Badge variant="outline" className={invoiceStatusColors[i.status]}>
                        {i.status}
                      </Badge>
                      <ChevronDown className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {i.status !== "Disputed" ? (
                      <DropdownMenuItem onClick={() => { setDispReason(""); setDispTarget({ id: i.id, invoiceNumber: i.invoiceNumber }); }}>
                        <AlertTriangle className="h-4 w-4 mr-2 text-purple-600" />
                        Mark as Disputed
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => markDisputed.mutate({ id: i.id, disputed: false })}>
                        <Undo2 className="h-4 w-4 mr-2 text-muted-foreground" />
                        Clear dispute
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
              <TableCell className="text-right font-mono">
                {i.currency && i.currency !== "EUR" ? fmtCur(i.paidAmount, i.currency, 2) : fmtEur(i.paidAmount)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold">
                {i.currency && i.currency !== "EUR" ? (
                  <span>
                    {fmtCur(Number(i.amount) - Number(i.paidAmount), i.currency, 2)}
                    <span className="block text-xs text-muted-foreground font-normal">≈ {fmtEur(i.outstanding)}</span>
                  </span>
                ) : (
                  fmtEur(i.outstanding)
                )}
              </TableCell>
              <TableCell className={`text-right font-mono ${i.daysOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>
                {i.daysOverdue > 0 ? i.daysOverdue : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Dispute reason dialog */}
      <Dialog open={!!dispTarget} onOpenChange={o => { if (!o) setDispTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-purple-600" />
              Dispute invoice {dispTarget?.invoiceNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="dispute-reason-shared">Reason (optional)</Label>
            <Textarea
              id="dispute-reason-shared"
              placeholder="e.g. Customer disputes the amount / wrong charge / pending credit note..."
              value={dispReason}
              onChange={e => setDispReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              The invoice will be marked as Disputed. The reason is saved in the invoice notes and the audit trail. You can revert anytime via "Clear dispute".
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDispTarget(null)}>Cancel</Button>
            <Button
              disabled={markDisputed.isPending}
              onClick={() => dispTarget && markDisputed.mutate({ id: dispTarget.id, disputed: true, reason: dispReason.trim() || undefined })}
            >
              {markDisputed.isPending ? "Saving..." : "Mark as Disputed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

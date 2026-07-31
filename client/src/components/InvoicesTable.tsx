import { Badge } from "@/components/ui/badge";
import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import NewTaskDialog from "@/components/NewTaskDialog";
import { branchColors, branchShort, fmtCur, fmtDate, fmtEur, invoiceStatusColors } from "@/lib/format";
import { invoiceDisplayStatus } from "@/lib/invoiceFilters";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Banknote, ChevronDown, FileMinus2, FileSignature, Send, Ship, Undo2, X } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

// Lazy import to break the circular dependency (VesselDetailDialog renders InvoicesTable).
const VesselDetailDialog = lazy(() =>
  import("@/components/VesselDetailDialog").then(m => ({ default: m.VesselDetailDialog })),
);

/** The unified invoice row shape shared by invoices.list, groupDetail and get360. */
export interface InvoiceRowData {
  id: number;
  invoiceNumber: string;
  customerId?: number | null;
  customerName?: string | null;
  vesselId?: number | null;
  vesselName?: string | null;
  isContractInstallment?: boolean;
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

/**
 * An open credit note as it appears INSIDE the transactions list. Credit notes
 * are ordered together with the invoices by issue date, because that is how the
 * customer's account statement reads.
 */
/** A wire transfer with an unallocated remainder, as shown inside the transactions list. */
export interface OpenTransferRow {
  id: number;
  customerId: number;
  customerName: string;
  amount: number;
  allocated: number;
  unallocated: number;
  currency: string;
  transferDate: number;
  status: "Pending" | "Received";
  referenceNumber: string | null;
  branch: string | null;
  notes: string | null;
}

export interface CreditNoteRowData {
  id: number;
  customerId: number;
  customerName?: string | null;
  docNumber: string;
  docDate: number;
  branch?: string | null;
  currency?: string | null;
  amount: number;
  allocated: number;
  open: number;
  openEur: number;
  vesselName?: string | null;
  contractNo?: string | null;
}

/**
 * A row of the transactions list: an invoice, an open credit note or a payment
 * (wire transfer). All three are ordered together by issue date, the way an
 * account statement reads.
 */
type TxRow =
  | { kind: "invoice"; issueDate: number; sortId: number; invoice: InvoiceRowData }
  | { kind: "credit"; issueDate: number; sortId: number; credit: CreditNoteRowData }
  | { kind: "transfer"; issueDate: number; sortId: number; transfer: OpenTransferRow };

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
/**
 * One credit-note line inside the transactions list. It uses the same columns as
 * an invoice so the eye can scan a single grid: the document number sits in the
 * Invoice column, the issue date in the Due Date column (a credit note has no due
 * date) and the amounts are shown negative, because a credit note reduces what
 * the customer owes.
 */
function CreditNoteRow({
  cn,
  showCustomer,
  enableSelection,
}: {
  cn: CreditNoteRowData;
  showCustomer: boolean;
  enableSelection: boolean;
}) {
  const cur = cn.currency && cn.currency !== "EUR" ? cn.currency : null;
  return (
    <TableRow className="bg-sky-50/40 hover:bg-sky-50">
      {enableSelection && <TableCell className="w-8" />}
      <TableCell className="font-mono text-xs whitespace-nowrap">
        <span className="inline-flex items-center gap-1" title={`Credit note ${cn.docNumber}`}>
          <FileMinus2 className="h-3.5 w-3.5 text-sky-600 shrink-0" aria-label="Credit note" role="img" />
          {cn.docNumber}
        </span>
      </TableCell>
      {showCustomer && (
        <TableCell className="font-medium overflow-hidden text-sm">
          <span className="block truncate" title={cn.customerName ?? undefined}>{cn.customerName ?? "—"}</span>
        </TableCell>
      )}
      <TableCell className="overflow-hidden">
        {cn.vesselName ? (
          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1 font-normal max-w-full" title={`Vessel: ${cn.vesselName}`}>
            <Ship className="h-3 w-3 shrink-0" />
            <span className="truncate">{cn.vesselName}</span>
          </Badge>
        ) : cn.contractNo ? (
          <span className="text-xs text-muted-foreground truncate" title={`Contract ${cn.contractNo}`}>{cn.contractNo}</span>
        ) : (
          <span className="text-muted-foreground/50 text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className={branchColors[branchShort(cn.branch)] ?? "bg-gray-50 text-gray-600 border-gray-200"} title={cn.branch ?? undefined}>
          {branchShort(cn.branch)}
        </Badge>
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap" title="Issue date of the credit note">{fmtDate(cn.docDate)}</TableCell>
      <TableCell className="text-xs whitespace-nowrap text-muted-foreground/60" title="A credit note has no due date">—</TableCell>
      <TableCell>
        <div className="flex flex-nowrap items-center gap-1">
          <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">Credit note</Badge>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-sm whitespace-nowrap text-sky-700">
        {cur ? (
          <span>
            −{fmtCur(cn.amount, cur, 2)}
          </span>
        ) : (
          <>−{fmtEur(cn.amount)}</>
        )}
      </TableCell>
      <TableCell className="text-right font-mono text-sm whitespace-nowrap" title="Already matched against invoices">
        {cn.allocated > 0.005 ? (cur ? fmtCur(cn.allocated, cur, 2) : fmtEur(cn.allocated)) : <span className="text-muted-foreground/50">—</span>}
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold whitespace-nowrap text-sky-700">
        {cur ? (
          <span>
            −{fmtCur(cn.open, cur, 2)}
            <span className="block text-xs text-muted-foreground font-normal">≈ −{fmtEur(cn.openEur)}</span>
          </span>
        ) : (
          <>−{fmtEur(cn.open)}</>
        )}
      </TableCell>
    </TableRow>
  );
}

/**
 * One payment (wire transfer) line inside the transactions list. Only transfers
 * with an unallocated remainder reach this list — fully allocated payments
 * disappear like paid invoices. Amounts are shown negative because a payment
 * reduces what the customer owes, and matching happens on the Wire Transfers
 * page, so this row only links there.
 */
function PaymentRow({
  t,
  showCustomer,
  enableSelection,
}: {
  t: OpenTransferRow;
  showCustomer: boolean;
  enableSelection: boolean;
}) {
  const cur = t.currency && t.currency !== "EUR" ? t.currency : null;
  const neg = (v: number) => (cur ? `−${fmtCur(v, cur, 2)}` : `−${fmtEur(v)}`);
  return (
    <TableRow className="bg-emerald-50/40 hover:bg-emerald-50">
      {enableSelection && <TableCell className="w-8" />}
      <TableCell className="font-mono text-xs whitespace-nowrap">
        <span className="inline-flex items-center gap-1" title={t.referenceNumber ? `Payment ref. ${t.referenceNumber}` : "Payment on account"}>
          <Banknote className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-label="Payment" role="img" />
          {t.referenceNumber ?? "—"}
        </span>
      </TableCell>
      {showCustomer && (
        <TableCell className="font-medium overflow-hidden text-sm">
          <span className="block truncate" title={t.customerName ?? undefined}>{t.customerName ?? "—"}</span>
        </TableCell>
      )}
      <TableCell className="overflow-hidden">
        <span className="text-muted-foreground/50 text-xs">—</span>
      </TableCell>
      <TableCell>
        {t.branch ? (
          <Badge variant="outline" className={branchColors[branchShort(t.branch)] ?? "bg-gray-50 text-gray-600 border-gray-200"} title={t.branch}>
            {branchShort(t.branch)}
          </Badge>
        ) : (
          <span className="text-muted-foreground/50 text-xs">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs whitespace-nowrap" title="Date the payment was received">{fmtDate(t.transferDate)}</TableCell>
      <TableCell className="text-xs whitespace-nowrap text-muted-foreground/60">—</TableCell>
      <TableCell>
        <div className="flex flex-nowrap items-center gap-1">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Payment</Badge>
          {t.status === "Pending" && (
            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pending</Badge>
          )}
          <Link href="/wire-transfers" className="text-xs text-primary hover:underline whitespace-nowrap" title="Matching is done on the Wire Transfers page">
            Allocate →
          </Link>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-sm whitespace-nowrap text-emerald-700">{neg(t.amount)}</TableCell>
      <TableCell className="text-right font-mono text-sm whitespace-nowrap" title="Already matched against invoices">
        {t.allocated > 0.005 ? (cur ? fmtCur(t.allocated, cur, 2) : fmtEur(t.allocated)) : <span className="text-muted-foreground/50">—</span>}
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold whitespace-nowrap text-emerald-700">{neg(t.unallocated)}</TableCell>
    </TableRow>
  );
}

export function InvoicesTable({
  rows,
  creditNotes = [],
  transfers = [],
  showCustomer = true,
  onDisputeChanged,
  disableVesselDialog = false,
  enableSelection = true,
}: {
  rows: InvoiceRowData[];
  /** Open credit notes to merge into the same list (ordered by issue date). */
  creditNotes?: CreditNoteRowData[];
  /** Payments (wire transfers with an unallocated remainder) to merge into the list. */
  transfers?: OpenTransferRow[];
  /** Show the Customer column (hidden on the single-customer card). */
  showCustomer?: boolean;
  /** Called after a dispute change so the parent can refresh its own query. */
  onDisputeChanged?: () => void;
  /** Disable the inline vessel dialog (used inside VesselDetailDialog to avoid nesting). */
  disableVesselDialog?: boolean;
  /** Enable row selection + "Send to colleague" bulk action. */
  enableSelection?: boolean;
}) {
  const utils = trpc.useUtils();
  const [dispTarget, setDispTarget] = useState<{ id: number; invoiceNumber: string } | null>(null);
  const [dispReason, setDispReason] = useState("");
  const [vesselDialogId, setVesselDialogId] = useState<number | null>(null);
  const [vesselDialogOpen, setVesselDialogOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [sendOpen, setSendOpen] = useState(false);
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
  // Per-row contract-installment toggle removed: the flag now comes only from DB sync / bulk Excel upload.
  const colDefaults = useMemo(() => {
    const d: Record<string, number> = {
      invoiceNumber: 110,
      ...(showCustomer ? { customerName: 170 } : {}),
      vesselName: 100,
      company: 100,
      issueDate: 100,
      dueDate: 100,
      status: 175,
      amount: 110,
      paidAmount: 85,
      outstanding: 130,
    };
    return d;
  }, [showCustomer]);
  // The status cell can hold a primary badge plus the Disputed badge side by
  // side; below this width they would be clipped, so a previously saved narrow
  // width is never honoured for it.
  const colMins = useMemo(() => ({ status: 150 }), []);
  const cols = useResizableColumns(showCustomer ? "invoices" : "invoices-nocust", colDefaults, colMins);

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

  /**
   * Invoices and credit notes in ONE list. Default order is issue date, newest
   * first — the way an account statement reads. When the user sorts by a column,
   * invoices are sorted by that column and each credit note keeps its place by
   * issue date, so the credit notes never pile up at one end of the table.
   */
  const txRows = useMemo<TxRow[]>(() => {
    const invoiceRows: TxRow[] = sortedRows.map(i => ({
      kind: "invoice" as const,
      issueDate: i.issueDate ?? 0,
      sortId: i.id,
      invoice: i,
    }));
    if (creditNotes.length === 0 && transfers.length === 0) return invoiceRows;
    const creditRows: TxRow[] = creditNotes.map(c => ({
      kind: "credit" as const,
      issueDate: c.docDate ?? 0,
      sortId: c.id,
      credit: c,
    }));
    const transferRows: TxRow[] = transfers.map(t => ({
      kind: "transfer" as const,
      issueDate: t.transferDate ?? 0,
      sortId: t.id,
      transfer: t,
    }));
    const extras = [...creditRows, ...transferRows];
    if (sortKey) {
      // Keep the user's invoice ordering, then drop credit notes and payments in
      // by issue date relative to the invoices around them.
      const merged = [...invoiceRows];
      for (const cr of extras) {
        const at = merged.findIndex(r => r.kind === "invoice" && r.issueDate <= cr.issueDate);
        if (at === -1) merged.push(cr);
        else merged.splice(at, 0, cr);
      }
      return merged;
    }
    return [...invoiceRows, ...extras].sort(
      (a, b) => b.issueDate - a.issueDate || b.sortId - a.sortId,
    );
  }, [sortedRows, creditNotes, transfers, sortKey]);

  const selectedRows = useMemo(() => rows.filter(r => selectedIds.has(r.id)), [rows, selectedIds]);
  const toggleRow = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allVisibleSelected = sortedRows.length > 0 && sortedRows.every(r => selectedIds.has(r.id));
  const toggleAll = () => {
    setSelectedIds(prev => {
      if (allVisibleSelected) return new Set();
      return new Set(sortedRows.map(r => r.id));
    });
  };
  // Default the task's customer to the customer of the first selected invoice (when known).
  const sendDefaultCustomerId = selectedRows.find(r => r.customerId != null)?.customerId ?? undefined;

  const SortableHead = ({ label, k, align }: { label: string; k: SortKey; align?: "right" }) => (
    <TableHead className={`relative whitespace-nowrap px-2 ${align === "right" ? "text-right" : ""}`} style={cols.style(k)}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors select-none max-w-full pr-1 ${align === "right" ? "justify-end w-full" : ""} ${sortKey === k ? "text-foreground font-semibold" : ""}`}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
      <ColResizer col={k} api={cols} />
    </TableHead>
  );

  return (
    <>
      <Table className="table-fixed [&_td]:px-2 [&_td]:py-2" style={{ width: cols.totalWidth, minWidth: "100%" }}>
        <TableHeader>
          <TableRow>
            {enableSelection && (
              <TableHead className="w-8 px-2">
                <Checkbox checked={allVisibleSelected} onCheckedChange={toggleAll} aria-label="Select all invoices" />
              </TableHead>
            )}
            <SortableHead label="Invoice" k="invoiceNumber" />
            {showCustomer && <SortableHead label="Customer" k="customerName" />}
            <SortableHead label="Vessel" k="vesselName" />
            <SortableHead label="Branch" k="company" />
            <SortableHead label="Issue Date" k="issueDate" />
            <SortableHead label="Due Date" k="dueDate" />
            <SortableHead label="Status" k="status" />
            <SortableHead label="Amount" k="amount" align="right" />
            <SortableHead label="Paid" k="paidAmount" align="right" />
            <SortableHead label="Outstanding" k="outstanding" align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {txRows.map(row => row.kind === "transfer" ? (
            <PaymentRow
              key={`wt-${row.transfer.id}`}
              t={row.transfer}
              showCustomer={showCustomer}
              enableSelection={enableSelection}
            />
          ) : row.kind === "credit" ? (
            <CreditNoteRow
              key={`cn-${row.credit.id}`}
              cn={row.credit}
              showCustomer={showCustomer}
              enableSelection={enableSelection}
            />
          ) : (() => {
            const i = row.invoice;
            return (
            <TableRow key={`inv-${i.id}`}>
              {enableSelection && (
                <TableCell className="w-8" onClick={e => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(i.id)}
                    onCheckedChange={() => toggleRow(i.id)}
                    aria-label={`Select invoice ${i.invoiceNumber}`}
                  />
                </TableCell>
              )}
              <TableCell className="font-mono text-xs whitespace-nowrap">
                <span className="inline-flex items-center gap-1">
                  {i.invoiceNumber}
                  {i.isContractInstallment && (
                    <FileSignature className="h-3.5 w-3.5 text-violet-600 shrink-0" aria-label="Contract installment" role="img" />
                  )}
                </span>
              </TableCell>
              {showCustomer && (
                <TableCell className="font-medium overflow-hidden text-sm">
                  <span className="block truncate" title={i.customerName ?? undefined}>{i.customerName ?? "—"}</span>
                </TableCell>
              )}
              <TableCell className="overflow-hidden">
                {i.vesselName ? (
                  i.vesselId && !disableVesselDialog ? (
                    <button type="button" onClick={() => { setVesselDialogId(i.vesselId!); setVesselDialogOpen(true); }} className="max-w-full">
                      <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1 font-normal max-w-full cursor-pointer hover:bg-sky-100 transition-colors" title={`View vessel: ${i.vesselName}`}>
                        <Ship className="h-3 w-3 shrink-0" />
                        <span className="truncate">{i.vesselName}</span>
                      </Badge>
                    </button>
                  ) : (
                    <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200 gap-1 font-normal max-w-full" title={`Vessel: ${i.vesselName}`}>
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
              <TableCell className="text-xs whitespace-nowrap" title="Issue date">{fmtDate(i.issueDate)}</TableCell>
              <TableCell className="text-xs whitespace-nowrap">{fmtDate(i.dueDate)}</TableCell>
              <TableCell>
                {/* flex-nowrap: the primary badge and Disputed stay on one line
                    even in a narrow column, so a row is never read as two
                    stacked statuses. */}
                <div className="flex flex-nowrap items-center gap-1">
                  {/* One primary badge: Open until the due date passes, Overdue after.
                      Overdue is derived from the due date and is never stored, so it is
                      not selectable — the dropdown only carries the dispute action. */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="group inline-flex items-center gap-0.5" title="Change status">
                        {(() => {
                          const d = invoiceDisplayStatus(i);
                          return (
                            <Badge
                              variant="outline"
                              className={invoiceStatusColors[d.primary]}
                              title={
                                d.daysOverdue > 0
                                  ? `Due ${fmtDate(i.dueDate)} — ${d.daysOverdue} day(s) overdue`
                                  : `Due ${fmtDate(i.dueDate)}`
                              }
                            >
                              {d.primary}
                              {d.primary === "Overdue" ? ` ${d.daysOverdue}d` : ""}
                            </Badge>
                          );
                        })()}
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
                  {/* Disputed is the only secondary badge: it is orthogonal to the
                      settlement stage, so it sits next to Open / Overdue. */}
                  {i.status === "Disputed" && (
                    <Badge variant="outline" className={invoiceStatusColors.Disputed} title="Under dispute — see invoice notes for the reason">
                      Disputed
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                {i.currency && i.currency !== "EUR" ? (
                  <span>
                    {fmtCur(i.amount, i.currency, 2)}
                    <span className="block text-xs text-muted-foreground">≈ {fmtEur(Number(i.amountEur ?? i.amount))}</span>
                  </span>
                ) : (
                  fmtEur(i.amount)
                )}
              </TableCell>
              <TableCell className="text-right font-mono text-sm whitespace-nowrap">
                {i.currency && i.currency !== "EUR" ? fmtCur(i.paidAmount, i.currency, 2) : fmtEur(i.paidAmount)}
              </TableCell>
              <TableCell className="text-right font-mono text-sm font-semibold whitespace-nowrap">
                {i.currency && i.currency !== "EUR" ? (
                  <span>
                    {fmtCur(Number(i.amount) - Number(i.paidAmount), i.currency, 2)}
                    <span className="block text-xs text-muted-foreground font-normal">≈ {fmtEur(i.outstanding)}</span>
                  </span>
                ) : (
                  fmtEur(i.outstanding)
                )}
              </TableCell>
            </TableRow>
            );
          })())}
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

      {!disableVesselDialog && vesselDialogId != null && (
        <Suspense fallback={null}>
          <VesselDetailDialog
            vesselId={vesselDialogId}
            open={vesselDialogOpen}
            onOpenChange={setVesselDialogOpen}
          />
        </Suspense>
      )}

      {/* Floating bulk-action bar for selected invoices */}
      {enableSelection && selectedIds.size > 0 && (
        <div className="sticky bottom-3 z-20 mx-auto w-fit flex items-center gap-3 rounded-full border bg-background shadow-lg px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} invoice(s) selected</span>
          <Button size="sm" className="gap-1.5 rounded-full" onClick={() => setSendOpen(true)}>
            <Send className="h-3.5 w-3.5" /> Send to colleague
          </Button>
          <Button size="sm" variant="ghost" className="gap-1 rounded-full text-muted-foreground" onClick={() => setSelectedIds(new Set())}>
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      )}
      {sendOpen && (
        <NewTaskDialog
          key={`send-${Array.from(selectedIds).join("-")}`}
          open={sendOpen}
          onOpenChange={o => {
            setSendOpen(o);
            if (!o) setSelectedIds(new Set());
          }}
          defaultCustomerId={sendDefaultCustomerId}
          defaultTitle={`Help needed: review ${selectedIds.size} invoice(s)`}
          defaultDescription={`Please take a look at the attached invoice(s):\n${selectedRows.map(r => `• ${r.invoiceNumber} — ${r.customerName ?? ""} (${r.currency && r.currency !== "EUR" ? r.currency + " " : "€"}${Number(r.amount).toLocaleString()})`).join("\n")}`}
          attachInvoices={selectedRows.map(r => ({ id: r.id, invoiceNumber: r.invoiceNumber, amount: r.amount, currency: r.currency }))}
          trigger={<span className="hidden" />}
        />
      )}
    </>
  );
}

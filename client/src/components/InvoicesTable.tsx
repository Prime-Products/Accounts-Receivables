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
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, FileSignature, Send, Ship, Undo2, X } from "lucide-react";
import { lazy, Suspense, useMemo, useState } from "react";
import { toast } from "sonner";

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
  disableVesselDialog = false,
  enableSelection = true,
}: {
  rows: InvoiceRowData[];
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
      daysOverdue: 95,
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
            <SortableHead label="Doc. Date" k="issueDate" />
            <SortableHead label="Due Date" k="dueDate" />
            <SortableHead label="Status" k="status" />
            <SortableHead label="Amount" k="amount" align="right" />
            <SortableHead label="Paid" k="paidAmount" align="right" />
            <SortableHead label="Outstanding" k="outstanding" align="right" />
            <SortableHead label="Days Ovd" k="daysOverdue" align="right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map(i => (
            <TableRow key={i.id}>
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
              <TableCell className="text-xs whitespace-nowrap">{fmtDate(i.issueDate)}</TableCell>
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
              <TableCell className={`text-right font-mono text-sm whitespace-nowrap ${i.daysOverdue > 0 ? "text-red-600 font-semibold" : ""}`}>
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

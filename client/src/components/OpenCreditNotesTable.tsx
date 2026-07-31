import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchColors, branchShort, fmtCur, fmtDate, fmtEur } from "@/lib/format";
import { ReceiptText } from "lucide-react";

export interface OpenCreditNoteRow {
  id: number;
  customerId: number;
  customerName: string;
  docNumber: string;
  docDate: number;
  currency: string;
  amount: number;
  allocated: number;
  open: number;
  openEur: number;
  branch: string | null;
  vesselName: string | null;
  contractNo: string | null;
  notes: string | null;
}

/**
 * "Credit notes" section of the transactions list: credit notes whose amount is
 * not yet matched against invoices. They reduce what the customer owes. Matching
 * is a manual decision — nothing is allocated automatically — and fully matched
 * credit notes disappear from this list, like paid invoices.
 */
export function OpenCreditNotesTable({
  rows,
  showCustomer = true,
}: {
  rows: OpenCreditNoteRow[];
  showCustomer?: boolean;
}) {
  if (!rows || rows.length === 0) return null;
  const totalEur = rows.reduce((s, r) => s + r.openEur, 0);
  const nonEur = rows.filter(r => r.currency !== "EUR");
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-sky-50/60 dark:bg-sky-950/20 border-b">
        <ReceiptText className="h-4 w-4 text-sky-600" />
        <span className="text-sm font-medium">Credit notes — not yet matched ({rows.length})</span>
        <span className="ml-auto text-sm">
          Open credit total:{" "}
          <span className="font-mono font-semibold text-sky-700 dark:text-sky-400">−{fmtEur(totalEur)}</span>
          {nonEur.length > 0 && (
            <span className="text-muted-foreground text-xs ml-2">
              (incl. {nonEur.map(r => fmtCur(r.open, r.currency)).join(", ")})
            </span>
          )}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Credit note</TableHead>
            {showCustomer && <TableHead>Company</TableHead>}
            <TableHead>Branch</TableHead>
            <TableHead>Vessel</TableHead>
            <TableHead>Contract</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Matched</TableHead>
            <TableHead className="text-right">Open</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.docDate)}</TableCell>
              <TableCell className="text-sm font-mono">{r.docNumber}</TableCell>
              {showCustomer && <TableCell className="text-sm">{r.customerName}</TableCell>}
              <TableCell>
                {r.branch ? (
                  <Badge variant="outline" className={`text-[11px] ${branchColors[branchShort(r.branch)] ?? ""}`}>
                    {branchShort(r.branch)}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              <TableCell className="text-sm">{r.vesselName ?? <span className="text-muted-foreground">—</span>}</TableCell>
              <TableCell className="text-sm font-mono">
                {r.contractNo ?? <span className="text-muted-foreground font-sans">—</span>}
              </TableCell>
              <TableCell className="text-right font-mono">−{fmtCur(r.amount, r.currency)}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">
                {r.allocated > 0.005 ? fmtCur(r.allocated, r.currency) : "—"}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold text-sky-700 dark:text-sky-400">
                −{fmtCur(r.open, r.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
        Credit notes issued to this customer that are still open in the ERP. They reduce the outstanding balance;
        matching against specific invoices is done manually.
      </p>
    </div>
  );
}

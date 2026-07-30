import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchColors, branchShort, fmtCur, fmtDate, fmtEur } from "@/lib/format";
import { Banknote } from "lucide-react";

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

/**
 * "Payments on account" section of the transactions list: wire transfers whose
 * amount is not fully allocated to invoices. Fully allocated transfers are
 * hidden (they disappear like paid invoices). Credit notes will join this list
 * later once their data is available.
 */
export function UnallocatedTransfersTable({ rows, showCustomer = true }: { rows: OpenTransferRow[]; showCustomer?: boolean }) {
  if (!rows || rows.length === 0) return null;
  const totalUnallocated = rows.reduce((s, r) => s + (r.currency === "EUR" ? r.unallocated : 0), 0);
  const nonEur = rows.filter(r => r.currency !== "EUR");
  return (
    <div className="border-t">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-emerald-50/60 dark:bg-emerald-950/20 border-b">
        <Banknote className="h-4 w-4 text-emerald-600" />
        <span className="text-sm font-medium">Payments on account — not fully allocated ({rows.length})</span>
        <span className="ml-auto text-sm">
          Unallocated total: <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">{fmtEur(totalUnallocated)}</span>
          {nonEur.length > 0 && (
            <span className="text-muted-foreground text-xs ml-2">
              (+{nonEur.map(r => fmtCur(r.unallocated, r.currency)).join(", ")})
            </span>
          )}
        </span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Reference</TableHead>
            {showCustomer && <TableHead>Company</TableHead>}
            <TableHead>Branch</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Allocated</TableHead>
            <TableHead className="text-right">Unallocated</TableHead>
            <TableHead className="text-right"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>
              <TableCell className="whitespace-nowrap text-sm">{fmtDate(r.transferDate)}</TableCell>
              <TableCell className="text-sm font-mono">{r.referenceNumber ?? "—"}</TableCell>
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
              <TableCell>
                <Badge
                  variant="outline"
                  className={
                    r.status === "Received"
                      ? "text-[11px] bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-400"
                      : "text-[11px] bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-400"
                  }
                >
                  {r.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{fmtCur(r.amount, r.currency)}</TableCell>
              <TableCell className="text-right font-mono text-muted-foreground">{fmtCur(r.allocated, r.currency)}</TableCell>
              <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                {fmtCur(r.unallocated, r.currency)}
              </TableCell>
              <TableCell className="text-right">
                <Link href="/wire-transfers" className="text-xs text-primary hover:underline whitespace-nowrap">
                  Allocate →
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="px-4 py-2 text-[11px] text-muted-foreground border-t">
        Wire transfers with an unallocated remainder. Fully allocated payments disappear from this list. Credit notes will be added here when their data is imported.
      </p>
    </div>
  );
}

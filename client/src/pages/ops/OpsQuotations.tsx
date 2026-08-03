import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardList, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Draft: "bg-gray-100 text-gray-700 border-gray-200",
  Sent: "bg-sky-100 text-sky-800 border-sky-200",
  Approved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Rejected: "bg-red-100 text-red-700 border-red-200",
  Expired: "bg-amber-100 text-amber-800 border-amber-200",
};

type SortKey = "quotationNumber" | "customerName" | "sellingPrice" | "status" | "createdAt";

const COL_DEFAULTS: Record<string, number> = {
  quotationNumber: 130,
  customer: 200,
  totalCost: 120,
  sellingPrice: 120,
  margin: 80,
  status: 110,
  validUntil: 120,
  created: 120,
};

export default function OpsQuotations() {
  const { data: quotations, isLoading } = trpc.opsQuotations.list.useQuery();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cols = useResizableColumns("ops-quotations", COL_DEFAULTS);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    if (!quotations) return [];
    let rows = quotations;
    if (statusFilter !== "all") rows = rows.filter(q => q.status === statusFilter);
    const q = search.trim();
    if (q) rows = rows.filter(r => matchesAllTokens(q, [r.quotationNumber, r.customerName, r.customerGroup]));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof typeof a];
      const vb = b[sortKey as keyof typeof b];
      if (typeof va === "string") return String(va).localeCompare(String(vb ?? "")) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [quotations, search, statusFilter, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  if (isLoading) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quotations</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} quotation{filtered.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search quotations..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Sent">Sent</SelectItem>
            <SelectItem value="Approved">Approved</SelectItem>
            <SelectItem value="Rejected">Rejected</SelectItem>
            <SelectItem value="Expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={cols.style("quotationNumber")} className="relative cursor-pointer select-none" onClick={() => toggleSort("quotationNumber")}>
                    <span className="flex items-center">Quotation # <SortIcon col="quotationNumber" /></span>
                    <ColResizer col="quotationNumber" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("customer")} className="relative cursor-pointer select-none" onClick={() => toggleSort("customerName")}>
                    <span className="flex items-center">Customer <SortIcon col="customerName" /></span>
                    <ColResizer col="customer" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("totalCost")} className="relative text-right">
                    <span>Cost</span>
                    <ColResizer col="totalCost" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("sellingPrice")} className="relative cursor-pointer select-none text-right" onClick={() => toggleSort("sellingPrice")}>
                    <span className="flex items-center justify-end">Price <SortIcon col="sellingPrice" /></span>
                    <ColResizer col="sellingPrice" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("margin")} className="relative text-right">
                    <span>Margin</span>
                    <ColResizer col="margin" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("status")} className="relative cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="flex items-center">Status <SortIcon col="status" /></span>
                    <ColResizer col="status" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("validUntil")} className="relative">
                    <span>Valid Until</span>
                    <ColResizer col="validUntil" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("created")} className="relative cursor-pointer select-none" onClick={() => toggleSort("createdAt")}>
                    <span className="flex items-center">Created <SortIcon col="createdAt" /></span>
                    <ColResizer col="created" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No quotations found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(q => (
                    <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{q.quotationNumber}</TableCell>
                      <TableCell>
                        <div className="truncate font-medium">{q.customerGroup}</div>
                        {q.customerName !== q.customerGroup && (
                          <div className="text-xs text-muted-foreground truncate">{q.customerName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtEur(Number(q.totalCost))}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtEur(Number(q.sellingPrice))}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{Number(q.margin).toFixed(1)}%</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[q.status] ?? ""}>{q.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{q.validUntil ? fmtDate(q.validUntil) : "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(new Date(q.createdAt).getTime())}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

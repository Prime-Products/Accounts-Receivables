import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, FileCheck2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";

const statusColors: Record<string, string> = {
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Completed: "bg-sky-100 text-sky-800 border-sky-200",
  Terminated: "bg-red-100 text-red-700 border-red-200",
  Expired: "bg-gray-100 text-gray-600 border-gray-200",
};

type SortKey = "contractNumber" | "customerName" | "totalValue" | "status" | "startDate" | "endDate";

const COL_DEFAULTS: Record<string, number> = {
  contractNumber: 130,
  title: 200,
  customer: 180,
  totalValue: 130,
  collected: 130,
  vessels: 80,
  installments: 110,
  status: 110,
  startDate: 110,
  endDate: 110,
};

export default function OpsContractsList() {
  const { data: contracts, isLoading } = trpc.opsContracts.list.useQuery();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cols = useResizableColumns("ops-contracts", COL_DEFAULTS);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    if (!contracts) return [];
    let rows = contracts;
    if (statusFilter !== "all") rows = rows.filter(c => c.status === statusFilter);
    const q = search.trim();
    if (q) rows = rows.filter(c => matchesAllTokens(q, [c.contractNumber, c.title, c.customerName, c.customerGroup]));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof typeof a];
      const vb = b[sortKey as keyof typeof b];
      if (typeof va === "string") return String(va).localeCompare(String(vb ?? "")) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [contracts, search, statusFilter, sortKey, sortDir]);

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

  const totals = filtered.reduce((acc, c) => ({
    value: acc.value + Number(c.totalValue),
    collected: acc.collected + c.collectedAmount,
  }), { value: 0, collected: 0 });

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operations Contracts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} contract{filtered.length !== 1 ? "s" : ""} · Value: {fmtEur(totals.value)} · Collected: {fmtEur(totals.collected)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contracts..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Terminated">Terminated</SelectItem>
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
                  <TableHead style={cols.style("contractNumber")} className="relative cursor-pointer select-none" onClick={() => toggleSort("contractNumber")}>
                    <span className="flex items-center">Contract # <SortIcon col="contractNumber" /></span>
                    <ColResizer col="contractNumber" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("title")} className="relative">
                    <span>Title</span>
                    <ColResizer col="title" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("customer")} className="relative cursor-pointer select-none" onClick={() => toggleSort("customerName")}>
                    <span className="flex items-center">Customer <SortIcon col="customerName" /></span>
                    <ColResizer col="customer" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("totalValue")} className="relative cursor-pointer select-none text-right" onClick={() => toggleSort("totalValue")}>
                    <span className="flex items-center justify-end">Value <SortIcon col="totalValue" /></span>
                    <ColResizer col="totalValue" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("collected")} className="relative text-right">
                    <span>Collected</span>
                    <ColResizer col="collected" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("vessels")} className="relative text-center">
                    <span>Vessels</span>
                    <ColResizer col="vessels" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("installments")} className="relative text-center">
                    <span>Installments</span>
                    <ColResizer col="installments" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("status")} className="relative cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="flex items-center">Status <SortIcon col="status" /></span>
                    <ColResizer col="status" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("startDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("startDate")}>
                    <span className="flex items-center">Start <SortIcon col="startDate" /></span>
                    <ColResizer col="startDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("endDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("endDate")}>
                    <span className="flex items-center">End <SortIcon col="endDate" /></span>
                    <ColResizer col="endDate" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-12 text-muted-foreground">
                      <FileCheck2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No contracts found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/ops/contracts/${c.id}`)}>
                      <TableCell className="font-mono text-sm">{c.contractNumber}</TableCell>
                      <TableCell className="truncate">{c.title}</TableCell>
                      <TableCell>
                        <div className="truncate font-medium">{c.customerGroup}</div>
                        {c.customerName !== c.customerGroup && (
                          <div className="text-xs text-muted-foreground truncate">{c.customerName}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtEur(Number(c.totalValue))}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtEur(c.collectedAmount)}</TableCell>
                      <TableCell className="text-center">{c.vesselCount}</TableCell>
                      <TableCell className="text-center text-sm">{c.paidInstallments}/{c.totalInstallments}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[c.status] ?? ""}>{c.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(c.startDate)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(c.endDate)}</TableCell>
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

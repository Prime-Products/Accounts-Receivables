import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

type SortKey = "certificateNumber" | "assetName" | "expiryDate" | "issueDate";

const COL_DEFAULTS: Record<string, number> = {
  certificateNumber: 150,
  asset: 180,
  vessel: 150,
  issueDate: 110,
  expiryDate: 110,
  daysLeft: 100,
};

export default function OpsCertificates() {
  const { data: certs, isLoading } = trpc.opsCertificates.list.useQuery({});
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("expiryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const cols = useResizableColumns("ops-certificates", COL_DEFAULTS);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    if (!certs) return [];
    const q = search.trim();
    let rows = q ? certs.filter(c => matchesAllTokens(q, [c.certificateNumber, c.assetName, c.assetSerial, c.vesselName ?? ""])) : certs;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof typeof a];
      const vb = b[sortKey as keyof typeof b];
      if (typeof va === "string") return String(va).localeCompare(String(vb ?? "")) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [certs, search, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const daysUntil = (ts: number) => Math.ceil((ts - Date.now()) / (24 * 60 * 60 * 1000));

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Certificates</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} certificate{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search certificates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={cols.style("certificateNumber")} className="relative cursor-pointer select-none" onClick={() => toggleSort("certificateNumber")}>
                    <span className="flex items-center">Certificate # <SortIcon col="certificateNumber" /></span>
                    <ColResizer col="certificateNumber" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("asset")} className="relative cursor-pointer select-none" onClick={() => toggleSort("assetName")}>
                    <span className="flex items-center">Equipment <SortIcon col="assetName" /></span>
                    <ColResizer col="asset" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("vessel")} className="relative">
                    <span>Vessel</span>
                    <ColResizer col="vessel" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("issueDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("issueDate")}>
                    <span className="flex items-center">Issued <SortIcon col="issueDate" /></span>
                    <ColResizer col="issueDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("expiryDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("expiryDate")}>
                    <span className="flex items-center">Expires <SortIcon col="expiryDate" /></span>
                    <ColResizer col="expiryDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("daysLeft")} className="relative text-center">
                    <span>Days Left</span>
                    <ColResizer col="daysLeft" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No certificates found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(c => {
                    const days = daysUntil(c.expiryDate);
                    const urgency = days <= 0 ? "text-red-700 font-bold" : days <= 30 ? "text-amber-700 font-semibold" : days <= 60 ? "text-amber-600" : "";
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm">{c.certificateNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium truncate">{c.assetName}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.assetSerial}</div>
                        </TableCell>
                        <TableCell className="text-sm">{c.vesselName ?? "—"}</TableCell>
                        <TableCell className="text-sm">{fmtDate(c.issueDate)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(c.expiryDate)}</TableCell>
                        <TableCell className={`text-center text-sm ${urgency}`}>
                          {days <= 0 ? (
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Expired</Badge>
                          ) : (
                            `${days}d`
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

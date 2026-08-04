import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { VesselDetailDialog } from "@/components/VesselDetailDialog";

const statusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Shipped: "bg-sky-100 text-sky-800 border-sky-200",
  Delivered: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
};

type SortKey = "vesselName" | "quantity" | "status" | "orderDate";

const COL_DEFAULTS: Record<string, number> = {
  vessel: 180,
  quantity: 90,
  status: 120,
  orderDate: 120,
  shippedDate: 120,
  deliveredDate: 120,
  notes: 200,
};

export default function OpsOrders() {
  const { data: orders, isLoading } = trpc.opsOrders.list.useQuery({});
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("orderDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cols = useResizableColumns("ops-orders", COL_DEFAULTS);
  const [vesselDialogOpen, setVesselDialogOpen] = useState(false);
  const [vesselDialogId, setVesselDialogId] = useState<number | null>(null);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    if (!orders) return [];
    let rows = orders;
    if (statusFilter !== "all") rows = rows.filter(o => o.status === statusFilter);
    const q = search.trim();
    if (q) rows = rows.filter(o => matchesAllTokens(q, [o.vesselName, o.notes ?? ""]));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof typeof a];
      const vb = b[sortKey as keyof typeof b];
      if (typeof va === "string") return String(va).localeCompare(String(vb ?? "")) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [orders, search, statusFilter, sortKey, sortDir]);

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Consumable Orders</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} order{filtered.length !== 1 ? "s" : ""}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Shipped">Shipped</SelectItem>
            <SelectItem value="Delivered">Delivered</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={cols.style("vessel")} className="relative cursor-pointer select-none" onClick={() => toggleSort("vesselName")}>
                    <span className="flex items-center">Vessel <SortIcon col="vesselName" /></span>
                    <ColResizer col="vessel" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("quantity")} className="relative cursor-pointer select-none text-center" onClick={() => toggleSort("quantity")}>
                    <span className="flex items-center justify-center">Qty <SortIcon col="quantity" /></span>
                    <ColResizer col="quantity" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("status")} className="relative cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="flex items-center">Status <SortIcon col="status" /></span>
                    <ColResizer col="status" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("orderDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("orderDate")}>
                    <span className="flex items-center">Ordered <SortIcon col="orderDate" /></span>
                    <ColResizer col="orderDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("shippedDate")} className="relative">
                    <span>Shipped</span>
                    <ColResizer col="shippedDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("deliveredDate")} className="relative">
                    <span>Delivered</span>
                    <ColResizer col="deliveredDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("notes")} className="relative">
                    <span>Notes</span>
                    <ColResizer col="notes" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <Truck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No orders found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(o => (
                    <TableRow key={o.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        {o.vesselId ? (
                          <button
                            type="button"
                            className="text-primary hover:underline underline-offset-2"
                            onClick={() => {
                              setVesselDialogId(o.vesselId);
                              setVesselDialogOpen(true);
                            }}
                          >
                            {o.vesselName}
                          </button>
                        ) : (
                          o.vesselName
                        )}
                      </TableCell>
                      <TableCell className="text-center font-mono">{o.quantity}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColors[o.status] ?? ""}>{o.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(o.orderDate)}</TableCell>
                      <TableCell className="text-sm">{o.shippedDate ? fmtDate(o.shippedDate) : "—"}</TableCell>
                      <TableCell className="text-sm">{o.deliveredDate ? fmtDate(o.deliveredDate) : "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground truncate">{o.notes ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <VesselDetailDialog
        vesselId={vesselDialogId}
        open={vesselDialogOpen}
        onOpenChange={setVesselDialogOpen}
      />
    </div>
  );
}

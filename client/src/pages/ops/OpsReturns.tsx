import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const COL_DEFAULTS: Record<string, number> = {
  serialNumber: 180,
  name: 180,
  vessel: 160,
  returnPort: 140,
  updated: 120,
  action: 100,
};

export default function OpsReturns() {
  const { data: assets, isLoading } = trpc.opsDashboard.reverseLogistics.useQuery();
  const [search, setSearch] = useState("");
  const cols = useResizableColumns("ops-returns", COL_DEFAULTS);
  const utils = trpc.useUtils();

  const markReturned = trpc.opsAssets.updateStatus.useMutation({
    onSuccess: () => {
      utils.opsDashboard.reverseLogistics.invalidate();
      toast.success("Asset marked as returned");
    },
  });

  const filtered = useMemo(() => {
    if (!assets) return [];
    const q = search.trim();
    if (!q) return assets;
    return assets.filter(a => matchesAllTokens(q, [a.serialNumber, a.name, a.vesselName ?? "", a.targetReturnPort ?? ""]));
  }, [assets, search]);

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
        <h1 className="text-2xl font-bold tracking-tight">Reverse Logistics — Pending Returns</h1>
        <p className="text-sm text-muted-foreground mt-1">{filtered.length} asset{filtered.length !== 1 ? "s" : ""} awaiting collection</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search returns..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={cols.style("serialNumber")} className="relative">
                    <span>Serial #</span>
                    <ColResizer col="serialNumber" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("name")} className="relative">
                    <span>Name</span>
                    <ColResizer col="name" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("vessel")} className="relative">
                    <span>Vessel</span>
                    <ColResizer col="vessel" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("returnPort")} className="relative">
                    <span>Return Port</span>
                    <ColResizer col="returnPort" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("updated")} className="relative">
                    <span>Last Updated</span>
                    <ColResizer col="updated" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("action")} className="relative">
                    <span>Action</span>
                    <ColResizer col="action" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No pending returns</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(a => (
                    <TableRow key={a.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{a.serialNumber}</TableCell>
                      <TableCell className="font-medium truncate">{a.name}</TableCell>
                      <TableCell className="text-sm">{a.vesselName ?? "—"}</TableCell>
                      <TableCell className="text-sm">{a.targetReturnPort ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(new Date(a.updatedAt).getTime())}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => markReturned.mutate({ id: a.id, status: "Returned" })}
                          disabled={markReturned.isPending}
                        >
                          Mark Returned
                        </Button>
                      </TableCell>
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

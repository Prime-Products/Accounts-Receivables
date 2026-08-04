import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, Package, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  "Not Supplied": "bg-gray-100 text-gray-700 border-gray-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Pending Return": "bg-amber-100 text-amber-800 border-amber-200",
  Returned: "bg-sky-100 text-sky-800 border-sky-200",
  "Written Off": "bg-red-100 text-red-700 border-red-200",
};

type SortKey = "serialNumber" | "name" | "vesselName" | "status" | "updatedAt";

const COL_DEFAULTS: Record<string, number> = {
  serialNumber: 180,
  name: 180,
  vessel: 160,
  status: 130,
  returnPort: 130,
  updated: 120,
};

export default function OpsAssets() {
  const { data: assets, isLoading } = trpc.opsAssets.list.useQuery({});
  const { data: contracts } = trpc.opsContracts.list.useQuery();
  const { data: assetCatalog } = trpc.opsCatalog.assets.list.useQuery();
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cols = useResizableColumns("ops-assets", COL_DEFAULTS);

  /* ─── Create Dialog ─── */
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ contractId: "", catalogItemId: "", serialNumber: "", name: "", vesselId: "" });
  const resetForm = () => setForm({ contractId: "", catalogItemId: "", serialNumber: "", name: "", vesselId: "" });

  const create = trpc.opsAssets.create.useMutation({
    onSuccess: () => {
      toast.success("Asset created");
      utils.opsAssets.list.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateStatus = trpc.opsAssets.updateStatus.useMutation({
    onSuccess: () => {
      toast.success("Asset status updated");
      utils.opsAssets.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    if (!assets) return [];
    let rows = assets;
    if (statusFilter !== "all") rows = rows.filter(a => a.status === statusFilter);
    const q = search.trim();
    if (q) rows = rows.filter(a => matchesAllTokens(q, [a.serialNumber, a.name, a.vesselName ?? ""]));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof typeof a];
      const vb = b[sortKey as keyof typeof b];
      if (typeof va === "string") return String(va).localeCompare(String(vb ?? "")) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [assets, search, statusFilter, sortKey, sortDir]);

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
          <h1 className="text-2xl font-bold tracking-tight">Asset Tracking</h1>
          <p className="text-sm text-muted-foreground mt-1">{filtered.length} asset{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Asset
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search assets..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Not Supplied">Not Supplied</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Pending Return">Pending Return</SelectItem>
            <SelectItem value="Returned">Returned</SelectItem>
            <SelectItem value="Written Off">Written Off</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={cols.style("serialNumber")} className="relative cursor-pointer select-none" onClick={() => toggleSort("serialNumber")}>
                    <span className="flex items-center">Serial # <SortIcon col="serialNumber" /></span>
                    <ColResizer col="serialNumber" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("name")} className="relative cursor-pointer select-none" onClick={() => toggleSort("name")}>
                    <span className="flex items-center">Name <SortIcon col="name" /></span>
                    <ColResizer col="name" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("vessel")} className="relative cursor-pointer select-none" onClick={() => toggleSort("vesselName")}>
                    <span className="flex items-center">Vessel <SortIcon col="vesselName" /></span>
                    <ColResizer col="vessel" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("status")} className="relative cursor-pointer select-none" onClick={() => toggleSort("status")}>
                    <span className="flex items-center">Status <SortIcon col="status" /></span>
                    <ColResizer col="status" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("returnPort")} className="relative">
                    <span>Return Port</span>
                    <ColResizer col="returnPort" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("updated")} className="relative cursor-pointer select-none" onClick={() => toggleSort("updatedAt")}>
                    <span className="flex items-center">Updated <SortIcon col="updatedAt" /></span>
                    <ColResizer col="updated" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No assets found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(a => (
                    <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-mono text-sm">{a.serialNumber}</TableCell>
                      <TableCell className="font-medium truncate">{a.name}</TableCell>
                      <TableCell className="text-sm">{a.vesselName ?? "—"}</TableCell>
                      <TableCell>
                        <Select value={a.status} onValueChange={v => updateStatus.mutate({ id: a.id, status: v as any })}>
                          <SelectTrigger className="h-7 w-[130px] text-xs border-0 p-0">
                            <Badge variant="outline" className={statusColors[a.status] ?? ""}>{a.status}</Badge>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Not Supplied">Not Supplied</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="Pending Return">Pending Return</SelectItem>
                            <SelectItem value="Returned">Returned</SelectItem>
                            <SelectItem value="Written Off">Written Off</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm">{a.targetReturnPort ?? "—"}</TableCell>
                      <TableCell className="text-sm">{fmtDate(new Date(a.updatedAt).getTime())}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Create Asset Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <ResizableDialogContent storageKey="ops-asset-create" defaultWidth={480} defaultHeight={420} minWidth={380} minHeight={350}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> New Asset
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Contract *</Label>
              <Select value={form.contractId} onValueChange={v => setForm({ ...form, contractId: v })}>
                <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                <SelectContent>
                  {(contracts ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.contractNumber} - {c.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Catalog Item</Label>
              <Select value={form.catalogItemId} onValueChange={v => {
                const item = assetCatalog?.find(a => a.id === Number(v));
                setForm({ ...form, catalogItemId: v, name: item?.name ?? form.name });
              }}>
                <SelectTrigger><SelectValue placeholder="Select from catalog (optional)" /></SelectTrigger>
                <SelectContent>
                  {(assetCatalog ?? []).filter(a => a.active).map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Serial Number *</Label>
              <Input value={form.serialNumber} onChange={e => setForm({ ...form, serialNumber: e.target.value })} placeholder="SN-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Asset name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.contractId || !form.serialNumber || !form.name || create.isPending}
              onClick={() => create.mutate({
                contractId: Number(form.contractId),
                catalogItemId: form.catalogItemId ? Number(form.catalogItemId) : undefined,
                serialNumber: form.serialNumber,
                name: form.name,
                vesselId: form.vesselId ? Number(form.vesselId) : undefined,
              })}
            >
              {create.isPending ? "Creating..." : "Create Asset"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

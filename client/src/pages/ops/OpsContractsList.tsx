import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, FileCheck2, Plus, Search, Ship } from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  Offer: "bg-blue-100 text-blue-800 border-blue-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Expired: "bg-gray-100 text-gray-600 border-gray-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
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
  const { data: customers } = trpc.customers.options.useQuery();
  const { data: vessels } = trpc.vessels.list.useQuery();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("startDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cols = useResizableColumns("ops-contracts", COL_DEFAULTS);

  /* ─── Create Dialog ─── */
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    customerId: "",
    contractNumber: "",
    title: "",
    pricePerVessel: "",
    startDate: "",
    endDate: "",
    installmentCount: "3",
    notes: "",
  });
  const [selectedVesselIds, setSelectedVesselIds] = useState<number[]>([]);
  const [vesselSearch, setVesselSearch] = useState("");

  const resetForm = () => {
    setForm({ customerId: "", contractNumber: "", title: "", pricePerVessel: "", startDate: "", endDate: "", installmentCount: "3", notes: "" });
    setSelectedVesselIds([]);
    setVesselSearch("");
  };

  const filteredVessels = useMemo(() => {
    if (!vessels) return [];
    const q = vesselSearch.trim().toLowerCase();
    if (!q) return vessels;
    return vessels.filter(v => v.name?.toLowerCase().includes(q) || v.imo?.toLowerCase().includes(q));
  }, [vessels, vesselSearch]);

  const toggleVessel = (id: number) => {
    setSelectedVesselIds(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  const selectAllVessels = () => {
    if (!vessels) return;
    if (selectedVesselIds.length === vessels.length) {
      setSelectedVesselIds([]);
    } else {
      setSelectedVesselIds(vessels.map(v => v.id));
    }
  };

  const create = trpc.opsContracts.create.useMutation({
    onSuccess: () => {
      toast.success("Contract created as an Offer — add its products next");
      utils.opsContracts.list.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

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
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Contract
        </Button>
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
            <SelectItem value="Offer">Offer</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
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

      {/* ─── Create Contract Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <ResizableDialogContent storageKey="ops-contract-create" defaultWidth={640} defaultHeight={680} minWidth={500} minHeight={500}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> New Operations Contract
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Customer *</Label>
                <Select value={form.customerId} onValueChange={v => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {(customers ?? []).map(c => (
                      <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Contract # *</Label>
                <Input value={form.contractNumber} onChange={e => setForm({ ...form, contractNumber: e.target.value })} placeholder="OPS-2026-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Title *</Label>
                <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Service agreement title" />
              </div>
              <div className="space-y-1.5">
                <Label>Price per Vessel (€) *</Label>
                <Input type="number" min="0" step="0.01" value={form.pricePerVessel} onChange={e => setForm({ ...form, pricePerVessel: e.target.value })} placeholder="e.g. 16950" />
              </div>
              <div className="space-y-1.5">
                <Label>Installments</Label>
                <Input type="number" min="1" max="30" value={form.installmentCount} onChange={e => setForm({ ...form, installmentCount: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date *</Label>
                <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date *</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
              </div>
              {form.pricePerVessel && (
                <div className="col-span-2 rounded-md bg-muted/50 p-2.5 text-sm">
                  Contract value:{" "}
                  <span className="font-mono font-semibold">
                    {fmtEur((Number(form.pricePerVessel) || 0) * Math.max(selectedVesselIds.length, 1))}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}({Math.max(selectedVesselIds.length, 1)} vessel(s) x {form.installmentCount || 1} installment(s))
                  </span>
                </div>
              )}

              {/* ─── Vessel Selection (Multi) ─── */}
              <div className="space-y-2 col-span-2 border rounded-lg p-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <Ship className="h-4 w-4" /> Vessels ({selectedVesselIds.length} selected)
                  </Label>
                  <Button type="button" variant="ghost" size="sm" onClick={selectAllVessels}>
                    {selectedVesselIds.length === (vessels?.length ?? 0) ? "Deselect All" : "Select All"}
                  </Button>
                </div>
                <Input
                  placeholder="Search vessels by name or IMO..."
                  value={vesselSearch}
                  onChange={e => setVesselSearch(e.target.value)}
                  className="h-8 text-sm"
                />
                <ScrollArea className="h-[140px] border rounded bg-background">
                  <div className="p-1 space-y-0.5">
                    {filteredVessels.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-4">No vessels found</p>
                    ) : (
                      filteredVessels.map(v => (
                        <label
                          key={v.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={selectedVesselIds.includes(v.id)}
                            onCheckedChange={() => toggleVessel(v.id)}
                          />
                          <span className="font-medium">{v.name}</span>
                          {v.imo && <span className="text-xs text-muted-foreground">IMO: {v.imo}</span>}
                        </label>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.customerId || !form.contractNumber || !form.title || !form.pricePerVessel || !form.startDate || !form.endDate || create.isPending}
              onClick={() => create.mutate({
                customerId: Number(form.customerId),
                contractNumber: form.contractNumber,
                title: form.title,
                pricePerVessel: Number(form.pricePerVessel),
                startDate: new Date(form.startDate).getTime(),
                endDate: new Date(form.endDate).getTime(),
                installmentCount: Number(form.installmentCount) || 3,
                notes: form.notes || undefined,
                vesselIds: selectedVesselIds.length > 0 ? selectedVesselIds : undefined,
              })}
            >
              {create.isPending ? "Creating..." : "Create Contract"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

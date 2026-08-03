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
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardList, Eye, Plus, Search, Trash2, FileCheck } from "lucide-react";
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

interface QuotationItem {
  itemType: "Service" | "Asset" | "Consumable";
  catalogId: number | null;
  name: string;
  quantity: number;
  unitCost: string;
  sellingPrice: string;
  notes: string;
}

const emptyItem = (): QuotationItem => ({
  itemType: "Service",
  catalogId: null,
  name: "",
  quantity: 1,
  unitCost: "0",
  sellingPrice: "0",
  notes: "",
});

export default function OpsQuotations() {
  const { data: quotations, isLoading } = trpc.opsQuotations.list.useQuery();
  const { data: customers } = trpc.customers.options.useQuery();
  const { data: services } = trpc.opsCatalog.services.list.useQuery();
  const { data: assetCatalog } = trpc.opsCatalog.assets.list.useQuery();
  const { data: consumables } = trpc.opsCatalog.consumables.list.useQuery();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const cols = useResizableColumns("ops-quotations", COL_DEFAULTS);

  /* ─── Create Dialog ─── */
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ customerId: "", quotationNumber: "", validUntil: "", notes: "" });
  const [items, setItems] = useState<QuotationItem[]>([emptyItem()]);

  const resetForm = () => {
    setForm({ customerId: "", quotationNumber: "", validUntil: "", notes: "" });
    setItems([emptyItem()]);
  };

  const create = trpc.opsQuotations.create.useMutation({
    onSuccess: () => {
      toast.success("Quotation created");
      utils.opsQuotations.list.invalidate();
      setCreateOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e.message),
  });

  /* ─── Detail Dialog ─── */
  const [detailId, setDetailId] = useState<number | null>(null);
  const { data: detail } = trpc.opsQuotations.get.useQuery({ id: detailId! }, { enabled: detailId !== null });

  /* ─── Convert to Contract Dialog ─── */
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ contractNumber: "", title: "", startDate: "", endDate: "", installmentCount: "12" });
  const convert = trpc.opsQuotations.convertToContract.useMutation({
    onSuccess: () => {
      toast.success("Quotation converted to contract");
      utils.opsQuotations.list.invalidate();
      setConvertOpen(false);
      setDetailId(null);
    },
    onError: (e) => toast.error(e.message),
  });

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

  const updateItem = (idx: number, patch: Partial<QuotationItem>) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const handleCatalogSelect = (idx: number, catalogId: string) => {
    const item = items[idx];
    const id = Number(catalogId);
    let catalog: { name: string; defaultCost?: string; defaultCostPerUnit?: string } | undefined;
    if (item.itemType === "Service") catalog = services?.find(s => s.id === id);
    else if (item.itemType === "Asset") catalog = assetCatalog?.find(a => a.id === id);
    else catalog = consumables?.find(c => c.id === id);
    if (catalog) {
      const cost = catalog.defaultCost ?? catalog.defaultCostPerUnit ?? "0";
      updateItem(idx, { catalogId: id, name: catalog.name, unitCost: cost, sellingPrice: cost });
    }
  };

  const totalCost = items.reduce((s, it) => s + it.quantity * Number(it.unitCost || 0), 0);
  const totalPrice = items.reduce((s, it) => s + it.quantity * Number(it.sellingPrice || 0), 0);
  const margin = totalPrice > 0 ? ((totalPrice - totalCost) / totalPrice) * 100 : 0;

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
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Quotation
        </Button>
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
                    <TableRow key={q.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setDetailId(q.id)}>
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

      {/* ─── Create Quotation Dialog ─── */}
      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <ResizableDialogContent storageKey="ops-quotation-create" defaultWidth={780} defaultHeight={600} minWidth={600} minHeight={500}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> New Quotation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto max-h-[calc(100%-8rem)]">
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Quotation # *</Label>
                <Input value={form.quotationNumber} onChange={e => setForm({ ...form, quotationNumber: e.target.value })} placeholder="QT-2026-001" />
              </div>
              <div className="space-y-1.5">
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
                <Label>Valid Until</Label>
                <Input type="date" value={form.validUntil} onChange={e => setForm({ ...form, validUntil: e.target.value })} />
              </div>
            </div>

            {/* Items Builder */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-sm font-semibold">Line Items</Label>
                <Button size="sm" variant="outline" onClick={() => setItems([...items, emptyItem()])}>
                  <Plus className="h-3 w-3 mr-1" /> Add Item
                </Button>
              </div>
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[100px_1fr_60px_90px_90px_32px] gap-2 items-end border rounded-lg p-2 bg-muted/30">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={item.itemType} onValueChange={v => updateItem(idx, { itemType: v as QuotationItem["itemType"], catalogId: null, name: "" })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Service">Service</SelectItem>
                          <SelectItem value="Asset">Asset</SelectItem>
                          <SelectItem value="Consumable">Consumable</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Item *</Label>
                      <Select value={item.catalogId ? String(item.catalogId) : ""} onValueChange={v => handleCatalogSelect(idx, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select item" /></SelectTrigger>
                        <SelectContent>
                          {(item.itemType === "Service" ? services : item.itemType === "Asset" ? assetCatalog : consumables)?.filter(c => c.active).map(c => (
                            <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min="1" className="h-8 text-xs" value={item.quantity} onChange={e => updateItem(idx, { quantity: Number(e.target.value) || 1 })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit Cost</Label>
                      <Input type="number" className="h-8 text-xs" value={item.unitCost} onChange={e => updateItem(idx, { unitCost: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Sell Price</Label>
                      <Input type="number" className="h-8 text-xs" value={item.sellingPrice} onChange={e => updateItem(idx, { sellingPrice: e.target.value })} />
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => setItems(items.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="flex items-center gap-6 text-sm border-t pt-3">
              <span>Total Cost: <strong>{fmtEur(totalCost)}</strong></span>
              <span>Selling Price: <strong>{fmtEur(totalPrice)}</strong></span>
              <span>Margin: <strong className={margin >= 0 ? "text-emerald-600" : "text-red-600"}>{margin.toFixed(1)}%</strong></span>
            </div>

            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              disabled={!form.customerId || !form.quotationNumber || items.some(it => !it.name) || create.isPending}
              onClick={() => create.mutate({
                quotationNumber: form.quotationNumber,
                customerId: Number(form.customerId),
                validUntil: form.validUntil ? new Date(form.validUntil).getTime() : undefined,
                notes: form.notes || undefined,
                items: items.map(it => ({
                  itemType: it.itemType,
                  catalogId: it.catalogId ?? 0,
                  name: it.name,
                  quantity: it.quantity,
                  unitCost: it.unitCost,
                  sellingPrice: it.sellingPrice,
                  notes: it.notes || undefined,
                })),
              })}
            >
              {create.isPending ? "Creating..." : "Create Quotation"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Quotation Detail Dialog ─── */}
      <Dialog open={detailId !== null} onOpenChange={o => { if (!o) setDetailId(null); }}>
        <ResizableDialogContent storageKey="ops-quotation-detail" defaultWidth={700} defaultHeight={550} minWidth={500} minHeight={400}>
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" /> Quotation {detail.quotation.quotationNumber}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 overflow-y-auto max-h-[calc(100%-8rem)]">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div><span className="text-muted-foreground">Customer:</span> <strong>{detail.customer?.name ?? "—"}</strong></div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline" className={statusColors[detail.quotation.status] ?? ""}>{detail.quotation.status}</Badge></div>
                  <div><span className="text-muted-foreground">Valid Until:</span> {detail.quotation.validUntil ? fmtDate(detail.quotation.validUntil) : "—"}</div>
                </div>

                {/* Items Table */}
                <div className="rounded-lg border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Sell Price</TableHead>
                        <TableHead className="text-right">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.items.map((it: any) => (
                        <TableRow key={it.id}>
                          <TableCell><Badge variant="secondary" className="text-xs">{it.itemType}</Badge></TableCell>
                          <TableCell className="font-medium">{it.name}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right font-mono">{fmtEur(Number(it.unitCost))}</TableCell>
                          <TableCell className="text-right font-mono">{fmtEur(Number(it.sellingPrice))}</TableCell>
                          <TableCell className="text-right font-mono">{fmtEur(Number(it.sellingPrice) * it.quantity)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Totals */}
                <div className="flex items-center gap-6 text-sm border-t pt-3">
                  <span>Total Cost: <strong>{fmtEur(Number(detail.quotation.totalCost))}</strong></span>
                  <span>Selling Price: <strong>{fmtEur(Number(detail.quotation.sellingPrice))}</strong></span>
                  <span>Margin: <strong className={Number(detail.quotation.margin) >= 0 ? "text-emerald-600" : "text-red-600"}>{Number(detail.quotation.margin).toFixed(1)}%</strong></span>
                </div>

                {detail.quotation.notes && (
                  <div className="text-sm"><span className="text-muted-foreground">Notes:</span> {detail.quotation.notes}</div>
                )}
              </div>
              <DialogFooter>
                {detail.quotation.status === "Approved" && (
                  <Button className="gap-2" onClick={() => { setConvertOpen(true); }}>
                    <FileCheck className="h-4 w-4" /> Convert to Contract
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDetailId(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Convert to Contract Dialog ─── */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <ResizableDialogContent storageKey="ops-quotation-convert" defaultWidth={500} defaultHeight={420} minWidth={400} minHeight={350}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileCheck className="h-5 w-5" /> Convert to Contract
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Contract # *</Label>
              <Input value={convertForm.contractNumber} onChange={e => setConvertForm({ ...convertForm, contractNumber: e.target.value })} placeholder="CTR-2026-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input value={convertForm.title} onChange={e => setConvertForm({ ...convertForm, title: e.target.value })} placeholder="Contract title" />
            </div>
            <div className="space-y-1.5">
              <Label>Start Date *</Label>
              <Input type="date" value={convertForm.startDate} onChange={e => setConvertForm({ ...convertForm, startDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>End Date *</Label>
              <Input type="date" value={convertForm.endDate} onChange={e => setConvertForm({ ...convertForm, endDate: e.target.value })} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Installments (per year)</Label>
              <Input type="number" min="1" max="24" value={convertForm.installmentCount} onChange={e => setConvertForm({ ...convertForm, installmentCount: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button
              disabled={!convertForm.contractNumber || !convertForm.title || !convertForm.startDate || !convertForm.endDate || convert.isPending}
              onClick={() => detailId && convert.mutate({
                quotationId: detailId,
                contractNumber: convertForm.contractNumber,
                title: convertForm.title,
                startDate: new Date(convertForm.startDate).getTime(),
                endDate: new Date(convertForm.endDate).getTime(),
                installmentCount: Number(convertForm.installmentCount) || 12,
              })}
            >
              {convert.isPending ? "Converting..." : "Convert"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

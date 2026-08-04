import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertCircle, Edit, Loader2, Package, Plus, Settings2, Trash2, Truck, Wrench } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

// ─── Services Tab ────────────────────────────────────────────────────────────
function ServicesTab() {
  const { data: services, refetch, isLoading, isError } = trpc.opsCatalog.services.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", defaultCost: "", category: "" });

  const create = trpc.opsCatalog.services.create.useMutation({
    onSuccess: () => { refetch(); setCreateOpen(false); resetForm(); toast.success("Service created"); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.opsCatalog.services.update.useMutation({
    onSuccess: () => { refetch(); setEditItem(null); toast.success("Service updated"); },
    onError: e => toast.error(e.message),
  });
  const del = trpc.opsCatalog.services.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Service deleted"); },
    onError: e => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", description: "", defaultCost: "", category: "" });
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, description: item.description ?? "", defaultCost: item.defaultCost ?? "", category: item.category ?? "" });
  };


  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="flex items-center gap-2 justify-center py-12 text-red-600"><AlertCircle className="h-5 w-5" /> Failed to load services</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(services ?? []).length} services</p>
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Service
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Default Cost</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(services ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No services yet</TableCell></TableRow>
            ) : (services ?? []).map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.category || "—"}</TableCell>
                <TableCell className="font-mono">{fmtEur(Number(s.defaultCost))}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { if (confirm("Delete this service?")) del.mutate({ id: s.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Service</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Gas Detection" /></div>
            <div><Label>Default Cost</Label><Input value={form.defaultCost} onChange={e => setForm({ ...form, defaultCost: e.target.value })} placeholder="0.00" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || create.isPending} onClick={() => create.mutate({ name: form.name, description: form.description || undefined, defaultCost: form.defaultCost || undefined, category: form.category || undefined })}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editItem !== null} onOpenChange={o => { if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Service</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>Default Cost</Label><Input value={form.defaultCost} onChange={e => setForm({ ...form, defaultCost: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button disabled={!form.name || update.isPending} onClick={() => editItem && update.mutate({ id: editItem.id, name: form.name, description: form.description || null, defaultCost: form.defaultCost || undefined, category: form.category || null })}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Products Catalog Tab (serial-tracked equipment types) ───────────────────
function AssetsCatalogTab() {
  const { data: items, refetch, isLoading, isError } = trpc.opsCatalog.assets.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", defaultCost: "", category: "" });

  const create = trpc.opsCatalog.assets.create.useMutation({
    onSuccess: () => { refetch(); setCreateOpen(false); resetForm(); toast.success("Product created"); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.opsCatalog.assets.update.useMutation({
    onSuccess: () => { refetch(); setEditItem(null); toast.success("Product updated"); },
    onError: e => toast.error(e.message),
  });
  const del = trpc.opsCatalog.assets.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Product deleted"); },
    onError: e => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", description: "", defaultCost: "", category: "" });
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, description: item.description ?? "", defaultCost: item.defaultCost ?? "", category: item.category ?? "" });
  };

  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="flex items-center gap-2 justify-center py-12 text-red-600"><AlertCircle className="h-5 w-5" /> Failed to load products</div>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(items ?? []).length} products</p>
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Product
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Default Cost</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No products yet</TableCell></TableRow>
            ) : (items ?? []).map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.category || "—"}</TableCell>
                <TableCell className="font-mono">{fmtEur(Number(s.defaultCost))}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { if (confirm("Delete this product?")) del.mutate({ id: s.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Gas Detectors" /></div>
            <div><Label>Default Cost</Label><Input value={form.defaultCost} onChange={e => setForm({ ...form, defaultCost: e.target.value })} placeholder="0.00" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || create.isPending} onClick={() => create.mutate({ name: form.name, description: form.description || undefined, defaultCost: form.defaultCost || undefined, category: form.category || undefined })}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editItem !== null} onOpenChange={o => { if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>Default Cost</Label><Input value={form.defaultCost} onChange={e => setForm({ ...form, defaultCost: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button disabled={!form.name || update.isPending} onClick={() => editItem && update.mutate({ id: editItem.id, name: form.name, description: form.description || null, defaultCost: form.defaultCost || undefined, category: form.category || null })}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Consumables Catalog Tab ─────────────────────────────────────────────────
function ConsumablesCatalogTab() {
  const { data: items, refetch, isLoading, isError } = trpc.opsCatalog.consumables.list.useQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [form, setForm] = useState({ name: "", description: "", unit: "", defaultCostPerUnit: "", category: "" });

  const create = trpc.opsCatalog.consumables.create.useMutation({
    onSuccess: () => { refetch(); setCreateOpen(false); resetForm(); toast.success("Consumable created"); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.opsCatalog.consumables.update.useMutation({
    onSuccess: () => { refetch(); setEditItem(null); toast.success("Consumable updated"); },
    onError: e => toast.error(e.message),
  });
  const del = trpc.opsCatalog.consumables.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Consumable deleted"); },
    onError: e => toast.error(e.message),
  });

  const resetForm = () => setForm({ name: "", description: "", unit: "", defaultCostPerUnit: "", category: "" });
  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({ name: item.name, description: item.description ?? "", unit: item.unit ?? "", defaultCostPerUnit: item.defaultCostPerUnit ?? "", category: item.category ?? "" });
  };
  if (isLoading) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (isError) return <div className="flex items-center gap-2 justify-center py-12 text-red-600"><AlertCircle className="h-5 w-5" /> Failed to load consumables</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{(items ?? []).length} consumable types</p>
        <Button size="sm" onClick={() => { resetForm(); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Consumable
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Unit</TableHead>
              <TableHead>Cost/Unit</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-24">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(items ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No consumables yet</TableCell></TableRow>
            ) : (items ?? []).map(s => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.category || "—"}</TableCell>
                <TableCell>{s.unit}</TableCell>
                <TableCell className="font-mono">{fmtEur(Number(s.defaultCostPerUnit))}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Active" : "Inactive"}</Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(s)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-600" onClick={() => { if (confirm("Delete this consumable?")) del.mutate({ id: s.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={createOpen} onOpenChange={o => { setCreateOpen(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Consumable</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="e.g. Filters" /></div>
            <div><Label>Unit</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="pcs, liters, kg..." /></div>
            <div><Label>Cost per Unit</Label><Input value={form.defaultCostPerUnit} onChange={e => setForm({ ...form, defaultCostPerUnit: e.target.value })} placeholder="0.00" /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button disabled={!form.name || create.isPending} onClick={() => create.mutate({ name: form.name, description: form.description || undefined, unit: form.unit || undefined, defaultCostPerUnit: form.defaultCostPerUnit || undefined, category: form.category || undefined })}>
              {create.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editItem !== null} onOpenChange={o => { if (!o) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Consumable</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Category</Label><Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} /></div>
            <div><Label>Unit</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
            <div><Label>Cost per Unit</Label><Input value={form.defaultCostPerUnit} onChange={e => setForm({ ...form, defaultCostPerUnit: e.target.value })} /></div>
            <div><Label>Description</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditItem(null)}>Cancel</Button>
            <Button disabled={!form.name || update.isPending} onClick={() => editItem && update.mutate({ id: editItem.id, name: form.name, description: form.description || null, unit: form.unit || undefined, defaultCostPerUnit: form.defaultCostPerUnit || undefined, category: form.category || null })}>
              {update.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Catalog Page ───────────────────────────────────────────────────────
export default function OpsCatalog() {
  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Settings2 className="h-6 w-6" /> Catalog Management
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your service offerings, products, and consumable items
        </p>
      </div>

      <Tabs defaultValue="services" className="w-full">
        <TabsList>
          <TabsTrigger value="services" className="gap-1.5"><Wrench className="h-3.5 w-3.5" /> Services</TabsTrigger>
          <TabsTrigger value="assets" className="gap-1.5"><Package className="h-3.5 w-3.5" /> Products</TabsTrigger>
          <TabsTrigger value="consumables" className="gap-1.5"><Truck className="h-3.5 w-3.5" /> Consumables</TabsTrigger>
        </TabsList>
        <TabsContent value="services"><ServicesTab /></TabsContent>
        <TabsContent value="assets"><AssetsCatalogTab /></TabsContent>
        <TabsContent value="consumables"><ConsumablesCatalogTab /></TabsContent>
      </Tabs>
    </div>
  );
}

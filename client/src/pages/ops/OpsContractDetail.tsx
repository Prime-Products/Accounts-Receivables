import { Badge } from "@/components/ui/badge";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Clock, Package, Plus, Ship } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

const paymentStatusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Invoiced: "bg-violet-100 text-violet-800 border-violet-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

const libraryTypeColors: Record<string, string> = {
  Service: "bg-blue-100 text-blue-800 border-blue-200",
  Asset: "bg-purple-100 text-purple-800 border-purple-200",
  Consumable: "bg-orange-100 text-orange-800 border-orange-200",
};

export default function OpsContractDetail() {
  const params = useParams<{ id: string }>();
  const contractId = Number(params.id);
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.opsContracts.get.useQuery({ id: contractId }, { enabled: contractId > 0 });
  const { data: vessels } = trpc.vessels.list.useQuery();
  const { data: services } = trpc.opsCatalog.services.list.useQuery();
  const { data: assetCatalog } = trpc.opsCatalog.assets.list.useQuery();
  const { data: consumables } = trpc.opsCatalog.consumables.list.useQuery();
  const utils = trpc.useUtils();

  const updatePayment = trpc.opsContracts.updatePayment.useMutation({
    onSuccess: () => { utils.opsContracts.get.invalidate({ id: contractId }); toast.success("Payment updated"); },
  });

  /* ─── Assign Vessel Dialog ─── */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ vesselId: "", notes: "" });
  const assignVessel = trpc.opsContracts.assignVessel.useMutation({
    onSuccess: () => {
      toast.success("Vessel assigned");
      utils.opsContracts.get.invalidate({ id: contractId });
      setAssignOpen(false);
      setAssignForm({ vesselId: "", notes: "" });
    },
    onError: (e) => toast.error(e.message),
  });

  /* ─── Add Library Item Dialog ─── */
  const [libOpen, setLibOpen] = useState(false);
  const [libForm, setLibForm] = useState({ itemType: "Service", catalogId: "", name: "", quantity: "1", quotaType: "", quotaLimit: "", notes: "" });
  const resetLibForm = () => setLibForm({ itemType: "Service", catalogId: "", name: "", quantity: "1", quotaType: "", quotaLimit: "", notes: "" });
  const addLibItem = trpc.opsContracts.addLibraryItem.useMutation({
    onSuccess: () => {
      toast.success("Library item added");
      utils.opsContracts.get.invalidate({ id: contractId });
      setLibOpen(false);
      resetLibForm();
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !data) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const { contract, library, schedule, assignments, customer } = data;
  const collected = schedule.filter(p => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(contract.totalValue) - collected;

  return (
    <div className="p-2 sm:p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ops/contracts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{contract.contractNumber} — {contract.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {customer?.name ?? "—"} · {fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[oklch(0.55_0.14_255)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{fmtEur(Number(contract.totalValue))}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.65_0.12_175)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Collected</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{fmtEur(collected)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.55_0.14_25)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{fmtEur(remaining)}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.65_0.12_80)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Vessels Assigned</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{assignments.length}</div></CardContent>
        </Card>
      </div>

      {/* Assigned Vessels */}
      {assignments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Ship className="h-4 w-4" /> Assigned Vessels</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAssignOpen(true)}>
                <Plus className="h-3 w-3" /> Assign Vessel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vessel</TableHead>
                  <TableHead>IMO</TableHead>
                  <TableHead>Assigned Date</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map(a => (
                  <TableRow key={a.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/ops/vessel/${a.vesselId}`)}>
                    <TableCell className="font-medium">{a.vesselName}</TableCell>
                    <TableCell className="font-mono text-sm">{a.vesselImo ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(a.assignedDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.notes ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Contract Library */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Contract Library</CardTitle>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setLibOpen(true)}>
              <Plus className="h-3 w-3" /> Add Item
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-center">Quantity</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {library.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No items in library</TableCell></TableRow>
              ) : (
                library.map(item => (
                  <TableRow key={item.id}>
                    <TableCell><Badge variant="outline" className={libraryTypeColors[item.itemType] ?? ""}>{item.itemType}</Badge></TableCell>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-center">{item.quantity}</TableCell>
                    <TableCell className="text-sm">{item.quotaType ? `${item.quotaLimit} / ${item.quotaType}` : "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.notes ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Payment Schedule */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Payment Schedule</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">#</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Paid Date</TableHead>
                <TableHead className="w-[100px]">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedule.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No payment schedule</TableCell></TableRow>
              ) : (
                schedule.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-sm">{p.installmentNumber}</TableCell>
                    <TableCell className="text-sm">{fmtDate(p.dueDate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtEur(Number(p.amount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={paymentStatusColors[p.status] ?? ""}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm font-mono">{p.invoiceNumber ?? "—"}</TableCell>
                    <TableCell className="text-sm">{p.paidDate ? fmtDate(p.paidDate) : "—"}</TableCell>
                    <TableCell>
                      {p.status === "Pending" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => updatePayment.mutate({ id: p.id, status: "Invoiced" })}
                        >
                          Invoice
                        </Button>
                      )}
                      {p.status === "Invoiced" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => updatePayment.mutate({ id: p.id, status: "Paid", paidDate: Date.now() })}
                        >
                          Mark Paid
                        </Button>
                      )}
                      {p.status === "Paid" && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ─── Assign Vessel Dialog ─── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <ResizableDialogContent storageKey="ops-assign-vessel" defaultWidth={420} defaultHeight={300} minWidth={350} minHeight={250}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ship className="h-5 w-5" /> Assign Vessel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vessel *</Label>
              <Select value={assignForm.vesselId} onValueChange={v => setAssignForm({ ...assignForm, vesselId: v })}>
                <SelectTrigger><SelectValue placeholder="Select vessel" /></SelectTrigger>
                <SelectContent>
                  {(vessels ?? []).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name} {v.imo ? `(${v.imo})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Input value={assignForm.notes} onChange={e => setAssignForm({ ...assignForm, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button
              disabled={!assignForm.vesselId || assignVessel.isPending}
              onClick={() => assignVessel.mutate({ contractId, vesselId: Number(assignForm.vesselId), notes: assignForm.notes || undefined })}
            >
              {assignVessel.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Add Library Item Dialog ─── */}
      <Dialog open={libOpen} onOpenChange={o => { setLibOpen(o); if (!o) resetLibForm(); }}>
        <ResizableDialogContent storageKey="ops-lib-item" defaultWidth={500} defaultHeight={420} minWidth={400} minHeight={350}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="h-5 w-5" /> Add Library Item</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={libForm.itemType} onValueChange={v => setLibForm({ ...libForm, itemType: v, catalogId: "", name: "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Service">Service</SelectItem>
                  <SelectItem value="Asset">Asset</SelectItem>
                  <SelectItem value="Consumable">Consumable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Catalog Item</Label>
              <Select value={libForm.catalogId} onValueChange={v => {
                const catalog = libForm.itemType === "Service" ? services : libForm.itemType === "Asset" ? assetCatalog : consumables;
                const item = catalog?.find((c: any) => c.id === Number(v));
                setLibForm({ ...libForm, catalogId: v, name: item?.name ?? libForm.name });
              }}>
                <SelectTrigger><SelectValue placeholder="Select from catalog" /></SelectTrigger>
                <SelectContent>
                  {(libForm.itemType === "Service" ? services : libForm.itemType === "Asset" ? assetCatalog : consumables)?.filter((c: any) => c.active).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Name *</Label>
              <Input value={libForm.name} onChange={e => setLibForm({ ...libForm, name: e.target.value })} placeholder="Item name" />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity</Label>
              <Input type="number" min="1" value={libForm.quantity} onChange={e => setLibForm({ ...libForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Quota Type</Label>
              <Select value={libForm.quotaType || "none"} onValueChange={v => setLibForm({ ...libForm, quotaType: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Quota</SelectItem>
                  <SelectItem value="Annual">Annual</SelectItem>
                  <SelectItem value="ContractLife">Contract Life</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {libForm.quotaType && (
              <div className="space-y-1.5">
                <Label>Quota Limit</Label>
                <Input type="number" min="1" value={libForm.quotaLimit} onChange={e => setLibForm({ ...libForm, quotaLimit: e.target.value })} />
              </div>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label>Notes</Label>
              <Input value={libForm.notes} onChange={e => setLibForm({ ...libForm, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLibOpen(false)}>Cancel</Button>
            <Button
              disabled={!libForm.name || addLibItem.isPending}
              onClick={() => addLibItem.mutate({
                contractId,
                itemType: libForm.itemType as any,
                catalogId: Number(libForm.catalogId) || 0,
                name: libForm.name,
                quantity: Number(libForm.quantity) || 1 as number,
                quotaType: (libForm.quotaType || undefined) as "Annual" | "ContractLife" | undefined,
                quotaLimit: libForm.quotaLimit ? Number(libForm.quotaLimit) : undefined,
                notes: libForm.notes || undefined,
              })}
            >
              {addLibItem.isPending ? "Adding..." : "Add Item"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

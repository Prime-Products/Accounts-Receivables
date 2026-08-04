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
import { ArrowLeft, CheckCircle2, Clock, Package, Pencil, Plus, Ship, Trash2 } from "lucide-react";
import { Play, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { useState } from "react";

const paymentStatusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Invoiced: "bg-violet-100 text-violet-800 border-violet-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

/** Product natures, in the order they are presented to the user. */
const productTypes = ["Instrument", "Cylinder", "Ampoule", "Service", "Other"] as const;

const productTypeColors: Record<string, string> = {
  Instrument: "bg-purple-100 text-purple-800 border-purple-200",
  Cylinder: "bg-cyan-100 text-cyan-800 border-cyan-200",
  Ampoule: "bg-orange-100 text-orange-800 border-orange-200",
  Service: "bg-blue-100 text-blue-800 border-blue-200",
  Other: "bg-slate-100 text-slate-700 border-slate-200",
};

/** Short hint shown under each nature so the user knows what it triggers. */
const productTypeHint: Record<string, string> = {
  Instrument: "Serial number + certificate tracked per vessel",
  Cylinder: "Returnable, no certificate",
  Ampoule: "Consumed on board, replenished by quota",
  Service: "Work performed under the contract",
  Other: "Anything else supplied",
};

const contractStatusColors: Record<string, string> = {
  Offer: "bg-blue-100 text-blue-800 border-blue-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Expired: "bg-gray-100 text-gray-600 border-gray-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
};

const emptyProduct = { itemType: "Instrument", name: "", quantity: "1", unitCost: "", sellingPrice: "", quotaType: "", quotaLimit: "", notes: "" };

export default function OpsContractDetail() {
  const params = useParams<{ id: string }>();
  const contractId = Number(params.id);
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.opsContracts.get.useQuery({ id: contractId }, { enabled: contractId > 0 });
  const { data: vessels } = trpc.vessels.list.useQuery();
  const utils = trpc.useUtils();

  const updatePayment = trpc.opsContracts.updatePayment.useMutation({
    onSuccess: () => { utils.opsContracts.get.invalidate({ id: contractId }); toast.success("Payment updated"); },
  });

  const updateContract = trpc.opsContracts.update.useMutation({
    onSuccess: () => {
      utils.opsContracts.get.invalidate({ id: contractId });
      utils.opsContracts.list.invalidate();
      toast.success("Contract updated");
    },
    onError: (e) => toast.error(e.message),
  });

  /* ─── Add Vessel Dialog ─── */
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ vesselId: "", notes: "" });
  const [vesselSearch, setVesselSearch] = useState("");
  const assignVessel = trpc.opsContracts.assignVessel.useMutation({
    onSuccess: () => {
      toast.success("Vessel added to contract");
      utils.opsContracts.get.invalidate({ id: contractId });
      setAssignOpen(false);
      setAssignForm({ vesselId: "", notes: "" });
      setVesselSearch("");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeVessel = trpc.opsContracts.removeVessel.useMutation({
    onSuccess: () => { utils.opsContracts.get.invalidate({ id: contractId }); toast.success("Vessel removed"); },
    onError: (e) => toast.error(e.message),
  });

  /* ─── Product Dialog (add / edit) ─── */
  const [libOpen, setLibOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [libForm, setLibForm] = useState({ ...emptyProduct });
  const resetLibForm = () => { setLibForm({ ...emptyProduct }); setEditingId(null); };
  const addLibItem = trpc.opsContracts.addLibraryItem.useMutation({
    onSuccess: () => {
      toast.success("Product added");
      utils.opsContracts.get.invalidate({ id: contractId });
      setLibOpen(false);
      resetLibForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const editLibItem = trpc.opsContracts.updateLibraryItem.useMutation({
    onSuccess: () => {
      toast.success("Product updated");
      utils.opsContracts.get.invalidate({ id: contractId });
      setLibOpen(false);
      resetLibForm();
    },
    onError: (e) => toast.error(e.message),
  });
  const removeLibItem = trpc.opsContracts.removeLibraryItem.useMutation({
    onSuccess: () => { utils.opsContracts.get.invalidate({ id: contractId }); toast.success("Product removed"); },
    onError: (e) => toast.error(e.message),
  });
  const openEditProduct = (item: any) => {
    setEditingId(item.id);
    setLibForm({
      itemType: item.itemType,
      name: item.name,
      quantity: String(item.quantity),
      unitCost: Number(item.unitCost) ? String(Number(item.unitCost)) : "",
      sellingPrice: Number(item.sellingPrice) ? String(Number(item.sellingPrice)) : "",
      quotaType: item.quotaType ?? "",
      quotaLimit: item.quotaLimit != null ? String(item.quotaLimit) : "",
      notes: item.notes ?? "",
    });
    setLibOpen(true);
  };

  /* ─── Financials Dialog ─── */
  const [finOpen, setFinOpen] = useState(false);
  const [finForm, setFinForm] = useState({ pricePerVessel: "", installmentCount: "" });

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

  const { contract, library, schedule, assignments, customer, totals } = data;
  const collected = schedule.filter(p => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(contract.totalValue) - collected;
  const assignedIds = new Set(assignments.map(a => a.vesselId));
  const availableVessels = (vessels ?? []).filter((v: any) => !assignedIds.has(v.id));
  const filteredVessels = vesselSearch.trim()
    ? availableVessels.filter((v: any) => `${v.name} ${v.imo ?? ""}`.toLowerCase().includes(vesselSearch.trim().toLowerCase()))
    : availableVessels;
  const openFinancials = () => {
    setFinForm({
      pricePerVessel: Number(contract.pricePerVessel) ? String(Number(contract.pricePerVessel)) : "",
      installmentCount: String(contract.installmentCount),
    });
    setFinOpen(true);
  };

  return (
    <div className="p-2 sm:p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ops/contracts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{contract.contractNumber} — {contract.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {customer?.name ?? "—"} · {fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}
          </p>
        </div>
        {/* Status Actions */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={contractStatusColors[contract.status] ?? ""}>{contract.status}</Badge>
          {contract.status === "Offer" && (
            <Button
              size="sm"
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => updateContract.mutate({ id: contractId, status: "Active" })}
              disabled={updateContract.isPending}
            >
              <Play className="h-3.5 w-3.5" /> Activate
            </Button>
          )}
          {contract.status === "Active" && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => updateContract.mutate({ id: contractId, status: "Expired" })}
              disabled={updateContract.isPending}
            >
              <Clock className="h-3.5 w-3.5" /> Mark Expired
            </Button>
          )}
          {(contract.status === "Offer" || contract.status === "Active") && (
            <Button
              size="sm"
              variant="destructive"
              className="gap-1.5"
              onClick={() => updateContract.mutate({ id: contractId, status: "Cancelled" })}
              disabled={updateContract.isPending}
            >
              <XCircle className="h-3.5 w-3.5" /> Cancel
            </Button>
          )}
          {(contract.status === "Expired" || contract.status === "Cancelled") && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => updateContract.mutate({ id: contractId, status: "Active" })}
              disabled={updateContract.isPending}
            >
              Reactivate
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-l-4 border-l-[oklch(0.55_0.14_255)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Contract Value</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">{fmtEur(Number(contract.totalValue))}</div>
            <p className="text-xs text-muted-foreground mt-1">{assignments.length || 1} vessel(s) x {fmtEur(Number(contract.pricePerVessel))}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.6_0.13_300)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Per Vessel</CardTitle></CardHeader>
          <CardContent>
            <div className="text-xl font-bold font-mono">{fmtEur(Number(contract.pricePerVessel))}</div>
            <p className="text-xs text-muted-foreground mt-1">{contract.installmentCount} installment(s)</p>
          </CardContent>
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
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Vessels</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{assignments.length}</div></CardContent>
        </Card>
      </div>

      {/* Products — the single agreed list supplied per vessel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Products</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Instruments, cylinders and ampoules supplied to each vessel under this contract</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openFinancials}>
                <Pencil className="h-3 w-3" /> Financials
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { resetLibForm(); setLibOpen(true); }}>
                <Plus className="h-3 w-3" /> Add Product
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-center">Qty / Vessel</TableHead>
                <TableHead className="text-right">Unit Cost</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Line Total</TableHead>
                <TableHead>Quota</TableHead>
                <TableHead className="w-[90px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {library.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No products yet — add the instruments, cylinders and ampoules agreed for each vessel.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {library.map(item => (
                    <TableRow key={item.id}>
                      <TableCell><Badge variant="outline" className={productTypeColors[item.itemType] ?? ""}>{item.itemType}</Badge></TableCell>
                      <TableCell>
                        <div className="font-medium">{item.name}</div>
                        {item.notes && <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>}
                      </TableCell>
                      <TableCell className="text-center font-mono text-sm">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">{fmtEur(Number(item.unitCost))}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{fmtEur(Number(item.sellingPrice))}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">{fmtEur(Number(item.sellingPrice) * item.quantity)}</TableCell>
                      <TableCell className="text-sm">{item.quotaType ? `${item.quotaLimit} / ${item.quotaType === "ContractLife" ? "contract" : "year"}` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditProduct(item)} title="Edit product">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => removeLibItem.mutate({ id: item.id })}
                            title="Remove product"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell colSpan={3} className="text-sm">Per vessel total</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtEur(totals.costPerVessel)}</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono text-sm">{fmtEur(totals.listPricePerVessel)}</TableCell>
                    <TableCell colSpan={2} className="text-sm text-muted-foreground">
                      {totals.listPricePerVessel > 0 ? `${totals.margin.toFixed(1)}% margin` : "—"}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Vessels on the contract */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Ship className="h-4 w-4" /> Vessels</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Adding a vessel generates its instrument records automatically</p>
            </div>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAssignOpen(true)}>
              <Plus className="h-3 w-3" /> Add Vessel
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vessel</TableHead>
                <TableHead>IMO</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No vessels yet — add the fleet covered by this contract.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map(a => (
                  <TableRow key={a.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium cursor-pointer" onClick={() => navigate(`/ops/vessel/${a.vesselId}`)}>{a.vesselName}</TableCell>
                    <TableCell className="font-mono text-sm">{a.vesselImo ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(a.assignedDate)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.notes ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeVessel.mutate({ assignmentId: a.id, contractId })}
                        title="Remove vessel from contract"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
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

      {/* ─── Add Vessel Dialog ─── */}
      <Dialog open={assignOpen} onOpenChange={o => { setAssignOpen(o); if (!o) { setAssignForm({ vesselId: "", notes: "" }); setVesselSearch(""); } }}>
        <ResizableDialogContent storageKey="ops-assign-vessel" defaultWidth={460} defaultHeight={360} minWidth={380} minHeight={300}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Ship className="h-5 w-5" /> Add Vessel to Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vessel *</Label>
              <Input
                value={vesselSearch}
                onChange={e => setVesselSearch(e.target.value)}
                placeholder="Search by name or IMO..."
                className="mb-1.5"
              />
              <Select value={assignForm.vesselId} onValueChange={v => setAssignForm({ ...assignForm, vesselId: v })}>
                <SelectTrigger><SelectValue placeholder={filteredVessels.length === 0 ? "No vessels match" : "Select vessel"} /></SelectTrigger>
                <SelectContent>
                  {filteredVessels.slice(0, 100).map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name} {v.imo ? `(${v.imo})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {filteredVessels.length} available · {assignments.length} already on this contract
              </p>
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
              {assignVessel.isPending ? "Adding..." : "Add Vessel"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Financials Dialog ─── */}
      <Dialog open={finOpen} onOpenChange={setFinOpen}>
        <ResizableDialogContent storageKey="ops-contract-financials" defaultWidth={460} defaultHeight={340} minWidth={380} minHeight={300}>
          <DialogHeader>
            <DialogTitle>Contract Financials</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Price per Vessel (EUR) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={finForm.pricePerVessel}
                onChange={e => setFinForm({ ...finForm, pricePerVessel: e.target.value })}
                placeholder="e.g. 16950"
              />
              <p className="text-xs text-muted-foreground">
                Products list at {fmtEur(totals.listPricePerVessel)} per vessel
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Installments *</Label>
              <Input
                type="number"
                min="1"
                max="30"
                value={finForm.installmentCount}
                onChange={e => setFinForm({ ...finForm, installmentCount: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Yearly installments from the start date. Schedule is rebuilt only while nothing is invoiced or paid.
              </p>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5 text-sm">
              Contract value: <span className="font-mono font-semibold">
                {fmtEur((Number(finForm.pricePerVessel) || 0) * Math.max(assignments.length, 1))}
              </span>
              <span className="text-muted-foreground"> ({assignments.length || 1} vessel(s))</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFinOpen(false)}>Cancel</Button>
            <Button
              disabled={!finForm.pricePerVessel || !finForm.installmentCount || updateContract.isPending}
              onClick={() => {
                updateContract.mutate({
                  id: contractId,
                  pricePerVessel: Number(finForm.pricePerVessel),
                  installmentCount: Number(finForm.installmentCount),
                });
                setFinOpen(false);
              }}
            >
              {updateContract.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>

      {/* ─── Product Dialog (add / edit) ─── */}
      <Dialog open={libOpen} onOpenChange={o => { setLibOpen(o); if (!o) resetLibForm(); }}>
        <ResizableDialogContent storageKey="ops-lib-item" defaultWidth={540} defaultHeight={520} minWidth={420} minHeight={400}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> {editingId ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label>Type *</Label>
              <Select value={libForm.itemType} onValueChange={v => setLibForm({ ...libForm, itemType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {productTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{productTypeHint[libForm.itemType]}</p>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Product Name *</Label>
              <Input value={libForm.name} onChange={e => setLibForm({ ...libForm, name: e.target.value })} placeholder="e.g. RIKEN KEIKI GX-3R" />
            </div>
            <div className="space-y-1.5">
              <Label>Quantity per Vessel</Label>
              <Input type="number" min="1" value={libForm.quantity} onChange={e => setLibForm({ ...libForm, quantity: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Cost (EUR)</Label>
              <Input type="number" min="0" step="0.01" value={libForm.unitCost} onChange={e => setLibForm({ ...libForm, unitCost: e.target.value })} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Unit Price (EUR)</Label>
              <Input type="number" min="0" step="0.01" value={libForm.sellingPrice} onChange={e => setLibForm({ ...libForm, sellingPrice: e.target.value })} placeholder="0.00" />
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
              <div className="space-y-1.5 col-span-2">
                <Label>Quota Limit</Label>
                <Input type="number" min="1" value={libForm.quotaLimit} onChange={e => setLibForm({ ...libForm, quotaLimit: e.target.value })} />
                <p className="text-xs text-muted-foreground">Maximum quantity the vessel may order in the quota period</p>
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
              disabled={!libForm.name || addLibItem.isPending || editLibItem.isPending}
              onClick={() => {
                const payload = {
                  itemType: libForm.itemType as any,
                  name: libForm.name,
                  quantity: Number(libForm.quantity) || 1,
                  unitCost: Number(libForm.unitCost) || 0,
                  sellingPrice: Number(libForm.sellingPrice) || 0,
                  quotaType: (libForm.quotaType || undefined) as "Annual" | "ContractLife" | undefined,
                  quotaLimit: libForm.quotaLimit ? Number(libForm.quotaLimit) : undefined,
                  notes: libForm.notes || undefined,
                };
                if (editingId) editLibItem.mutate({ id: editingId, ...payload });
                else addLibItem.mutate({ contractId, ...payload });
              }}
            >
              {addLibItem.isPending || editLibItem.isPending ? "Saving..." : editingId ? "Save Changes" : "Add Product"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

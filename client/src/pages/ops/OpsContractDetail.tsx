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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { groupContractProducts, productGroupBadgeColors } from "@shared/productGrouping";
import { SupplyBadge } from "@/components/SupplyBadge";
import { ContractExpiryIndicator } from "@/components/ContractExpiryIndicator";
import { ProductPicker } from "@/components/ProductPicker";
import { ArrowLeft, CalendarRange, CheckCircle2, ChevronDown, ChevronRight, Clock, Package, Pencil, Plus, Ship, Trash2, Wallet } from "lucide-react";
import { Play, XCircle } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { Fragment, useState } from "react";

const paymentStatusColors: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Invoiced: "bg-violet-100 text-violet-800 border-violet-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

/** Item natures, in the order they are presented to the user. */
const productTypes = ["Equipment", "Consumable", "Other"] as const;

/** One palette for product natures, shared with the vessel card. */
const productTypeColors = productGroupBadgeColors;

/** Short hint shown under each nature so the user knows what it triggers. */
const productTypeHint: Record<string, string> = {
  Equipment: "Serial number + certificate tracked per vessel",
  Consumable: "Consumed on board, replenished by quota",
  Other: "Anything else supplied under the contract",
};

const contractStatusColors: Record<string, string> = {
  Offer: "bg-blue-100 text-blue-800 border-blue-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Expired: "bg-gray-100 text-gray-600 border-gray-200",
  Cancelled: "bg-red-100 text-red-700 border-red-200",
};

const emptyProduct = { itemType: "Equipment", pricelistKey: "", catalogId: null as number | null, name: "", quantity: "1", unitCost: "", sellingPrice: "", quotaType: "", quotaLimit: "", notes: "" };

/** Prime 247 is sold as a 3, 4 or 5-year commitment. */
const CONTRACT_PERIODS = [3, 4, 5] as const;

/** Human wording for the agreed length of the contract. */
function periodLabel(years: number): string {
  return `${years} year${years === 1 ? "" : "s"}`;
}

/** Human wording for the credit terms shown next to the contract period. */
function termsLabel(days: number): string {
  if (days <= 0) return "Due on receipt";
  return `${days} days from invoice date`;
}

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

  /* ─── Delete the whole contract ─── */
  const [deleteOpen, setDeleteOpen] = useState(false);
  const { data: impact, isLoading: impactLoading } = trpc.opsContracts.deleteImpact.useQuery(
    { id: contractId },
    { enabled: deleteOpen && contractId > 0 },
  );
  const removeContract = trpc.opsContracts.remove.useMutation({
    onSuccess: (res) => {
      setDeleteOpen(false);
      toast.success(`Deleted contract ${res.contractNumber}`, {
        description: `${res.vessels} vessel assignment(s) · ${res.products} product line(s) · ${res.equipment} equipment unit(s) removed.`,
      });
      utils.opsContracts.invalidate();
      utils.vessels.invalidate();
      utils.opsAssets.invalidate();
      navigate("/ops/contracts");
    },
    onError: (e) => toast.error(e.message || "Could not delete the contract"),
  });

  /* ─── Add Vessel Dialog ─── */
  const [assignOpen, setAssignOpen] = useState(false);
  /* ─── Supply tab: narrow to open lines, expand one line at a time ─── */
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [expandedLine, setExpandedLine] = useState<number | null>(null);
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
  const generateEquipment = trpc.opsContracts.generateEquipment.useMutation({
    onSuccess: (r) => {
      utils.opsContracts.get.invalidate({ id: contractId });
      toast.success(
        r.created > 0
          ? `${r.created} equipment record(s) created across ${r.vessels} vessel(s)`
          : "Equipment already up to date for this contract",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  /**
   * Recording a shipment date activates that vessel: its own installments are generated
   * from that date. Clearing it removes them again, so the edit is reversible.
   */
  const setShipment = trpc.opsContracts.setVesselShipment.useMutation({
    onSuccess: (_r, vars) => {
      utils.opsContracts.get.invalidate({ id: contractId });
      toast.success(vars.shipmentDate ? "Shipment recorded — installments generated" : "Shipment cleared");
      setShipEditId(null);
    },
    onError: (e) => toast.error(e.message),
  });
  /** Which vessel row currently has its shipment date open for editing. */
  const [shipEditId, setShipEditId] = useState<number | null>(null);
  const [shipDraft, setShipDraft] = useState("");

  /* ─── Product Dialog (add / edit) ─── */
  const [libOpen, setLibOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [libForm, setLibForm] = useState({ ...emptyProduct });
  const resetLibForm = () => { setLibForm({ ...emptyProduct }); setEditingId(null); };
  /** Pricelist entries feed the picker; prices flow into the form but stay editable. */
  const { data: pricelist } = trpc.opsCatalog.pricelist.useQuery();
  /** Picking an entry fills name, cost, price and a sensible nature — all overridable. */
  const applyPricelistEntry = (key: string) => {
    const entry = (pricelist ?? []).find(p => p.key === key);
    if (!entry) return;
    setLibForm(f => ({
      ...f,
      pricelistKey: entry.key,
      catalogId: entry.catalogId,
      name: entry.name,
      unitCost: Number(entry.unitCost) ? String(Number(entry.unitCost)) : "",
      sellingPrice: Number(entry.sellingPrice) ? String(Number(entry.sellingPrice)) : "",
      itemType: f.itemType === emptyProduct.itemType ? entry.suggestedItemType : f.itemType,
    }));
  };
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
      pricelistKey: "",
      catalogId: item.catalogId ?? null,
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
  // The open tab is reflected in the URL (?tab=financials) so a tab can be linked to
  // and survives a reload.
  const [activeTab, setActiveTab] = useState(
    () => new URLSearchParams(window.location.search).get("tab") ?? "products",
  );
  const [finForm, setFinForm] = useState({
    pricePerVessel: "",
    installmentCount: "",
    contractPeriodYears: "3",
    paymentTermsDays: "30",
    paymentNotes: "",
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

  const { contract, library, schedule, assignments, customer, totals, supplyLines, supplySummary } = data;
  const collected = schedule.filter(p => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0);
  const remaining = Number(contract.totalValue) - collected;
  /**
   * Installments belong to a vessel, so the schedule is presented as one block per vessel
   * in the order the vessels joined the contract. Rows with no vesselId are legacy
   * fleet-wide installments and are shown last under their own heading.
   */
  const scheduleGroups = (() => {
    const groups: Array<{
      key: string;
      label: string;
      shipmentDate: number | null;
      rows: typeof schedule;
      total: number;
      paid: number;
    }> = [];
    const push = (key: string, label: string, shipmentDate: number | null, rows: typeof schedule) => {
      if (rows.length === 0) return;
      groups.push({
        key,
        label,
        shipmentDate,
        rows: [...rows].sort((a, b) => a.installmentNumber - b.installmentNumber),
        total: rows.reduce((s, p) => s + Number(p.amount), 0),
        paid: rows.filter(p => p.status === "Paid").reduce((s, p) => s + Number(p.amount), 0),
      });
    };
    for (const a of assignments) {
      push(`v-${a.vesselId}`, a.vesselName, (a as any).shipmentDate ?? null,
        schedule.filter(p => p.vesselId === a.vesselId));
    }
    push("legacy", "Contract-wide (before per-vessel billing)", null, schedule.filter(p => p.vesselId == null));
    return groups;
  })();
  /** Vessels that cannot be billed yet — no shipment date means no schedule. */
  const unscheduledVessels = assignments.filter(a =>
    !(a as any).shipmentDate && !schedule.some(p => p.vesselId === a.vesselId));
  const assignedIds = new Set(assignments.map(a => a.vesselId));
  const availableVessels = (vessels ?? []).filter((v: any) => !assignedIds.has(v.id));
  const filteredVessels = vesselSearch.trim()
    ? availableVessels.filter((v: any) => `${v.name} ${v.imo ?? ""}`.toLowerCase().includes(vesselSearch.trim().toLowerCase()))
    : availableVessels;
  const openFinancials = () => {
    setFinForm({
      pricePerVessel: Number(contract.pricePerVessel) ? String(Number(contract.pricePerVessel)) : "",
      installmentCount: String(contract.installmentCount),
      contractPeriodYears: String((contract as any).contractPeriodYears ?? 3),
      paymentTermsDays: String((contract as any).paymentTermsDays ?? 30),
      paymentNotes: (contract as any).paymentNotes ?? "",
    });
    setFinOpen(true);
  };
  /** Products grouped by nature: instruments, then cylinders, then ampoules, then the rest. */
  const productGroups = groupContractProducts(library);
  /**
   * Supply view: the same nature grouping as the product list, but read as a delivery
   * checklist. Lines with nothing outstanding are kept — the user wants to see both what
   * has been supplied and what has not — while the toggle narrows it to the open ones.
   */
  const supplyGroups = groupContractProducts(supplyLines);
  const outstandingGroups = groupContractProducts(supplyLines.filter(l => l.outstanding > 0));

  return (
    <div className="p-2 sm:p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ops/contracts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{contract.contractNumber} — {contract.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span>{customer?.name ?? "—"} · {fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}</span>
            {/* The end date carries its own colour, so an expiring contract is visible on arrival. */}
            <ContractExpiryIndicator endDate={contract.endDate} />
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
          {/* Deleting is separate from cancelling: cancel keeps the record, delete removes it. */}
          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground hover:text-red-600"
            onClick={() => setDeleteOpen(true)}
            title="Delete this contract"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
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

      {/* Tabs: the contract is read in three passes — what is supplied, what it costs, where it goes */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Products ({library.length})</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="vessels">Vessels ({assignments.length})</TabsTrigger>
          <TabsTrigger value="supply">
            Supply{supplySummary.unitsOutstanding > 0 ? ` (${supplySummary.unitsOutstanding} left)` : ""}
          </TabsTrigger>
        </TabsList>

        {/* ── Products: one agreed list per vessel, grouped by nature ── */}
        <TabsContent value="products" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Products</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">Grouped by nature — equipment first, then consumables and anything else supplied per vessel</p>
            </div>
            <div className="flex items-center gap-2">
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
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No products yet — add the instruments, cylinders and ampoules agreed for each vessel.
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {productGroups.map(group => (
                    <Fragment key={group.group}>
                      {/* Group heading — keeps the natures visually separated inside one list */}
                      <TableRow className="bg-muted/60 hover:bg-muted/60">
                        <TableCell colSpan={7} className="py-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={productTypeColors[group.group] ?? ""}>{group.label}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {group.items.length} line{group.items.length !== 1 ? "s" : ""} ·{" "}
                              {fmtEur(group.items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0))} per vessel
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                      {group.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="pl-6">
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
                    </Fragment>
                  ))}
                  <TableRow className="bg-muted/40 font-medium">
                    <TableCell colSpan={2} className="text-sm">Per vessel total</TableCell>
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
        </TabsContent>

        {/* ── Financials: commercials, payment method and the schedule in one place ── */}
        <TabsContent value="financials" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" /> Commercial Terms</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">Agreed price, contract length, installments and credit terms</p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={openFinancials}>
                  <Pencil className="h-3 w-3" /> Edit
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
                <div>
                  <div className="text-xs text-muted-foreground">Price per Vessel</div>
                  <div className="font-mono font-semibold mt-0.5">{fmtEur(Number(contract.pricePerVessel))}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Contract Value</div>
                  <div className="font-mono font-semibold mt-0.5">{fmtEur(Number(contract.totalValue))}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{assignments.length || 1} vessel(s)</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Installments</div>
                  <div className="font-mono font-semibold mt-0.5">{contract.installmentCount}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {fmtEur(Number(contract.pricePerVessel) / Math.max(contract.installmentCount, 1))} per vessel each
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Contract Period</div>
                  <div className="font-medium mt-0.5 flex items-center gap-1.5">
                    <CalendarRange className="h-3.5 w-3.5 text-muted-foreground" />
                    {periodLabel(Number((contract as any).contractPeriodYears ?? 3))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {fmtDate(contract.startDate)} → {fmtDate(contract.endDate)}
                  </div>
                  <div className="mt-1.5">
                    <ContractExpiryIndicator endDate={contract.endDate} />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Payment Terms</div>
                  <div className="font-medium mt-0.5">{termsLabel(Number((contract as any).paymentTermsDays ?? 30))}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Product Margin</div>
                  <div className="font-mono font-semibold mt-0.5">
                    {totals.listPricePerVessel > 0 ? `${totals.margin.toFixed(1)}%` : "—"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Cost {fmtEur(totals.costPerVessel)} vs list {fmtEur(totals.listPricePerVessel)}
                  </div>
                </div>
              </div>
              {(contract as any).paymentNotes && (
                <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
                  <div className="text-xs text-muted-foreground mb-1">Payment Notes</div>
                  {(contract as any).paymentNotes}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Payment schedule lives with the commercials it is derived from */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Payment Schedule</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Each vessel is billed on its own schedule, starting from its shipment date.
                {" "}
                {collected > 0
                  ? `${fmtEur(collected)} collected · ${fmtEur(remaining)} remaining`
                  : `${fmtEur(remaining)} outstanding across ${schedule.length} installment(s)`}
              </p>
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
                  {scheduleGroups.length === 0 && unscheduledVessels.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No installments yet — record a shipment date on the Vessels tab to start a vessel's schedule.
                    </TableCell></TableRow>
                  ) : (
                    <>
                      {scheduleGroups.map(group => (
                        <Fragment key={group.key}>
                          {/* One header band per vessel keeps the fleet's schedules visually separate */}
                          <TableRow className="bg-muted/50 hover:bg-muted/50">
                            <TableCell colSpan={2} className="py-2 text-xs font-semibold uppercase tracking-wide">
                              {group.label}
                              {group.shipmentDate && (
                                <span className="ml-2 font-normal normal-case text-muted-foreground">
                                  shipped {fmtDate(group.shipmentDate)}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="py-2 text-right font-mono text-xs font-semibold">{fmtEur(group.total)}</TableCell>
                            <TableCell colSpan={4} className="py-2 text-xs text-muted-foreground">
                              {group.rows.length} installment(s)
                              {group.paid > 0 && ` · ${fmtEur(group.paid)} paid`}
                            </TableCell>
                          </TableRow>
                          {group.rows.map(p => (
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
                          ))}
                        </Fragment>
                      ))}
                      {/* Vessels on the contract that are not billable yet, so the gap is explicit */}
                      {unscheduledVessels.map(a => (
                        <TableRow key={`pending-${a.id}`} className="hover:bg-transparent">
                          <TableCell colSpan={7} className="py-3 text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{a.vesselName}</span> — not shipped yet, so no installments.
                            {" "}Record its shipment date on the Vessels tab to generate them.
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Vessels: the fleet covered, kept away from the product list ── */}
        <TabsContent value="vessels" className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Ship className="h-4 w-4" /> Vessels</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Adding a vessel generates its instrument records automatically. Recording a shipment date
                activates that vessel and creates its own installments.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                disabled={assignments.length === 0 || generateEquipment.isPending}
                onClick={() => generateEquipment.mutate({ contractId })}
                title="Create any missing serial-tracked equipment rows for the whole fleet"
              >
                <Package className="h-3 w-3" /> {generateEquipment.isPending ? "Generating..." : "Generate Equipment"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAssignOpen(true)}>
                <Plus className="h-3 w-3" /> Add Vessel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vessel</TableHead>
                <TableHead>IMO</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Shipped / Activated</TableHead>
                <TableHead>Supply</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="w-[100px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No vessels yet — add the fleet covered by this contract.
                  </TableCell>
                </TableRow>
              ) : (
                assignments.map(a => (
                  <TableRow key={a.id} className="hover:bg-muted/50">
                    <TableCell className="font-medium cursor-pointer" onClick={() => navigate(`/ops/vessel/${a.vesselId}`)}>{a.vesselName}</TableCell>
                    <TableCell className="font-mono text-sm">{a.vesselImo ?? "—"}</TableCell>
                    <TableCell className="text-sm">{fmtDate(a.assignedDate)}</TableCell>
                    {/* Shipment date is the billing trigger, so it is editable right here */}
                    <TableCell className="text-sm">
                      {shipEditId === a.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            type="date"
                            value={shipDraft}
                            autoFocus
                            onChange={e => setShipDraft(e.target.value)}
                            className="h-7 w-[140px] text-xs"
                          />
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={!shipDraft || setShipment.isPending}
                            onClick={() => setShipment.mutate({
                              assignmentId: a.id,
                              shipmentDate: Date.parse(`${shipDraft}T00:00:00Z`),
                            })}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShipEditId(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (a as any).shipmentDate ? (
                        <div className="flex items-center gap-1.5">
                          <span>{fmtDate((a as any).shipmentDate)}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-1.5 text-xs text-muted-foreground"
                            onClick={() => {
                              setShipEditId(a.id);
                              setShipDraft(new Date((a as any).shipmentDate).toISOString().slice(0, 10));
                            }}
                          >
                            Edit
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            setShipEditId(a.id);
                            setShipDraft(new Date().toISOString().slice(0, 10));
                          }}
                          title="Recording the shipment date generates this vessel's installments"
                        >
                          <Clock className="h-3 w-3" /> Record shipment
                        </Button>
                      )}
                    </TableCell>
                    {/* Supply progress: how much of this vessel's equipment has actually gone out */}
                    <TableCell className="text-sm whitespace-nowrap">
                      {(a as any).equipmentTotal > 0 ? (
                        <span
                          className={
                            (a as any).equipmentSupplied === (a as any).equipmentTotal
                              ? "font-medium text-emerald-600"
                              : (a as any).equipmentSupplied > 0
                                ? "font-medium text-amber-600"
                                : "text-muted-foreground"
                          }
                          title="Equipment units supplied out of the units this vessel is entitled to"
                        >
                          {(a as any).equipmentSupplied}/{(a as any).equipmentTotal} supplied
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{a.notes ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={generateEquipment.isPending}
                        onClick={() => generateEquipment.mutate({ contractId, vesselId: a.vesselId })}
                        title="Generate missing equipment records for this vessel"
                      >
                        <Package className="h-3.5 w-3.5" />
                      </Button>
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

        </TabsContent>

        {/* ── Supply: the delivery checklist — what the fleet is owed and what is still open ── */}
        <TabsContent value="supply" className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Units supplied</div>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  {supplySummary.unitsSupplied}
                  <span className="text-sm text-muted-foreground font-normal"> / {supplySummary.unitsExpected}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Still to deliver</div>
                <div className={`text-xl font-bold font-mono ${supplySummary.unitsOutstanding > 0 ? "text-amber-600" : "text-emerald-700"}`}>
                  {supplySummary.unitsOutstanding}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">unit(s) across the fleet</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Open lines</div>
                <div className="text-xl font-bold font-mono">{supplySummary.linesOutstanding}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">of {supplyLines.length} product line(s)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">Vessels awaiting delivery</div>
                <div className="text-xl font-bold font-mono">{supplySummary.vesselsOutstanding}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">of {assignments.length} on contract</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Supply status per product</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Fleet entitlement is the agreed quantity across {assignments.length || 1} vessel(s). Expand a line to see which vessel is still waiting.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setOnlyOutstanding(v => !v)}
                >
                  {onlyOutstanding ? "Show all lines" : "Show only outstanding"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-center">Qty / Vessel</TableHead>
                    <TableHead className="text-center">Fleet total</TableHead>
                    <TableHead className="text-center">Supplied</TableHead>
                    <TableHead className="text-center">Still to deliver</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(onlyOutstanding ? outstandingGroups : supplyGroups).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        {onlyOutstanding
                          ? "Nothing outstanding — every line has been supplied to every vessel."
                          : "No products yet — add the contract's product list first."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (onlyOutstanding ? outstandingGroups : supplyGroups).map(group => (
                      <Fragment key={group.group}>
                        <TableRow className="bg-muted/60 hover:bg-muted/60">
                          <TableCell colSpan={6} className="py-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={productTypeColors[group.group] ?? ""}>{group.label}</Badge>
                              <span className="text-xs text-muted-foreground">
                                {group.items.reduce((s, l) => s + l.outstanding, 0)} unit(s) still to deliver
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {group.items.map(line => (
                          <Fragment key={line.id}>
                            <TableRow
                              className="cursor-pointer hover:bg-muted/40"
                              onClick={() => setExpandedLine(expandedLine === line.id ? null : line.id)}
                            >
                              <TableCell className="pl-6">
                                <div className="font-medium flex items-center gap-1.5">
                                  {expandedLine === line.id
                                    ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                    : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                  {line.name}
                                </div>
                              </TableCell>
                              <TableCell className="text-center font-mono text-sm">{line.quantityPerVessel}</TableCell>
                              <TableCell className="text-center font-mono text-sm">{line.expected}</TableCell>
                              <TableCell className="text-center font-mono text-sm text-emerald-700">{line.supplied}</TableCell>
                              <TableCell className={`text-center font-mono text-sm ${line.outstanding > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                                {line.outstanding}
                              </TableCell>
                              <TableCell>
                                <SupplyBadge supplied={line.supplied} total={line.expected} />
                              </TableCell>
                            </TableRow>
                            {expandedLine === line.id && (
                              <TableRow className="hover:bg-transparent">
                                <TableCell colSpan={6} className="bg-muted/20 py-2">
                                  <div className="pl-10 space-y-1">
                                    {line.byVessel.length === 0 ? (
                                      <div className="text-xs text-muted-foreground">No vessels on this contract yet.</div>
                                    ) : (
                                      line.byVessel.map(v => (
                                        <div key={v.vesselId} className="flex items-center gap-3 text-xs">
                                          <span
                                            className="w-52 truncate text-primary hover:underline underline-offset-2 cursor-pointer"
                                            onClick={e => { e.stopPropagation(); navigate(`/vessels/${v.vesselId}`); }}
                                          >
                                            {v.vesselName}
                                          </span>
                                          <span className="font-mono text-muted-foreground w-20">{v.supplied}/{v.expected}</span>
                                          <SupplyBadge supplied={v.supplied} total={v.expected} showCount={false} />
                                          {v.outstanding > 0 && (
                                            <span className="text-amber-600">{v.outstanding} to deliver</span>
                                          )}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
        <ResizableDialogContent storageKey="ops-contract-financials" defaultWidth={520} defaultHeight={620} minWidth={420} minHeight={420}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Commercial Terms</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Contract Period</Label>
                <Select value={finForm.contractPeriodYears} onValueChange={v => setFinForm({ ...finForm, contractPeriodYears: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CONTRACT_PERIODS.map(y => <SelectItem key={y} value={String(y)}>{periodLabel(y)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Sets the end date to {periodLabel(Number(finForm.contractPeriodYears) || 3)} after the start date.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  min="0"
                  max="365"
                  value={finForm.paymentTermsDays}
                  onChange={e => setFinForm({ ...finForm, paymentTermsDays: e.target.value })}
                  placeholder="30"
                />
                <p className="text-xs text-muted-foreground">{termsLabel(Number(finForm.paymentTermsDays) || 0)}</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Notes</Label>
              <Textarea
                rows={2}
                value={finForm.paymentNotes}
                onChange={e => setFinForm({ ...finForm, paymentNotes: e.target.value })}
                placeholder="Currency clause, discount, escalation..."
              />
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
                  contractPeriodYears: Number(finForm.contractPeriodYears) || 3,
                  paymentTermsDays: Number(finForm.paymentTermsDays) || 0,
                  paymentNotes: finForm.paymentNotes || null,
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
        <ResizableDialogContent storageKey="ops-lib-item-v2" defaultWidth={860} defaultHeight={680} minWidth={560} minHeight={460}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> {editingId ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {/* The product itself is chosen from the pricelist, so names and prices stay uniform. */}
            <div className="space-y-1.5 col-span-2">
              <Label>Product *</Label>
              <ProductPicker
                value={libForm.name}
                onSelectEntry={applyPricelistEntry}
                onFreeText={name => setLibForm(f => ({ ...f, name, pricelistKey: "", catalogId: null }))}
              />
              <p className="text-xs text-muted-foreground">
                Picking an item fills the nature, cost and price below — all still editable.
                {(pricelist ?? []).length === 0 && " Pricelist is empty: add items under Prime 247 > Pricelist."}
              </p>
            </div>
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
            {/* The chosen name stays editable, e.g. to add a spec to a catalogue item. */}
            <div className="space-y-1.5 col-span-2">
              <Label>Name on the contract *</Label>
              <Input value={libForm.name} onChange={e => setLibForm({ ...libForm, name: e.target.value })} placeholder="Select a product above, or type a one-off name" />
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
                  catalogId: libForm.catalogId,
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

      {/* Deleting a contract takes its vessels, products and equipment with it, so the
          dialog states the exact counts before the user commits. */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <ResizableDialogContent storageKey="ops-contract-delete" defaultWidth={520} defaultHeight={440}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              Delete contract {contract.contractNumber}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            {impactLoading || !impact ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <p className="text-muted-foreground">
                  This permanently deletes the contract and everything recorded against it.
                  To keep the record instead, use Cancel.
                </p>
                <div className="rounded-md border bg-muted/40 p-3">
                  <p className="font-medium mb-2">Will be removed</p>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>{impact.vessels} vessel assignment{impact.vessels !== 1 ? "s" : ""}</li>
                    <li>{impact.products} product line{impact.products !== 1 ? "s" : ""}</li>
                    <li>{impact.equipment} equipment unit{impact.equipment !== 1 ? "s" : ""} and {impact.certificates} certificate{impact.certificates !== 1 ? "s" : ""}</li>
                    <li>{impact.installments} installment{impact.installments !== 1 ? "s" : ""} and {impact.orders} consumable order{impact.orders !== 1 ? "s" : ""}</li>
                  </ul>
                </div>
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                  <p className="font-medium text-emerald-900 mb-1">Will be kept</p>
                  <p className="text-xs text-emerald-800">
                    The customer, the vessels themselves and the product pricelist stay as they are —
                    only their link to this contract goes.
                  </p>
                </div>
                <p className="text-xs text-red-600">This cannot be undone.</p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={removeContract.isPending}
              onClick={() => removeContract.mutate({ id: contractId })}
            >
              {removeContract.isPending ? "Deleting..." : "Delete contract"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

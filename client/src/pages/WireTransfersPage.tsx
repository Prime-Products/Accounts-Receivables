import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, ChevronRight, ChevronDown, CornerDownRight } from "lucide-react";
import { X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { fmtDate, fmtCur } from "@/lib/format";
import { toast } from "sonner";
import { AllocateWireTransferDialog } from "@/components/AllocateWireTransferDialog";

type Company = { id: number; name: string };
const CURRENCIES = ["EUR", "USD", "AED", "SGD", "GBP", "NOK", "JPY"];

/** Cancel a single allocation from the transfer side: reverts the invoice, frees the amount, deletes the derived internal transfer. */
function CancelAllocationButton({
  allocationId,
  invoiceLabel,
  amountLabel,
}: {
  allocationId: number;
  invoiceLabel: string;
  amountLabel: string;
}) {
  const utils = trpc.useUtils();
  const removeMutation = trpc.customers.removeWireTransferAllocation.useMutation({
    onSuccess: () => {
      toast.success(`Payment of ${amountLabel} for ${invoiceLabel} cancelled`);
      utils.customers.getAllWireTransfers.invalidate();
      utils.customers.listWireTransferAllocations.invalidate();
      utils.customers.listGroupOpenInvoices.invalidate();
      utils.invoices.invalidate();
      utils.customers.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors shrink-0"
          title={`Cancel payment ${amountLabel} for ${invoiceLabel}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel this payment?</AlertDialogTitle>
          <AlertDialogDescription>
            The allocation of <span className="font-mono font-semibold">{amountLabel}</span> to invoice{" "}
            <span className="font-mono font-semibold">{invoiceLabel}</span> will be removed. The invoice
            reverts to its previous status, the amount becomes available on the wire transfer again, and any
            derived internal transfer is deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep payment</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 text-white"
            onClick={() => removeMutation.mutate({ allocationId })}
            disabled={removeMutation.isPending}
          >
            {removeMutation.isPending ? "Cancelling…" : "Cancel payment"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Searchable customer combobox for large customer lists. */
function CustomerCombobox({
  companies,
  value,
  onChange,
  placeholder = "Select customer...",
  allowAll = false,
}: {
  companies: Company[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  allowAll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel =
    value === "all"
      ? "All customers"
      : companies.find(c => String(c.id) === value)?.name || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Type to search..." />
          <CommandList>
            <CommandEmpty>No customer found.</CommandEmpty>
            <CommandGroup>
              {allowAll && (
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    onChange("all");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === "all" ? "opacity-100" : "opacity-0")} />
                  All customers
                </CommandItem>
              )}
              {companies.map(c => (
                <CommandItem
                  key={c.id}
                  value={c.name}
                  onSelect={() => {
                    onChange(String(c.id));
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value === String(c.id) ? "opacity-100" : "opacity-0")}
                  />
                  <span className="truncate">{c.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function WireTransfersPage() {
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Received">("All");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "customer" | "internal">("all");
  const [allocationFilter, setAllocationFilter] = useState<"all" | "unallocated" | "partial" | "full">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  // Single fast query — transfers come with customerName precomputed on server
  const { data: allTransfers = [], isLoading } = trpc.customers.getAllWireTransfers.useQuery();
  // Lightweight companies list (id + name) for dropdowns
  const { data: companies = [] } = trpc.customers.listCompanies.useQuery();
  // Branch names (from invoice branches)
  const { data: branches = [] } = trpc.customers.listBranches.useQuery();

  // Filter transfers
  const filteredTransfers = useMemo(() => {
    return (allTransfers as any[]).filter((t: any) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (customerFilter !== "all" && t.customerId !== Number(customerFilter)) return false;
      if (branchFilter !== "all" && t.branch !== branchFilter) return false;
      if (typeFilter === "customer" && t.isInternal) return false;
      if (typeFilter === "internal" && !t.isInternal) return false;
      if (allocationFilter !== "all") {
        // Allocation state only meaningful for received customer transfers
        if (t.isInternal) return false;
        const alloc = Number(t.allocatedAmount ?? 0);
        const unalloc = Number(t.unallocatedAmount ?? 0);
        if (allocationFilter === "unallocated" && !(alloc <= 0.005 && unalloc > 0.005)) return false;
        if (allocationFilter === "partial" && !(alloc > 0.005 && unalloc > 0.005)) return false;
        if (allocationFilter === "full" && !(unalloc <= 0.005 && alloc > 0.005)) return false;
      }
      if (dateFrom && new Date(Number(t.transferDate)) < new Date(dateFrom)) return false;
      if (dateTo && new Date(Number(t.transferDate)) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [allTransfers, statusFilter, customerFilter, branchFilter, typeFilter, allocationFilter, dateFrom, dateTo]);

  // Calculate totals
  const totals = useMemo(() => {
    const pending = filteredTransfers
      .filter((t: any) => t.status === "Pending" && !t.isInternal)
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const received = filteredTransfers
      .filter((t: any) => t.status === "Received" && !t.isInternal)
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const notFullyAllocated = filteredTransfers.filter(
      (t: any) => t.status === "Received" && !t.isInternal && Number(t.unallocatedAmount ?? 0) > 0.005
    );
    const unallocated = notFullyAllocated.reduce((sum: number, t: any) => sum + Number(t.unallocatedAmount ?? 0), 0);
    return { pending, received, unallocated, unallocatedCount: notFullyAllocated.length };
  }, [filteredTransfers]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Wire Transfers</h1>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>New Wire Transfer</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Wire Transfer</DialogTitle>
            </DialogHeader>
            <CreateWireTransferForm
              onSuccess={() => setIsCreateOpen(false)}
              companies={companies as Company[]}
              branches={branches as string[]}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCur(totals.pending, "EUR")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredTransfers.filter((t: any) => t.status === "Pending").length} transfers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Received</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCur(totals.received, "EUR")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredTransfers.filter((t: any) => t.status === "Received").length} transfers
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{fmtCur(totals.pending + totals.received, "EUR")}</div>
            <p className="text-xs text-muted-foreground mt-1">{filteredTransfers.length} transfers</p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            "cursor-pointer transition-colors",
            allocationFilter === "unallocated" ? "border-amber-500 bg-amber-50/50" : "hover:border-amber-300"
          )}
          onClick={() => setAllocationFilter(allocationFilter === "unallocated" ? "all" : "unallocated")}
          title="Click to show only transfers with unallocated amounts"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-amber-700">Unallocated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-700">{fmtCur(totals.unallocated, "EUR")}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {totals.unallocatedCount} transfer(s) not fully allocated
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger id="status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Received">Received</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type-filter">Type</Label>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <SelectTrigger id="type-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="customer">Customer transfers</SelectItem>
                  <SelectItem value="internal">Internal (inter-office)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="allocation-filter">Allocation</Label>
              <Select value={allocationFilter} onValueChange={(v) => setAllocationFilter(v as any)}>
                <SelectTrigger id="allocation-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="unallocated">Not allocated</SelectItem>
                  <SelectItem value="partial">Partially allocated</SelectItem>
                  <SelectItem value="full">Fully allocated</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Customer</Label>
              <CustomerCombobox
                companies={companies as Company[]}
                value={customerFilter}
                onChange={setCustomerFilter}
                allowAll
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="branch-filter">Branch</Label>
              <Select value={branchFilter} onValueChange={setBranchFilter}>
                <SelectTrigger id="branch-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All branches</SelectItem>
                  {(branches as string[]).map(b => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date-from">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date-to">To</Label>
              <Input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Wire Transfers Table */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filteredTransfers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No wire transfers found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow>
                    <TableCell className="w-8"></TableCell>
                    <TableCell className="w-[23%]">Customer</TableCell>
                    <TableCell className="w-[13%]">Branch</TableCell>
                    <TableCell className="w-[9%]">Amount</TableCell>
                    <TableCell className="w-[8%]">Allocated</TableCell>
                    <TableCell className="w-[10%]">Date</TableCell>
                    <TableCell className="w-[8%]">Status</TableCell>
                    <TableCell className="w-[10%]">Ref / Notes</TableCell>
                    <TableCell className="w-[15%]">Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((t: any) => {
                    const hasAllocs = Array.isArray(t.allocations) && t.allocations.length > 0;
                    const isOpen = !!expanded[t.id];
                    return (
                      <Fragment key={t.id}>
                        <TableRow
                          className={hasAllocs ? "cursor-pointer" : undefined}
                          onClick={hasAllocs ? () => setExpanded(e => ({ ...e, [t.id]: !e[t.id] })) : undefined}
                        >
                          <TableCell className="w-8 px-2">
                            {hasAllocs ? (
                              isOpen ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )
                            ) : null}
                          </TableCell>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {t.isInternal && (
                                <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                                  Internal
                                </span>
                              )}
                              <span className="truncate" title={t.isInternal ? `${t.fromBranch ?? "Our office"} → ${t.toBranch ?? "-"}` : t.customerName}>
                                {t.isInternal ? `${t.fromBranch ?? "Our office"} → ${t.toBranch ?? "-"}` : t.customerName}
                              </span>
                            </div>
                            {t.isInternal && (
                              <div className="text-xs text-muted-foreground mt-0.5">
                                for invoice {(t as any).settledInvoiceNumber ?? "—"}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm truncate" title={t.branch || undefined}>{t.branch || "-"}</TableCell>
                          <TableCell>{fmtCur(Number(t.amount), t.currency)}</TableCell>
                          <TableCell className="text-sm font-mono">
                            {Number(t.allocatedAmount) > 0 ? (
                              <>
                                <span className={Number(t.unallocatedAmount) <= 0.005 ? "text-green-700" : "text-amber-700"}>
                                  {fmtCur(Number(t.allocatedAmount), t.currency)}
                                </span>
                                {Number(t.unallocatedAmount) > 0.005 && (
                                  <div className="text-[11px] text-amber-600">
                                    {fmtCur(Number(t.unallocatedAmount), t.currency)} left
                                  </div>
                                )}
                              </>
                            ) : !t.isInternal && t.status === "Received" ? (
                              <span className="text-amber-600 text-xs font-medium">not allocated</span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">{fmtDate(Number(t.transferDate))}</TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                t.status === "Received"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {t.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-sm max-w-[140px] truncate" title={[t.referenceNumber, t.notes].filter(Boolean).join(" · ") || undefined}>
                            {t.referenceNumber || t.notes || "-"}
                          </TableCell>
                          <TableCell onClick={e => e.stopPropagation()} className="whitespace-nowrap">
                            {t.isInternal ? (
                              <span className="text-xs text-muted-foreground">auto</span>
                            ) : (
                              <div className="flex gap-1">
                                <UpdateWireTransferDialog transfer={t} branches={branches as string[]} />
                                {t.status === "Received" && <AllocateWireTransferDialog transfer={t} />}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                        {hasAllocs && isOpen && (
                          <TableRow className="bg-muted/40 hover:bg-muted/40">
                            <TableCell></TableCell>
                            <TableCell colSpan={8} className="py-2">
                              <div className="space-y-1">
                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                                  Allocation breakdown — where this transfer went
                                </div>
                                {t.allocations.map((a: any) => (
                                  <div key={a.id} className="flex items-center gap-2 text-sm">
                                    <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    {t.branch && (
                                      <>
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                                          {t.branch}
                                        </span>
                                        <span className="text-muted-foreground text-xs">wired</span>
                                      </>
                                    )}
                                    <span className="font-mono font-semibold">{fmtCur(Number(a.amount), a.currency ?? t.currency)}</span>
                                    <span className="text-muted-foreground">→</span>
                                    {a.branch ? (
                                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                                        {a.branch}
                                      </span>
                                    ) : null}
                                    <span className="text-muted-foreground text-xs">settled invoice</span>
                                    <span className="font-mono">{a.invoiceNumber ?? `#${a.invoiceId}`}</span>
                                    <span className="text-muted-foreground text-xs">of</span>
                                    <span className="font-medium">{a.creditedCompanyName}</span>
                                    <CancelAllocationButton
                                      allocationId={a.id}
                                      invoiceLabel={a.invoiceNumber ?? `#${a.invoiceId}`}
                                      amountLabel={fmtCur(Number(a.amount), a.currency ?? t.currency)}
                                    />
                                  </div>
                                ))}
                                {Number(t.unallocatedAmount) > 0.005 && (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
                                    <span className="font-mono">{fmtCur(Number(t.unallocatedAmount), t.currency)}</span>
                                    <span>not yet allocated</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateWireTransferForm({
  onSuccess,
  companies,
  branches,
}: {
  onSuccess: () => void;
  companies: Company[];
  branches: string[];
}) {
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [branch, setBranch] = useState("none");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"Pending" | "Received">("Pending");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const createMutation = trpc.customers.createWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer created");
      utils.customers.getAllWireTransfers.invalidate();
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = () => {
    if (!customerId || !amount) {
      toast.error("Customer and Amount are required");
      return;
    }

    createMutation.mutate({
      customerId: Number(customerId),
      amount: Number(amount),
      currency,
      branch: branch !== "none" ? branch : null,
      transferDate: new Date(transferDate).getTime(),
      status,
      referenceNumber: referenceNumber || null,
      notes: notes || null,
      receivedDate: status === "Received" ? new Date().getTime() : null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Customer *</Label>
        <CustomerCombobox
          companies={companies}
          value={customerId}
          onChange={setCustomerId}
          placeholder="Type to search customer..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount *</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="branch">Branch (received at)</Label>
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger id="branch">
            <SelectValue placeholder="Select branch..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">—</SelectItem>
            {branches.map(b => (
              <SelectItem key={b} value={b}>
                {b}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="transfer-date">Transfer Date</Label>
          <Input
            id="transfer-date"
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Received">Received</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="reference">Reference Number</Label>
        <Input
          id="reference"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Bank reference or transaction ID"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Input
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes"
        />
      </div>

      <Button onClick={handleSubmit} disabled={createMutation.isPending} className="w-full">
        {createMutation.isPending ? "Creating..." : "Create Wire Transfer"}
      </Button>
    </div>
  );
}

function UpdateWireTransferDialog({
  transfer,
  branches,
}: {
  transfer: {
    id: number;
    customerId: number;
    status: "Pending" | "Received";
    amount: string | number;
    currency: string;
    branch?: string | null;
  };
  branches: string[];
}) {
  const [newStatus, setNewStatus] = useState(transfer.status);
  const [newBranch, setNewBranch] = useState(transfer.branch || "none");
  const [isOpen, setIsOpen] = useState(false);

  const utils = trpc.useUtils();
  const updateMutation = trpc.customers.updateWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer updated");
      utils.customers.getAllWireTransfers.invalidate();
      setIsOpen(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const deleteMutation = trpc.customers.deleteWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer deleted");
      utils.customers.getAllWireTransfers.invalidate();
      setIsOpen(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleUpdate = () => {
    updateMutation.mutate({
      id: transfer.id,
      customerId: transfer.customerId,
      status: newStatus,
      branch: newBranch !== "none" ? newBranch : null,
      receivedDate: newStatus === "Received" ? new Date().getTime() : null,
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
          Update
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Update Wire Transfer</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Amount: {fmtCur(Number(transfer.amount), transfer.currency)}</Label>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="update-status">Status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as any)}>
              <SelectTrigger id="update-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Received">Received</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="update-branch">Branch (received at)</Label>
            <Select value={newBranch} onValueChange={setNewBranch}>
              <SelectTrigger id="update-branch">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="flex-1">
              {updateMutation.isPending ? "Updating..." : "Update"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate({ id: transfer.id, customerId: transfer.customerId })}
              disabled={deleteMutation.isPending}
            >
              Delete
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

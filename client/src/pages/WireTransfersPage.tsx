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
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { fmtDate, fmtCur } from "@/lib/format";
import { toast } from "sonner";
import { AllocateWireTransferDialog } from "@/components/AllocateWireTransferDialog";

type Company = { id: number; name: string };

const CURRENCIES = ["EUR", "USD", "AED", "SGD", "GBP", "NOK", "JPY"];

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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

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
      if (dateFrom && new Date(Number(t.transferDate)) < new Date(dateFrom)) return false;
      if (dateTo && new Date(Number(t.transferDate)) > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [allTransfers, statusFilter, customerFilter, branchFilter, dateFrom, dateTo]);

  // Calculate totals
  const totals = useMemo(() => {
    const pending = filteredTransfers
      .filter((t: any) => t.status === "Pending")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const received = filteredTransfers
      .filter((t: any) => t.status === "Received")
      .reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    return { pending, received };
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell>Customer</TableCell>
                    <TableCell>Branch</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Allocated</TableCell>
                    <TableCell>Transfer Date</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Reference</TableCell>
                    <TableCell>Notes</TableCell>
                    <TableCell>Actions</TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTransfers.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.customerName}</TableCell>
                      <TableCell className="text-sm">{t.branch || "-"}</TableCell>
                      <TableCell>{fmtCur(Number(t.amount), t.currency)}</TableCell>
                      <TableCell className="text-sm font-mono">
                        {Number(t.allocatedAmount) > 0 ? (
                          <span className={Number(t.unallocatedAmount) <= 0.005 ? "text-green-700" : "text-amber-700"}>
                            {fmtCur(Number(t.allocatedAmount), t.currency)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{fmtDate(Number(t.transferDate))}</TableCell>
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
                      <TableCell className="text-sm">{t.referenceNumber || "-"}</TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">{t.notes || "-"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <UpdateWireTransferDialog transfer={t} branches={branches as string[]} />
                          {t.status === "Received" && <AllocateWireTransferDialog transfer={t} />}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
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
        <Button variant="outline" size="sm">
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

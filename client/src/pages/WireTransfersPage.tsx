import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { fmtDate, fmtCur } from "@/lib/format";
import { toast } from "sonner";

export default function WireTransfersPage() {
  const [statusFilter, setStatusFilter] = useState<"All" | "Pending" | "Received">("All");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // Fetch all wire transfers
  const { data: allTransfers = [], isLoading } = trpc.customers.getAllWireTransfers.useQuery();
  
  // Fetch all customers for dropdown
  const { data: searchResults = { companies: [] } } = trpc.customers.search.useQuery({ query: "" });
  const customers = searchResults.companies || [];

  // Filter transfers
  const filteredTransfers = useMemo(() => {
    return allTransfers.filter((t: any) => {
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (customerFilter && customerFilter !== "all" && t.customerId !== Number(customerFilter)) return false;
      if (dateFrom && new Date(Number(t.transferDate)) < new Date(dateFrom)) return false;
      if (dateTo && new Date(Number(t.transferDate)) > new Date(dateTo)) return false;
      return true;
    });
  }, [allTransfers, statusFilter, customerFilter, dateFrom, dateTo]);

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

  const getCustomerName = (customerId: number) => {
    return customers.find((c: any) => c.id === customerId)?.name || `Customer #${customerId}`;
  };

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
            <CreateWireTransferForm onSuccess={() => setIsCreateOpen(false)} customers={customers} />
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
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

            <div>
              <Label htmlFor="customer-filter">Customer</Label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger id="customer-filter">
                  <SelectValue placeholder="All customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All customers</SelectItem>
                  {(customers as any[]).map((c: any) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="date-from">From</Label>
              <Input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>

            <div>
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
            <div className="text-center py-8">Loading...</div>
          ) : filteredTransfers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No wire transfers found</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableCell>Customer</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Currency</TableCell>
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
                      <TableCell className="font-medium">{getCustomerName(t.customerId)}</TableCell>
                      <TableCell>{fmtCur(Number(t.amount), t.currency)}</TableCell>
                      <TableCell>{t.currency}</TableCell>
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
                      <TableCell className="text-sm">{t.notes || "-"}</TableCell>
                      <TableCell>
                        <UpdateWireTransferDialog transfer={t} />
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
  customers,
}: {
  onSuccess: () => void;
  customers: Array<{ id: number; name: string }>;
}) {
  const [customerId, setCustomerId] = useState("0");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState<"Pending" | "Received">("Pending");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = trpc.customers.createWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer created");
      onSuccess();
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const handleSubmit = () => {
    if (!customerId || customerId === "0" || !amount) {
      toast.error("Customer and Amount are required");
      return;
    }

    createMutation.mutate({
      customerId: Number(customerId),
      amount: Number(amount),
      currency,
      transferDate: new Date(transferDate).getTime(),
      status,
      referenceNumber: referenceNumber || null,
      notes: notes || null,
      receivedDate: status === "Received" ? new Date().getTime() : null,
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="customer">Customer *</Label>
        <Select value={customerId} onValueChange={setCustomerId}>
          <SelectTrigger id="customer">
            <SelectValue placeholder="Select customer" />
          </SelectTrigger>
          <SelectContent>
            {(customers as any[]).length > 0 ? (
              customers.map((c: any) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))
            ) : (
              <div className="p-2 text-sm text-muted-foreground">No customers available</div>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
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

        <div>
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            placeholder="EUR"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="transfer-date">Transfer Date</Label>
          <Input
            id="transfer-date"
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
          />
        </div>

        <div>
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

      <div>
        <Label htmlFor="reference">Reference Number</Label>
        <Input
          id="reference"
          value={referenceNumber}
          onChange={(e) => setReferenceNumber(e.target.value)}
          placeholder="Bank reference or transaction ID"
        />
      </div>

      <div>
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
}: {
  transfer: {
    id: number;
    customerId: number;
    status: "Pending" | "Received";
    amount: string | number;
    currency: string;
  };
}) {
  const [newStatus, setNewStatus] = useState(transfer.status);
  const [isOpen, setIsOpen] = useState(false);

  const updateMutation = trpc.customers.updateWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer updated");
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
          <div>
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
          <Button onClick={handleUpdate} disabled={updateMutation.isPending} className="w-full">
            {updateMutation.isPending ? "Updating..." : "Update"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

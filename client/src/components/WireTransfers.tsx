import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fmtCur, fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface WireTransfersProps {
  customerId: number;
}

const CURRENCIES = ["EUR", "USD", "AED", "SGD", "GBP", "NOK", "JPY"];

export function WireTransfers({ customerId }: WireTransfersProps) {
  const utils = trpc.useUtils();
  const { data: transfers = [], isLoading } = trpc.customers.listWireTransfers.useQuery({ customerId });
  const { data: branches = [] } = trpc.customers.listBranches.useQuery();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    currency: "EUR",
    branch: "none",
    transferDate: new Date().toISOString().split("T")[0],
    status: "Pending",
    referenceNumber: "",
    notes: "",
  });

  const createMutation = trpc.customers.createWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer recorded");
      utils.customers.listWireTransfers.invalidate({ customerId });
      setOpen(false);
      setForm({
        amount: "",
        currency: "EUR",
        branch: "none",
        transferDate: new Date().toISOString().split("T")[0],
        status: "Pending",
        referenceNumber: "",
        notes: "",
      });
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMutation = trpc.customers.updateWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer updated");
      utils.customers.listWireTransfers.invalidate({ customerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMutation = trpc.customers.deleteWireTransfer.useMutation({
    onSuccess: () => {
      toast.success("Wire transfer deleted");
      utils.customers.listWireTransfers.invalidate({ customerId });
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCreate = () => {
    if (!form.amount) {
      toast.error("Amount is required");
      return;
    }

    const transferDate = new Date(form.transferDate).getTime();
    createMutation.mutate({
      customerId,
      amount: Number(form.amount),
      currency: form.currency,
      branch: form.branch !== "none" ? form.branch : null,
      transferDate,
      status: form.status as "Pending" | "Received",
      referenceNumber: form.referenceNumber || null,
      notes: form.notes || null,
      receivedDate: form.status === "Received" ? new Date().getTime() : null,
    });
  };

  const handleStatusChange = (id: number, newStatus: "Pending" | "Received") => {
    updateMutation.mutate({
      id,
      customerId,
      status: newStatus,
      receivedDate: newStatus === "Received" ? new Date().getTime() : null,
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this wire transfer?")) {
      deleteMutation.mutate({ id, customerId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Wire Transfers</h3>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Transfer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Wire Transfer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Branch (received at)</Label>
                <Select value={form.branch} onValueChange={(v) => setForm({ ...form, branch: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {(branches as string[]).map((b) => (
                      <SelectItem key={b} value={b}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Transfer Date</Label>
                  <Input
                    type="date"
                    value={form.transferDate}
                    onChange={(e) => setForm({ ...form, transferDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
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
                <Label>Reference Number (optional)</Label>
                <Input
                  placeholder="Bank reference or transaction ID"
                  value={form.referenceNumber}
                  onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })}
                />
              </div>

              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="Additional notes..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      ) : transfers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">No wire transfers recorded yet</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-20">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{fmtDate(Number(t.transferDate))}</TableCell>
                    <TableCell className="text-sm">{(t as any).branch || "-"}</TableCell>
                    <TableCell>{fmtCur(t.amount, t.currency)}</TableCell>
                    <TableCell>
                      <Select
                        value={t.status}
                        onValueChange={(v) => handleStatusChange(t.id, v as "Pending" | "Received")}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Received">Received</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">{t.referenceNumber || "-"}</TableCell>
                    <TableCell className="text-sm truncate max-w-xs">{t.notes || "-"}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(t.id)}
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

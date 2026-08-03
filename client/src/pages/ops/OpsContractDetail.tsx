import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate, fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckCircle2, Clock, Package, Ship } from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";

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
  const utils = trpc.useUtils();

  const updatePayment = trpc.opsContracts.updatePayment.useMutation({
    onSuccess: () => { utils.opsContracts.get.invalidate({ id: contractId }); toast.success("Payment updated"); },
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
            <CardTitle className="text-base flex items-center gap-2"><Ship className="h-4 w-4" /> Assigned Vessels</CardTitle>
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
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Contract Library</CardTitle>
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
    </div>
  );
}

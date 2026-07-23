import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadBase64, fmtDate, fmtEur, monthName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { FileDown, Plus, TrendingUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Forecast() {
  const { data: plans, isLoading } = trpc.forecast.plans.useQuery();
  const { data: promises } = trpc.forecast.promises.useQuery();
  const { data: dash } = trpc.forecast.dashboard.useQuery();
  const utils = trpc.useUtils();

  const now = new Date();
  const [targetOpen, setTargetOpen] = useState(false);
  const [tYear, setTYear] = useState(now.getUTCFullYear());
  const [tMonth, setTMonth] = useState(now.getUTCMonth() + 1);
  const [tAmount, setTAmount] = useState("");

  const exportPlan = trpc.reports.export.useMutation({
    onSuccess: r => downloadBase64(r.filename, r.mimeType, r.base64),
    onError: e => toast.error(e.message),
  });

  const setTarget = trpc.forecast.setTarget.useMutation({
    onSuccess: () => {
      toast.success("Monthly target saved");
      utils.forecast.invalidate();
      setTargetOpen(false);
      setTAmount("");
    },
    onError: e => toast.error(e.message),
  });

  const setPromiseStatus = trpc.forecast.updatePromise.useMutation({
    onSuccess: () => {
      utils.forecast.promises.invalidate();
      toast.success("Promise updated");
    },
    onError: e => toast.error(e.message),
  });

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <TrendingUp className="h-6 w-6" /> Collection Forecast Plan
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monthly Target vs Actual tracking, promise-to-pay follow-up and plan exports
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={targetOpen} onOpenChange={setTargetOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-4 w-4" /> Set Monthly Target
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Set Monthly Collection Target</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Year</Label>
                  <Input type="number" value={tYear} onChange={e => setTYear(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Month (1-12)</Label>
                  <Input type="number" min={1} max={12} value={tMonth} onChange={e => setTMonth(Number(e.target.value))} />
                </div>
                <div className="space-y-1.5 col-span-2">
                  <Label>Target amount (€)</Label>
                  <Input type="number" min={0} value={tAmount} onChange={e => setTAmount(e.target.value)} placeholder="e.g. 500000" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  disabled={setTarget.isPending || !tAmount}
                  onClick={() => setTarget.mutate({ year: tYear, month: tMonth, targetAmount: Number(tAmount) })}
                >
                  Save Target
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPlan.mutate({ report: "forecast", format: "xlsx" })} disabled={exportPlan.isPending}>
            <FileDown className="h-4 w-4" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportPlan.mutate({ report: "forecast", format: "pdf" })} disabled={exportPlan.isPending}>
            <FileDown className="h-4 w-4" /> Export PDF
          </Button>
        </div>
      </div>

      {/* 6-month expected inflow overview */}
      {dash && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Expected Inflows — Next 6 Months</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">From Invoices</TableHead>
                  <TableHead className="text-right">From Contracts</TableHead>
                  <TableHead className="text-right">Total Expected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dash.forecast.map(f => (
                  <TableRow key={`${f.year}-${f.month}`}>
                    <TableCell className="font-medium">
                      {monthName(f.month)} {f.year}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(f.fromInvoices)}</TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(f.fromContracts)}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{fmtEur(f.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Target vs Actual per plan month */}
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (plans ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            No monthly targets set yet. Use "Set Monthly Target" to create the collection plan.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(plans ?? []).map(m => {
            const target = Number(m.targetAmount);
            const pct = target > 0 ? Math.min(100, Math.round((m.actual / target) * 100)) : 0;
            const isCurrent = m.year === now.getUTCFullYear() && m.month === now.getUTCMonth() + 1;
            return (
              <Card key={`${m.year}-${m.month}`} className={isCurrent ? "ring-2 ring-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>
                      {monthName(m.month)} {m.year}
                      {isCurrent && (
                        <Badge variant="secondary" className="ml-2">
                          Current
                        </Badge>
                      )}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end justify-between mb-2">
                    <div>
                      <div className="text-xs text-muted-foreground">Actual collected</div>
                      <div className="text-xl font-bold font-mono">{fmtEur(m.actual)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Target</div>
                      <div className="text-xl font-bold font-mono">{target > 0 ? fmtEur(target) : "—"}</div>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2.5" />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{target > 0 ? `${pct}% of target` : "No target set"}</span>
                    <span>
                      Variance:{" "}
                      <span className={`font-mono ${m.actual - target >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {target > 0 ? fmtEur(m.actual - target) : "—"}
                      </span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promises-to-Pay</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(promises ?? []).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No promises recorded. Add them from the Customer 360 View.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Promised Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(promises ?? []).map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.customerName}</TableCell>
                    <TableCell>{fmtDate(p.promisedDate)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          p.status === "Kept"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                            : p.status === "Broken"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : "bg-sky-100 text-sky-800 border-sky-200"
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-52 truncate">{p.notes || "—"}</TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(Number(p.amount))}</TableCell>
                    <TableCell className="text-right">
                      {p.status === "Pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="ghost" className="text-emerald-700" onClick={() => setPromiseStatus.mutate({ id: p.id, status: "Kept" })}>
                            Kept
                          </Button>
                          <Button size="sm" variant="ghost" className="text-red-600" onClick={() => setPromiseStatus.mutate({ id: p.id, status: "Broken" })}>
                            Broken
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

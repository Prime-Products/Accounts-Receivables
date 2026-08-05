import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { downloadBase64, fmtEur, fmtDate, monthName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { BarChart3, Briefcase, FileDown, FileText, ScrollText } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Reports() {
  const { data: customers } = trpc.customers.options.useQuery();
  const { data: opsSummary } = trpc.opsDashboard.summary.useQuery();
  const [soaCustomer, setSoaCustomer] = useState<string>("");
  const [historyCustomer, setHistoryCustomer] = useState<string>("all");
  const historyInput = useMemo(
    () => ({ customerId: historyCustomer === "all" ? undefined : Number(historyCustomer), months: 12 }),
    [historyCustomer]
  );
  const { data: history, isLoading: historyLoading } = trpc.reports.collectionsHistory.useQuery(historyInput);

  const exportReport = trpc.reports.export.useMutation({
    onSuccess: r => {
      downloadBase64(r.filename, r.mimeType, r.base64);
      toast.success(`${r.filename} downloaded`);
    },
    onError: e => toast.error(e.message),
  });

  const cards = [
    {
      icon: BarChart3,
      title: "Aging Report",
      desc: "Open balances segmented into 0-30, 31-60, 61-90, 91-120 and 120+ day buckets, per customer.",
      actions: [
        { label: "Excel", fn: () => exportReport.mutate({ report: "aging", format: "xlsx" }) },
        { label: "PDF", fn: () => exportReport.mutate({ report: "aging", format: "pdf" }) },
      ],
    },
    {
      icon: FileText,
      title: "Forecast Plan",
      desc: "Monthly collection plan with expected inflows from invoices and contract installments.",
      actions: [
        { label: "Excel", fn: () => exportReport.mutate({ report: "forecast", format: "xlsx" }) },
        { label: "PDF", fn: () => exportReport.mutate({ report: "forecast", format: "pdf" }) },
      ],
    },
  ];

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" /> Reports & Exports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aging, collections history per customer and period, and automated Statement of Account (SOA)
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(c => (
          <Card key={c.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <c.icon className="h-4 w-4" /> {c.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3 min-h-10">{c.desc}</p>
              <div className="flex gap-2">
                {c.actions.map(a => (
                  <Button key={a.label} size="sm" variant="outline" className="gap-1.5" onClick={a.fn} disabled={exportReport.isPending}>
                    <FileDown className="h-3.5 w-3.5" /> {a.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ScrollText className="h-4 w-4" /> Statement of Account (SOA)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">Automated SOA generation for a specific customer.</p>
            <div className="space-y-2">
              <Select value={soaCustomer} onValueChange={setSoaCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {(customers ?? []).map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!soaCustomer || exportReport.isPending}
                  onClick={() => exportReport.mutate({ report: "soa", format: "pdf", customerId: Number(soaCustomer) })}
                >
                  <FileDown className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!soaCustomer || exportReport.isPending}
                  onClick={() => exportReport.mutate({ report: "soa", format: "xlsx", customerId: Number(soaCustomer) })}
                >
                  <FileDown className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Collections History (last 12 months)</CardTitle>
          <Select value={historyCustomer} onValueChange={setHistoryCustomer}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All customers</SelectItem>
              {(customers ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {historyLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right"># Receipts</TableHead>
                  <TableHead className="text-right">Total Collected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(history ?? []).map(b => (
                  <TableRow key={`${b.year}-${b.month}`}>
                    <TableCell className="font-medium">
                      {monthName(b.month)} {b.year}
                    </TableCell>
                    <TableCell className="text-right">{b.count}</TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(b.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Operations Summary Card */}
      {opsSummary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" /> Prime 247 Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Active Contracts</p>
                <p className="text-lg font-bold font-mono">{opsSummary.activeContracts}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Total Contract Value</p>
                <p className="text-lg font-bold font-mono">{fmtEur(opsSummary.totalContractValue)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Collected</p>
                <p className="text-lg font-bold font-mono text-emerald-700">{fmtEur(opsSummary.collectedAmount)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Active Equipment</p>
                <p className="text-lg font-bold font-mono">{opsSummary.activeAssets}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Pending Returns</p>
                <p className="text-lg font-bold font-mono text-amber-700">{opsSummary.pendingReturns}</p>
              </div>
            </div>
            {(opsSummary.overduePayments > 0 || opsSummary.expiredCerts > 0) && (
              <div className="mt-4 pt-4 border-t flex flex-wrap gap-4">
                {opsSummary.overduePayments > 0 && (
                  <p className="text-sm text-red-700 font-medium">{opsSummary.overduePayments} overdue payment{opsSummary.overduePayments !== 1 ? "s" : ""}</p>
                )}
                {opsSummary.expiredCerts > 0 && (
                  <p className="text-sm text-red-700 font-medium">{opsSummary.expiredCerts} expired certificate{opsSummary.expiredCerts !== 1 ? "s" : ""}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, tierColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Building2, FileDown, Filter, Layers, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

export default function GroupDetail() {
  const [, params] = useRoute("/groups/:name");
  const [, navigate] = useLocation();
  const group = decodeURIComponent(params?.name ?? "");
  const [companyId, setCompanyId] = useState<string>("all");
  const [branch, setBranch] = useState<string>("all");
  const [agingFilter, setAgingFilter] = useState<string>("all");

  const query = useMemo(
    () => ({
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
      minDaysOverdue: agingFilter === "all" ? undefined : Number(agingFilter),
    }),
    [group, companyId, branch, agingFilter],
  );
  const { data, isLoading } = trpc.customers.groupDetail.useQuery(query, { enabled: !!group });

  const exportSoa = trpc.reports.export.useMutation({
    onSuccess: r => {
      downloadBase64(r.filename, r.mimeType, r.base64);
      toast.success("Group Statement of Account downloaded");
    },
    onError: e => toast.error(e.message),
  });
  const doExport = (format: "pdf" | "xlsx") =>
    exportSoa.mutate({
      report: "soa-group",
      format,
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
      minDaysOverdue: agingFilter === "all" ? undefined : Number(agingFilter),
    });

  const scopeLabel =
    companyId === "all" && branch === "all" && agingFilter === "all"
      ? "Whole group"
      : [
          companyId !== "all" ? data?.companies.find(c => String(c.id) === companyId)?.name : null,
          branch !== "all" ? branchShort(branch) : null,
          agingFilter !== "all" ? `${agingFilter}+ days overdue` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  if (!group) return null;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4" /> Customers
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6" /> {group}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Group card — {data ? `${data.companies.length} companies` : "…"} · showing: {scopeLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && data.companies.length > 0 && (
            <NewTaskDialog
              key={companyId}
              customerIds={data.companies.map(c => c.id)}
              defaultCustomerId={
                companyId !== "all"
                  ? Number(companyId)
                  : [...data.companies].sort((a, b) => Number(b.openBalance ?? 0) - Number(a.openBalance ?? 0))[0]?.id
              }
              trigger={
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-4 w-4" /> New Task
                </Button>
              }
            />
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => doExport("pdf")} disabled={exportSoa.isPending}>
            <FileDown className="h-4 w-4" /> SOA (PDF)
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => doExport("xlsx")} disabled={exportSoa.isPending}>
            <FileDown className="h-4 w-4" /> SOA (Excel)
          </Button>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-64 h-9">
              <SelectValue placeholder="Company" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All companies (group)</SelectItem>
              {(data?.companies ?? []).map(c => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={branch} onValueChange={setBranch}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {(data?.branches ?? []).map(b => (
                <SelectItem key={b} value={b}>
                  {branchShort(b)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agingFilter} onValueChange={setAgingFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Aging" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All invoices</SelectItem>
              <SelectItem value="1">Overdue (any)</SelectItem>
              <SelectItem value="60">Overdue 60+ days</SelectItem>
              <SelectItem value="120">Overdue 120+ days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* KPI cards for current scope */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Balance</div>
                <div className="text-xl font-bold font-mono">{fmtEur(data.totals.openBalance)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtByCurrency(data.totals.openByCurrency, { skipEurOnly: true })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className={`text-xl font-bold font-mono ${data.totals.overdueBalance > 0 ? "text-red-600" : ""}`}>
                  {fmtEur(data.totals.overdueBalance)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{data.totals.overdueCount} overdue invoice(s)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Invoices</div>
                <div className="text-xl font-bold font-mono">{data.totals.openCount}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{data.companies.length} companies in group</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Payment Behavior (last year)</div>
                {data.behavior ? (
                  <>
                    <div
                      className={`text-xl font-bold font-mono ${
                        data.behavior.medianDaysLate > 30 ? "text-red-600" : data.behavior.medianDaysLate > 7 ? "text-amber-600" : "text-emerald-700"
                      }`}
                    >
                      {data.behavior.medianDaysLate > 0 ? `+${data.behavior.medianDaysLate}` : data.behavior.medianDaysLate}d median
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      avg {data.behavior.avgDaysLate}d vs due date · {data.behavior.payments} payments
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground mt-1">No payment history</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Aging for current scope */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aging (current scope)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Current (not due)</div>
                  <div className="text-sm font-bold font-mono">{fmtEur(data.aging.current)}</div>
                </div>
                {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
                  <div key={b} className="rounded-md border bg-muted/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{b} days overdue</div>
                    <div className="text-sm font-bold font-mono">{fmtEur(data.aging.buckets[b].amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{data.aging.buckets[b].count} inv.</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Member companies */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Companies of the group
                {branch !== "all" && (
                  <Badge variant="outline" className={branchColors[branchShort(branch)] ?? ""}>
                    {branchShort(branch)} only
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Behavior</TableHead>
                    <TableHead className="text-right">Open Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Open Inv.</TableHead>
                    <TableHead className="text-right">Card</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map(c => (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer ${String(c.id) === companyId ? "bg-primary/5" : ""}`}
                      onClick={() => setCompanyId(String(c.id) === companyId ? "all" : String(c.id))}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tierColors[c.tier] ?? ""}>
                          {c.tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.medianDaysLate !== null ? (
                          <span
                            className={`font-mono text-xs ${
                              Number(c.medianDaysLate) > 30 ? "text-red-600" : Number(c.medianDaysLate) > 7 ? "text-amber-600" : "text-emerald-700"
                            }`}
                            title={`Last year: median ${c.medianDaysLate}d / avg ${c.avgDaysLate}d late (${c.historyPayments} payments)`}
                          >
                            med {c.medianDaysLate}d
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtEur(c.openBalance)}</TableCell>
                      <TableCell className={`text-right font-mono ${c.overdueBalance > 0 ? "text-red-600" : ""}`}>
                        {fmtEur(c.overdueBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{c.invoiceCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/customers/${c.id}`);
                          }}
                        >
                          Customer 360 →
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground">
                Click a company row to scope all data above to that company; click again to return to the whole group.
              </p>
            </CardContent>
          </Card>

          {/* Invoices for current scope */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Invoices ({scopeLabel})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Doc. Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invoices.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                        <TableCell className="text-sm max-w-52">
                          <div className="truncate" title={i.customerName}>{i.customerName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${branchColors[branchShort(i.company)] ?? ""}`}>
                            {branchShort(i.company)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.issueDate)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${invoiceStatusColors[i.status] ?? ""}`}>
                            {i.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtCur(Number(i.amount), i.currency ?? "EUR")}
                          {i.currency && i.currency !== "EUR" && i.amountEur != null && (
                            <div className="text-[10px] text-muted-foreground">≈ {fmtEur(Number(i.amountEur))}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

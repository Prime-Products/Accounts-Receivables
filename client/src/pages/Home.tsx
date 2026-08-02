import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtByCurrency, fmtEur, monthName } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  CalendarClock,
  Flag,
  ListChecks,
  AlertOctagon,
  PhoneCall,
  Target,
  TrendingUp,
  Wallet,
  FileSignature,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
const CashFlowChart = lazy(() => import("@/components/CashFlowChart"));
import { toast } from "sonner";
import { useLocation } from "wouter";

/** "31 Aug" — the last day of the month the projection refers to. */
function monthEndLabel(ts: number | undefined): string {
  if (!ts) return "month end";
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

export default function Home() {
  const { data, isLoading } = trpc.forecast.dashboard.useQuery();
  const [, navigate] = useLocation();

  if (isLoading || !data) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    );
  }

  const pct = data.target && data.target > 0 ? Math.round((data.collected / data.target) * 100) : null;
  const chartData = data.forecast.map(f => ({
    name: `${monthName(f.month)} ${String(f.year).slice(2)}`,
    "From Invoices": Math.round(f.fromInvoices),
    "From Contracts": Math.round(f.fromContracts),
  }));

  return (
    <div className="p-2 sm:p-4 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Accounts Receivable Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {monthName(data.month)} {data.year} — live collection status
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => navigate("/customers")}>
            <Target className="h-4 w-4" /> Monthly Target (from Forecast)
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[oklch(0.55_0.14_255)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Collection Target</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{data.target !== null ? fmtEur(data.target) : "—"}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.target !== null
                ? `From Smart Forecast — ${monthName(data.month)} ${data.year}`
                : "No forecast yet — use Run Forecast"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.65_0.12_175)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collected vs Target</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{fmtEur(data.collected)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {pct !== null ? `${pct}% of monthly target` : "Set a target to track progress"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.6_0.2_25)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-red-600">{fmtEur(data.totalOverdue)}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.overdueCount} overdue invoice(s)</p>
            {fmtByCurrency((data.aging as any).totalByCurrency, { skipEurOnly: true }) && (
              <p className="text-[11px] text-muted-foreground font-mono mt-1 truncate" title={fmtByCurrency((data.aging as any).totalByCurrency)}>
                {fmtByCurrency((data.aging as any).totalByCurrency)}
              </p>
            )}
            {(data as any).overdueEom !== undefined && (
              <div className="mt-2.5 pt-2.5 border-t">
                <div className="text-[11px] font-medium text-muted-foreground">Overdue end of month</div>
                <div className="text-lg font-bold font-mono text-red-600 leading-tight">
                  {fmtEur((data as any).overdueEom)}
                </div>
                <p className="text-[11px] text-muted-foreground/80">
                  {(data as any).overdueEomCount} invoice(s) due by {monthEndLabel((data as any).overdueEomDate)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.75_0.14_75)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">DSO (Days Sales Outstanding)</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{data.dso} days</div>
            <p className="text-xs text-muted-foreground mt-1">Based on last 90 days of sales</p>
          </CardContent>
        </Card>
      </div>

      {/* Smart tasks & workflow strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <button
          onClick={() => navigate("/customers?conf=not-contacted")}
          className={`text-left rounded-lg border p-4 hover:shadow-md transition-shadow flex items-center gap-4 ${(data.pendingContactGroups ?? 0) > 0 ? "bg-orange-50 border-orange-200" : "bg-card"}`}
        >
          <div className="h-11 w-11 rounded-lg bg-orange-100 flex items-center justify-center">
            <PhoneCall className="h-5 w-5 text-orange-700" />
          </div>
          <div>
            <div className={`text-xl font-bold ${(data.pendingContactGroups ?? 0) > 0 ? "text-orange-700" : ""}`}>{data.pendingContactGroups ?? 0}</div>
            <div className="text-sm text-muted-foreground">Εκκρεμεί επικοινωνία — groups με forecast χωρίς επιβεβαίωση</div>
          </div>
        </button>
        <button
          onClick={() => navigate("/tasks")}
          className="text-left rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="h-11 w-11 rounded-lg bg-sky-100 flex items-center justify-center">
            <ListChecks className="h-5 w-5 text-sky-700" />
          </div>
          <div>
            <div className="text-xl font-bold">{data.pendingTasks}</div>
            <div className="text-sm text-muted-foreground">Pending follow-up tasks</div>
          </div>
        </button>
        <button
          onClick={() => navigate("/customers?status=problematic")}
          className="text-left rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="h-11 w-11 rounded-lg bg-amber-100 flex items-center justify-center">
            <AlertOctagon className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <div className="text-xl font-bold">{data.problematicGroups ?? 0}</div>
            <div className="text-sm text-muted-foreground">Problematic groups</div>
          </div>
        </button>
        <button
          onClick={() => navigate("/customers?status=on-hold")}
          className="text-left rounded-lg border bg-card p-4 hover:shadow-md transition-shadow flex items-center gap-4"
        >
          <div className="h-11 w-11 rounded-lg bg-red-100 flex items-center justify-center">
            <Flag className="h-5 w-5 text-red-700" />
          </div>
          <div>
            <div className="text-xl font-bold">{data.onHoldGroups ?? 0}</div>
            <div className="text-sm text-muted-foreground">On Hold / Legal groups</div>
          </div>
        </button>
        <button
          onClick={() => navigate("/invoices?contract=overdue")}
          className={`text-left rounded-lg border p-4 hover:shadow-md transition-shadow flex items-center gap-4 ${(data.overdueContractCount ?? 0) > 0 ? "bg-red-50 border-red-200" : "bg-card"}`}
        >
          <div className="h-11 w-11 rounded-lg bg-violet-100 flex items-center justify-center">
            <FileSignature className="h-5 w-5 text-violet-700" />
          </div>
          <div>
            <div className={`text-xl font-bold ${(data.overdueContractCount ?? 0) > 0 ? "text-red-700" : ""}`}>{data.overdueContractCount ?? 0}</div>
            <div className="text-sm text-muted-foreground">Overdue contract installments{(data.overdueContractAmount ?? 0) > 0 ? ` · ${fmtEur(data.overdueContractAmount)}` : ""}</div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Forecast chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Cash Flow Forecast — Next 6 Months
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <Suspense fallback={<Skeleton className="h-full w-full" />}>
                <CashFlowChart data={chartData} formatValue={fmtEur} />
              </Suspense>
            </div>
          </CardContent>
        </Card>

        {/* Aging summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aging Buckets (Overdue)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(bucket => {
              const b = data.aging.buckets[bucket];
              const max = Math.max(1, ...Object.values(data.aging.buckets).map(x => x.amount));
              const widthPct = Math.round((b.amount / max) * 100);
              const colors: Record<string, string> = {
                "0-30": "bg-sky-500",
                "31-60": "bg-amber-500",
                "61-90": "bg-orange-500",
                "91-120": "bg-red-500",
                "120+": "bg-red-700",
              };
              return (
                <div key={bucket}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium">{bucket} days</span>
                    <span className="font-mono">{fmtEur(b.amount)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full rounded-full ${colors[bucket]}`} style={{ width: `${widthPct}%` }} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {b.count} invoice(s)
                    {fmtByCurrency((data.aging as any).bucketsByCurrency?.[bucket], { skipEurOnly: true }) && (
                      <span className="block font-mono text-[11px] truncate" title={fmtByCurrency((data.aging as any).bucketsByCurrency?.[bucket])}>
                        {fmtByCurrency((data.aging as any).bucketsByCurrency?.[bucket])}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t flex items-center justify-between">
              <span className="text-sm font-medium">Total AR balance</span>
              <Badge variant="secondary" className="font-mono">
                {fmtEur(data.arBalance)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

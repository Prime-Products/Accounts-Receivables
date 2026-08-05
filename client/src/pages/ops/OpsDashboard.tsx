import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { fmtEur } from "@/lib/format";
import {
  AlertTriangle,
  Briefcase,
  CheckCircle2,
  Package,
  RotateCcw,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useLocation } from "wouter";

export default function OpsDashboard() {
  const { data, isLoading } = trpc.opsDashboard.summary.useQuery();
  const [, navigate] = useLocation();

  if (isLoading || !data) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Prime 247 Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Contracts, equipment, and fulfillment overview
        </p>
      </div>

      {/* KPI Row 1: Contracts & Revenue */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card
          className="border-l-4 border-l-[oklch(0.55_0.14_255)] cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/ops/contracts")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Contracts</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{data.activeContracts}</div>
            <p className="text-xs text-muted-foreground mt-1">of {data.totalContracts} total</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-[oklch(0.65_0.12_175)]">
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Contract Value</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{fmtEur(data.totalContractValue)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Collected: {fmtEur(data.collectedAmount)}
            </p>
          </CardContent>
        </Card>

        <Card
          className="border-l-4 border-l-[oklch(0.65_0.12_80)] cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate("/ops/assets")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Equipment</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{data.activeAssets}</div>
            <p className="text-xs text-muted-foreground mt-1">of {data.totalAssets} total tracked</p>
          </CardContent>
        </Card>
      </div>

      {/* KPI Row 2: Alerts & Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${data.pendingReturns > 0 ? "border-amber-200 bg-amber-50/50" : ""}`}
          onClick={() => navigate("/ops/assets?status=Pending+Return")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Returns</CardTitle>
            <RotateCcw className={`h-4 w-4 ${data.pendingReturns > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${data.pendingReturns > 0 ? "text-amber-700" : ""}`}>
              {data.pendingReturns}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Equipment awaiting collection</p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${data.expiringCerts15 > 0 ? "border-red-200 bg-red-50/50" : ""}`}
          onClick={() => navigate("/ops/certificates")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Certificates Expiring</CardTitle>
            <ShieldCheck className={`h-4 w-4 ${data.expiringCerts15 > 0 ? "text-red-600" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${data.expiringCerts15 > 0 ? "text-red-700" : ""}`}>
              {data.expiringCerts15}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Final notice ≤15 days · {data.expiringCerts60} more within 60d
            </p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${data.overduePayments > 0 ? "border-red-200 bg-red-50/50" : ""}`}
          onClick={() => navigate("/ops/contracts")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue Payments</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${data.overduePayments > 0 ? "text-red-600" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${data.overduePayments > 0 ? "text-red-700" : ""}`}>
              {data.overduePayments}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.pendingPayments} total pending
            </p>
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer hover:shadow-md transition-shadow ${data.expiredCerts > 0 ? "border-red-200 bg-red-50/50" : ""}`}
          onClick={() => navigate("/ops/certificates")}
        >
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expired Certificates</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${data.expiredCerts > 0 ? "text-red-600" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${data.expiredCerts > 0 ? "text-red-700" : ""}`}>
              {data.expiredCerts}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Require immediate renewal</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

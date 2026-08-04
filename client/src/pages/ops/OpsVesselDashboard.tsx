import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Clock, Package, Ship, Truck } from "lucide-react";
import { useLocation, useParams } from "wouter";

const assetStatusColors: Record<string, string> = {
  "Not Supplied": "bg-gray-100 text-gray-700 border-gray-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Pending Return": "bg-amber-100 text-amber-800 border-amber-200",
  Returned: "bg-sky-100 text-sky-800 border-sky-200",
  "Written Off": "bg-red-100 text-red-700 border-red-200",
};

const eventTypeColors: Record<string, string> = {
  AssetAssigned: "bg-blue-100 text-blue-800 border-blue-200",
  StatusChange: "bg-purple-100 text-purple-800 border-purple-200",
  OrderFulfilled: "bg-orange-100 text-orange-800 border-orange-200",
  CertificateExpiry: "bg-red-100 text-red-700 border-red-200",
  Comment: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function OpsVesselDashboard() {
  const params = useParams<{ id: string }>();
  const vesselId = Number(params.id);
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.opsVessel.dashboard.useQuery({ vesselId }, { enabled: vesselId > 0 });

  if (vesselId <= 0) {
    return (
      <div className="p-2 sm:p-4 flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <Ship className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-lg font-medium">Invalid vessel ID</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/ops/assets")}>Back to Equipment</Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-2 sm:p-4 flex flex-col items-center justify-center min-h-[400px] text-muted-foreground">
        <Ship className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-lg font-medium">Vessel not found</p>
        <p className="text-sm mt-1">This vessel may not have any active assignments.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/ops/assets")}>Back to Equipment</Button>
      </div>
    );
  }

  const { vessel, assignments, assets, orders, history, quotaUsage } = data;

  return (
    <div className="p-2 sm:p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/ops/assets")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ship className="h-5 w-5" /> {vessel.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            IMO: {vessel.imo ?? "—"} · {vessel.vesselType ?? "—"} · {vessel.flag ?? "—"}
          </p>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-[oklch(0.55_0.14_255)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Contracts</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{assignments.length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.65_0.12_80)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Equipment</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{assets.length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.65_0.12_175)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Active Equipment</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{assets.filter(a => a.status === "Active").length}</div></CardContent>
        </Card>
        <Card className="border-l-4 border-l-[oklch(0.55_0.14_25)]">
          <CardHeader className="pb-1"><CardTitle className="text-sm font-medium text-muted-foreground">Pending Orders</CardTitle></CardHeader>
          <CardContent><div className="text-xl font-bold font-mono">{orders.filter(o => o.status === "Pending").length}</div></CardContent>
        </Card>
      </div>

      {/* Equipment Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" /> Equipment on Board</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Instrument</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Certificates</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assets.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No equipment assigned</TableCell></TableRow>
              ) : (
                assets.map(a => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.name}</div>
                      <div className="font-mono text-xs text-muted-foreground mt-0.5">S/N {a.serialNumber}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className={assetStatusColors[a.status] ?? ""}>{a.status}</Badge></TableCell>
                    <TableCell className="text-sm">{a.certificates.length > 0 ? `${a.certificates.length} cert(s)` : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Quota Usage */}
      {quotaUsage.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Truck className="h-4 w-4" /> Consumable Quota Usage</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-center">Limit</TableHead>
                  <TableHead className="text-center">Used</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotaUsage.map((q, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{q.libraryItem.name}</TableCell>
                    <TableCell className="text-center font-mono">{q.libraryItem.quotaLimit}</TableCell>
                    <TableCell className="text-center font-mono">{q.used}</TableCell>
                    <TableCell className={`text-center font-mono ${q.remaining <= 0 ? "text-red-700 font-bold" : q.remaining <= 2 ? "text-amber-700" : ""}`}>
                      {q.remaining}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* History Log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Date</TableHead>
                <TableHead className="w-[130px]">Event</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No activity yet</TableCell></TableRow>
              ) : (
                history.map(h => (
                  <TableRow key={h.id}>
                    <TableCell className="text-sm">{fmtDate(new Date(h.createdAt).getTime())}</TableCell>
                    <TableCell><Badge variant="outline" className={eventTypeColors[h.eventType] ?? ""}>{h.eventType}</Badge></TableCell>
                    <TableCell className="text-sm">{h.description}</TableCell>
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

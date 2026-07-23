import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Cable, RefreshCcw, Settings as SettingsIcon, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";

const APP_ROLES = ["Administrator", "Accounting", "Credit Controller", "Management"] as const;

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: myRole } = trpc.admin.myRole.useQuery();
  const isAdmin = myRole?.appRole === "Administrator";
  const canViewUsers = isAdmin || myRole?.appRole === "Management";

  const { data: syncStatus } = trpc.admin.syncStatus.useQuery();
  const { data: users, isLoading: usersLoading } = trpc.admin.users.useQuery(undefined, { enabled: canViewUsers });
  const { data: audit, isLoading: auditLoading } = trpc.reports.audit.useQuery(undefined, { enabled: canViewUsers });

  const pullCustomers = trpc.admin.syncPullCustomers.useMutation({
    onSuccess: r => {
      toast.success(`Customers synced: ${r.synced}`);
      utils.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const pullInvoices = trpc.admin.syncPullInvoices.useMutation({
    onSuccess: r => {
      toast.success(`Invoices synced: ${r.synced}`);
      utils.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const setRole = trpc.admin.setRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.admin.users.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const syncBusy = pullCustomers.isPending || pullInvoices.isPending;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" /> Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Softone ERP integration, user roles and audit trail</p>
      </div>

      {/* Softone */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Cable className="h-4 w-4" /> Softone ERP Integration (S1 Web Services)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span>Connection status:</span>
            {syncStatus ? (
              <Badge
                variant="outline"
                className={
                  syncStatus.configured
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                }
              >
                {syncStatus.configured ? "Configured" : "Demo mode — SOFTONE_* secrets not set"}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-24" />
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Two-way sync: pull customers (TRDR) and sales invoices (FINDOC), push receipts back to Softone. In demo
            mode, sample data is loaded so every feature can be evaluated before connecting the real ERP.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button className="gap-2" onClick={() => pullCustomers.mutate()} disabled={syncBusy}>
              <RefreshCcw className={`h-4 w-4 ${pullCustomers.isPending ? "animate-spin" : ""}`} />
              {syncStatus?.configured ? "Pull Customers" : "Load Demo Customers"}
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => pullInvoices.mutate()} disabled={syncBusy}>
              <RefreshCcw className={`h-4 w-4 ${pullInvoices.isPending ? "animate-spin" : ""}`} />
              {syncStatus?.configured ? "Pull Invoices" : "Load Demo Invoices"}
            </Button>
          </div>
          {syncStatus && syncStatus.logs.length > 0 && (
            <div className="pt-2">
              <div className="text-sm font-medium mb-1">Recent sync activity</div>
              <div className="space-y-1 max-h-40 overflow-auto">
                {syncStatus.logs.map(l => (
                  <div key={l.id} className="text-xs text-muted-foreground flex gap-2 items-center">
                    <Badge variant="outline" className="text-[10px]">
                      {l.direction}
                    </Badge>
                    <span>
                      {l.entityType} — {l.recordCount} record(s) — {l.status}
                    </span>
                    <span>{fmtDate(l.createdAt.getTime())}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Users */}
      {canViewUsers && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" /> Users & Roles
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {usersLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    {isAdmin && <TableHead className="text-right">Change Role</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(users ?? []).map(u => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name ?? "—"}</TableCell>
                      <TableCell className="text-sm">{u.email ?? "—"}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={u.appRole === "Administrator" ? "bg-violet-100 text-violet-800 border-violet-200" : ""}
                        >
                          {u.appRole ?? "Accounting"}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end flex-wrap">
                            {APP_ROLES.map(r => (
                              <Button
                                key={r}
                                size="sm"
                                variant={u.appRole === r ? "secondary" : "ghost"}
                                className="h-7 text-xs"
                                onClick={() => setRole.mutate({ userId: u.id, appRole: r })}
                              >
                                {r}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Audit trail */}
      {canViewUsers && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Audit Trail
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {auditLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : (audit ?? []).length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No actions recorded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(audit ?? []).map(a => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm whitespace-nowrap">{fmtDate(a.createdAt.getTime())}</TableCell>
                      <TableCell className="text-sm">{a.userName ?? "System"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{a.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {a.entityType} {a.entityId ? `#${a.entityId}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-80 truncate">{a.details ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

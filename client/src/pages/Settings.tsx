import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EmailTemplatesCard from "@/components/EmailTemplatesCard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Cable, Coins, RefreshCcw, Settings as SettingsIcon, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const APP_ROLES = ["Administrator", "Accounting", "Credit Controller", "Management"] as const;

const FX_CURRENCIES = ["USD", "AED", "SGD"] as const;

function FxRatesCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.fxRates.useQuery();
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const next: Record<string, string> = {};
      for (const c of FX_CURRENCIES) next[c] = String(data.rates[c] ?? "");
      setValues(next);
    }
  }, [data]);

  const save = trpc.admin.setFxRates.useMutation({
    onSuccess: () => {
      toast.success("FX rates saved — used for all new EUR conversions");
      utils.admin.fxRates.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const dirty =
    data != null && FX_CURRENCIES.some(c => Number(values[c]) !== data.rates[c] && values[c] !== "");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Coins className="h-4 w-4" /> FX Rates to EUR
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          One unit of each currency in EUR (e.g. 1 USD = 0.92 EUR). These rates are applied when converting
          non-EUR invoices to EUR for totals, aging and forecasts.
        </p>
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            {FX_CURRENCIES.map(c => (
              <div key={c} className="space-y-1.5">
                <Label className="text-xs">1 {c} =</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    step="0.0001"
                    min={0}
                    className="w-28 font-mono h-9"
                    value={values[c] ?? ""}
                    onChange={e => setValues(v => ({ ...v, [c]: e.target.value }))}
                  />
                  <span className="text-sm text-muted-foreground">EUR</span>
                </div>
              </div>
            ))}
            <Button
              disabled={!dirty || save.isPending}
              onClick={() => {
                const rates: Record<string, number> = {};
                for (const c of FX_CURRENCIES) {
                  const n = Number(values[c]);
                  if (Number.isFinite(n) && n > 0) rates[c] = n;
                }
                save.mutate({ rates });
              }}
            >
              {save.isPending ? "Saving…" : "Save Rates"}
            </Button>
          </div>
        )}
        {data && (
          <p className="text-xs text-muted-foreground">
            Defaults: {FX_CURRENCIES.map(c => `1 ${c} = ${data.defaults[c]} EUR`).join(" · ")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const utils = trpc.useUtils();
  const { data: myRole } = trpc.admin.myRole.useQuery();
  const isAdmin = myRole?.appRole === "Administrator";
  const canViewUsers = isAdmin || myRole?.appRole === "Management";

  const { data: syncStatus } = trpc.admin.syncStatus.useQuery(undefined, {
    refetchInterval: query => (query.state.data?.running ? 2_000 : 10_000),
  });
  const { data: users, isLoading: usersLoading } = trpc.admin.users.useQuery(undefined, { enabled: canViewUsers });
  const { data: audit, isLoading: auditLoading } = trpc.reports.audit.useQuery(undefined, { enabled: canViewUsers });

  const pullAll = trpc.admin.syncPullAll.useMutation({
    onSuccess: r => {
      toast.success(`SoftOne sync completed: ${r.customers} customers, ${r.invoices} invoices`);
      utils.invalidate();
    },
    onError: e => {
      toast.error(e.message);
      utils.admin.syncStatus.invalidate();
    },
  });
  const setRole = trpc.admin.setRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      utils.admin.users.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const syncBusy = pullAll.isPending || syncStatus?.running === true;

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
            <Cable className="h-4 w-4" /> SoftOne ERP Integration (Read-only SQL)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <span>Connection status:</span>
            {syncStatus ? (
              <Badge
                variant="outline"
                className={
                  syncStatus.configured && syncStatus.enabled
                    ? "bg-emerald-100 text-emerald-800 border-emerald-200"
                    : "bg-amber-100 text-amber-800 border-amber-200"
                }
              >
                {syncStatus.configured && syncStatus.enabled
                  ? "Configured and enabled"
                  : syncStatus.configured
                    ? "Configured, sync disabled"
                    : "Not configured"}
              </Badge>
            ) : (
              <Skeleton className="h-5 w-24" />
            )}
            {syncStatus?.running && (
              <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
                Synchronization running
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            Server-side, read-only synchronization from the approved CustomerGroupFinData reporting view. The browser
            cannot submit SQL, and write-back to SoftOne is disabled.
          </p>
          <div className="flex gap-2 flex-wrap">
            <Button
              className="gap-2"
              onClick={() => pullAll.mutate()}
              disabled={syncBusy || !syncStatus?.configured || !syncStatus?.enabled}
            >
              <RefreshCcw className={`h-4 w-4 ${syncBusy ? "animate-spin" : ""}`} />
              {syncBusy ? "Synchronization running…" : "Sync Customers & Invoices"}
            </Button>
          </div>
          {syncStatus?.running && (
            <p className="text-sm text-blue-700">
              Another user or scheduled task has already started synchronization. This button will become available
              automatically when it finishes.
            </p>
          )}
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

      {/* FX Rates */}
      <FxRatesCard />

      {/* Email templates */}
      <EmailTemplatesCard />

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

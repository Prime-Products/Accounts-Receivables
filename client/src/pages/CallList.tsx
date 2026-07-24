import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { fmtEur } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone, ChevronRight } from "lucide-react";

const statusBadge: Record<string, string> = {
  Problematic: "border-amber-300 bg-amber-50 text-amber-800",
  Critical: "border-red-300 bg-red-50 text-red-700",
  Legal: "border-purple-300 bg-purple-50 text-purple-700",
};

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type CallRow = inferRouterOutputs<AppRouter>["customers"]["callList"][number];

export default function CallList() {
  const { data, isLoading } = trpc.customers.callList.useQuery();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const rows = useMemo(() => {
    if (!data) return [];
    let list = data;
    if (statusFilter === "flagged") list = list.filter(r => r.tier > 0);
    else if (statusFilter !== "all") list = list.filter(r => (r.watchStatus ?? "Normal") === statusFilter);
    return list;
  }, [data, statusFilter]);

  const totalOverdue = useMemo(() => (data ?? []).reduce((s, r) => s + r.overdueBalance, 0), [data]);
  const flaggedCount = useMemo(() => (data ?? []).filter(r => r.tier > 0).length, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Phone className="h-6 w-6" /> Call List
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Status first: Critical &amp; Legal on top, then Problematic, then the rest — ordered by amount at risk within each tier.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              <SelectItem value="flagged">Problematic &amp; Critical{flaggedCount > 0 ? ` (${flaggedCount})` : ""}</SelectItem>
              <SelectItem value="Critical">Critical only</SelectItem>
              <SelectItem value="Problematic">Problematic only</SelectItem>
              <SelectItem value="Legal">Legal only</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isLoading ? "Loading…" : `${rows.length} groups with overdue balance · ${fmtEur(totalOverdue)} total overdue`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">No groups match — nothing overdue. Well done.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Overdue EOM</TableHead>
                    <TableHead className="text-right">AI Forecast</TableHead>
                    <TableHead>Contact</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={r.group}>
                      <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                      <TableCell>
                        <Link href={`/groups/${encodeURIComponent(r.group)}`} className="font-medium hover:underline inline-flex items-center gap-1">
                          {r.group}
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        </Link>
                        <div className="text-[10px] text-muted-foreground font-mono">score {r.score.toLocaleString()}</div>
                      </TableCell>
                      <TableCell>
                        {r.watchStatus ? (
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadge[r.watchStatus] ?? "border-slate-300 bg-slate-50 text-slate-600"}`}>
                            {r.watchStatus}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600 font-semibold">
                        {fmtEur(r.overdueBalance)}
                        <div className="text-[10px] font-normal text-muted-foreground">{r.overdueCount} inv.</div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-orange-600">
                        {fmtEur(r.overdueEomBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-700">
                        {r.forecastExpected > 0 ? fmtEur(r.forecastExpected) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-44">
                        {r.contacts.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="text-xs leading-tight">
                            {r.contacts[0].contactPerson && <div className="font-medium">{r.contacts[0].contactPerson}</div>}
                            {r.contacts[0].phone && (
                              <a href={`tel:${r.contacts[0].phone}`} className="text-blue-600 hover:underline">{r.contacts[0].phone}</a>
                            )}
                            {!r.contacts[0].phone && r.contacts[0].email && (
                              <a href={`mailto:${r.contacts[0].email}`} className="text-blue-600 hover:underline">{r.contacts[0].email}</a>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

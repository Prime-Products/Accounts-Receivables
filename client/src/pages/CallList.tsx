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
import { GroupWorkspace } from "@/components/GroupWorkspace";
const statusBadge: Record<string, string> = {
  Problematic: "border-amber-300 bg-amber-50 text-amber-800",
  Critical: "border-red-300 bg-red-50 text-red-700",
  Legal: "border-purple-300 bg-purple-50 text-purple-700",
};

type CallRow = any;

export default function CallList() {
  const { data, isLoading } = trpc.customers.callList.useQuery();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CallRow | null>(null);

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
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Phone className="h-6 w-6" /> Call List
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Status first: Critical & Legal on top, then Problematic, then the rest — ordered by amount at risk within each tier.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{rows.length} groups with overdue balance · {fmtEur(totalOverdue)} total overdue</CardTitle>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="status-filter" className="text-xs font-semibold">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger id="status-filter" className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                    <SelectItem value="Problematic">Problematic</SelectItem>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : (
              <div className="border border-gray-200 rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Group</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="text-right">Overdue</TableHead>
                      <TableHead className="text-right">Overdue EOM</TableHead>
                      <TableHead className="text-right">AI Forecast</TableHead>
                      <TableHead className="text-center">Contact</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r, idx) => (
                      <TableRow 
                        key={r.group} 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedGroup(r);
                          setShowWorkspace(true);
                        }}
                      >
                        <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell>
                          <Link href={`/groups/${encodeURIComponent(r.group)}`} className="font-medium hover:underline inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {r.group}
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          </Link>
                          <div className="text-[10px] text-muted-foreground font-mono">score {r.score.toLocaleString()}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${statusBadge[r.watchStatus ?? "Normal"] || statusBadge["Normal"]}`}>
                            {r.watchStatus ?? "Normal"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-bold text-red-600">{fmtEur(r.overdueBalance)}</TableCell>
                        <TableCell className="text-right font-bold text-orange-600">{fmtEur(r.overdueEomBalance)}</TableCell>
                        <TableCell className="text-right font-bold text-green-600">{fmtEur(r.forecastExpected ?? 0)}</TableCell>
                        <TableCell className="text-center">
                          {r.contacts && r.contacts.length > 0 && (
                            <a href={`tel:${r.contacts[0].phone}`} className="text-blue-600 hover:underline">
                              <Phone className="h-4 w-4 inline" />
                            </a>
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

      {selectedGroup && (
        <GroupWorkspace
          open={showWorkspace}
          onOpenChange={setShowWorkspace}
          group={{
            name: selectedGroup.group,
            overdue: selectedGroup.overdueBalance,
            overdueEom: selectedGroup.overdueEomBalance,
            forecast: selectedGroup.forecastExpected,
            status: selectedGroup.watchStatus ?? undefined,
            rating: selectedGroup.rating ?? undefined,
            contacts: selectedGroup.contacts,
          }}
        />
      )}
    </>
  );
}

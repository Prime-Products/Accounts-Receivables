import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtEur, onHoldStatusColors, ratingColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, ArrowUpDown, HandCoins, Layers, MoreHorizontal, Phone, Plus, Search, Sparkles, StickyNote, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import LogCallDialog from "@/components/LogCallDialog";
import NewTaskDialog from "@/components/NewTaskDialog";
import GroupNotesDialog from "@/components/GroupNotesDialog";

type GroupSortKey = "companies" | "open" | "overdue" | "overdueEom" | "forecast" | "collected" | "remaining" | "overdueCount";
type CompanySortKey = "open" | "overdue" | "overdueEom" | "credit" | "score";

/** Per-row quick actions dropdown for the Customers groups list. */
function GroupRowActions({ group }: { group: string }) {
  const [callOpen, setCallOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [loadMembers, setLoadMembers] = useState(false);
  // Load member companies lazily (only when Log Call / New Task requested)
  const { data: allCustomers } = trpc.customers.list.useQuery(undefined, { enabled: loadMembers });
  const members = useMemo(
    () =>
      (allCustomers ?? [])
        .filter(c => ((c.customerGroup ?? "").trim() || c.name) === group)
        .map(c => ({ id: c.id, name: c.name, openBalance: c.openBalance })),
    [allCustomers, group]
  );
  const defaultCustomerId = useMemo(
    () => (members.length > 0 ? [...members].sort((a, b) => b.openBalance - a.openBalance)[0].id : undefined),
    [members]
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => {
              setLoadMembers(true);
              setCallOpen(true);
            }}
          >
            <Phone className="h-4 w-4 mr-2" /> Log Call
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setLoadMembers(true);
              setTaskOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New Task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setNoteOpen(true)}>
            <StickyNote className="h-4 w-4 mr-2" /> Add Note
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {callOpen && (
        <LogCallDialog
          group={group}
          companies={members}
          defaultCustomerId={defaultCustomerId}
          open={callOpen}
          onOpenChange={setCallOpen}
        />
      )}
      {taskOpen && (
        <NewTaskDialog
          customerIds={members.map(m => m.id)}
          defaultCustomerId={defaultCustomerId}
          trigger={<span className="hidden" />}
          open={taskOpen}
          onOpenChange={setTaskOpen}
        />
      )}
      {noteOpen && <GroupNotesDialog group={group} open={noteOpen} onOpenChange={setNoteOpen} />}
    </>
  );
}

function SortableHead({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <TableHead className="text-right">
      <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={onClick}>
        {label}
        {active ? (
          dir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40" />
        )}
      </button>
    </TableHead>
  );
}

export default function Customers() {
  const { data, isLoading } = trpc.customers.list.useQuery();
  const [view, setView] = useState<"groups" | "companies">("groups");
  const { data: groups, isLoading: groupsLoading } = trpc.customers.groups.useQuery(undefined, {
    enabled: view === "groups",
  });
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  const [groupSort, setGroupSort] = useState<{ key: GroupSortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  const [companySort, setCompanySort] = useState<{ key: CompanySortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });

  const toggleGroupSort = (key: GroupSortKey) =>
    setGroupSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const toggleCompanySort = (key: CompanySortKey) =>
    setCompanySort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const now = new Date();
  const generate = trpc.forecast.generateSmart.useMutation({
    onSuccess: r => {
      toast.success(`Forecast refreshed for ${r.customers} customers (${r.aiCount} AI, ${r.heuristicCount} statistical)`);
      utils.customers.groups.invalidate();
      utils.forecast.smartEntries.invalidate();
      utils.forecast.smartMonths.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.filter(c => {
      const matchesSearch =
        !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase());
      const matchesRating = ratingFilter === "all" || c.rating === ratingFilter;
      return matchesSearch && matchesRating;
    });
    if (companySort.key) {
      const getVal = (c: (typeof rows)[number]): number => {
        switch (companySort.key) {
          case "open":
            return c.openBalance;
          case "overdue":
            return c.overdueBalance;
          case "overdueEom":
            return c.overdueEomBalance;
          case "credit":
            return Number(c.creditLimit);
          case "score":
            return c.ratingScore;
          default:
            return 0;
        }
      };
      rows = [...rows].sort((a, b) => {
        const diff = getVal(a) - getVal(b);
        return companySort.dir === "asc" ? diff : -diff;
      });
    }
    return rows;
  }, [data, search, ratingFilter, companySort]);

  const filteredGroups = useMemo(() => {
    if (!groups) return [];
    let rows = groups.filter(g => {
      const matchesSearch = !search || g.group.toLowerCase().includes(search.toLowerCase());
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "problematic" && g.watchStatus === "Problematic") ||
        (statusFilter === "critical" && g.watchStatus === "Critical") ||
        (statusFilter === "legal" && g.watchStatus === "Legal") ||
        (statusFilter === "resolved" && g.watchStatus === "Resolved") ||
        (statusFilter === "normal" && !g.watchStatus);
      const matchesRating = ratingFilter === "all" || g.rating === ratingFilter;
      return matchesSearch && matchesStatus && matchesRating;
    });
    if (groupSort.key) {
      const getVal = (g: (typeof rows)[number]): number => {
        switch (groupSort.key) {
          case "companies":
            return g.companyCount;
          case "open":
            return g.openBalance;
          case "overdue":
            return g.overdueBalance;
          case "overdueEom":
            return g.overdueEomBalance;
          case "forecast":
            return g.forecastExpected;
          case "collected":
            return g.collected;
          case "remaining":
            return g.remaining;
          case "overdueCount":
            return g.overdueCount;
          default:
            return 0;
        }
      };
      rows = [...rows].sort((a, b) => {
        const diff = getVal(a) - getVal(b);
        return groupSort.dir === "asc" ? diff : -diff;
      });
    }
    return rows;
  }, [groups, search, statusFilter, ratingFilter, groupSort]);

  const groupTotals = useMemo(
    () =>
      filteredGroups.reduce(
        (t: { companies: number; open: number; overdue: number; overdueEom: number; forecast: number; collected: number; remaining: number; overdueCount: number }, g) => ({
          companies: t.companies + g.companyCount,
          open: t.open + g.openBalance,
          overdue: t.overdue + g.overdueBalance,
          overdueEom: t.overdueEom + g.overdueEomBalance,
          forecast: t.forecast + g.forecastExpected,
          collected: t.collected + g.collected,
          remaining: t.remaining + g.remaining,
          overdueCount: t.overdueCount + g.overdueCount,
        }),
        { companies: 0, open: 0, overdue: 0, overdueEom: 0, forecast: 0, collected: 0, remaining: 0, overdueCount: 0 }
      ),
    [filteredGroups]
  );

  const companyTotals = useMemo(
    () =>
      filtered.reduce<{ open: number; overdue: number; overdueEom: number; credit: number }>(
        (t, c) => ({
          open: t.open + c.openBalance,
          overdue: t.overdue + c.overdueBalance,
          overdueEom: t.overdueEom + c.overdueEomBalance,
          credit: t.credit + Number(c.creditLimit),
        }),
        { open: 0, overdue: 0, overdueEom: 0, credit: 0 }
      ),
    [filtered]
  );

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {view === "groups"
              ? "Group tracking — click a group for its card with member companies"
              : "Click a row for the Customer 360 View"}
          </p>
        </div>
        <Button
          className="gap-2"
          disabled={generate.isPending}
          onClick={() =>
            generate.mutate({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, useAi: true })
          }
        >
          <Sparkles className="h-4 w-4" />
          {generate.isPending ? "Refreshing…" : "Refresh Forecast"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Tabs value={view} onValueChange={v => setView(v as "groups" | "companies")}>
          <TabsList className="h-10">
            <TabsTrigger value="groups" className="gap-1.5">
              <Layers className="h-4 w-4" /> Groups
            </TabsTrigger>
            <TabsTrigger value="companies" className="gap-1.5">
              <Users className="h-4 w-4" /> Companies
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={view === "groups" ? "Search group…" : "Search by name or code…"}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {view === "groups" && (
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="problematic">Problematic</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="legal">Legal</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Rating" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ratings</SelectItem>
            {["A", "B", "C", "D", "E"].map(r => (
              <SelectItem key={r} value={r}>
                Rating {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {view === "groups" ? (
            groupsLoading ? (
              <div className="p-4 space-y-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">No groups found.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Group</TableHead>
                    <SortableHead label="Open Balance" active={groupSort.key === "open"} dir={groupSort.dir} onClick={() => toggleGroupSort("open")} />
                    <SortableHead label="Overdue" active={groupSort.key === "overdue"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdue")} />
                    <SortableHead label="Overdue EOM" active={groupSort.key === "overdueEom"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdueEom")} />
                    <SortableHead label="AI Forecast" active={groupSort.key === "forecast"} dir={groupSort.dir} onClick={() => toggleGroupSort("forecast")} />
                    <SortableHead label="Collected" active={groupSort.key === "collected"} dir={groupSort.dir} onClick={() => toggleGroupSort("collected")} />
                    <SortableHead label="Remaining" active={groupSort.key === "remaining"} dir={groupSort.dir} onClick={() => toggleGroupSort("remaining")} />
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/60 font-semibold border-b-2 hover:bg-muted/60">
                    <TableCell>TOTAL ({filteredGroups.length} groups)</TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(groupTotals.open)}</TableCell>
                    <TableCell className={`text-right font-mono ${groupTotals.overdue > 0 ? "text-red-600" : ""}`}>
                      {fmtEur(groupTotals.overdue)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${groupTotals.overdueEom > 0 ? "text-amber-600" : ""}`}>
                      {fmtEur(groupTotals.overdueEom)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${groupTotals.forecast > 0 ? "text-emerald-700" : ""}`}>
                      {fmtEur(groupTotals.forecast)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${groupTotals.collected > 0 ? "text-emerald-700" : ""}`}>
                      {fmtEur(groupTotals.collected)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${groupTotals.remaining > 0 ? "text-amber-600" : ""}`}>
                      {fmtEur(groupTotals.remaining)}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {filteredGroups.map(g => (
                    <TableRow
                      key={g.group}
                      className="cursor-pointer"
                      onClick={() => navigate(`/groups/${encodeURIComponent(g.group)}`)}
                    >
                      <TableCell className="font-medium max-w-72">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate" title={g.group}>{g.group}</div>
                          {g.watchStatus && g.watchStatus !== "Resolved" && (
                            <span
                              className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold shrink-0 ${
                                g.watchStatus === "Critical"
                                  ? "bg-red-600 text-white"
                                  : g.watchStatus === "Legal"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-red-100 text-red-700"
                              }`}
                              title={
                                g.watchStatus === "Critical"
                                  ? "Critical: Problematic for 30+ consecutive days — discuss on-hold / escalation"
                                  : g.watchStatus === "Legal"
                                    ? "Legal"
                                    : g.watchOverride
                                      ? "Problematic (manually set)"
                                      : "Problematic: Forecast covers less than 80% of overdue end-of-month"
                              }
                            >
                              {g.watchStatus.charAt(0)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtEur(g.openBalance)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${g.overdueBalance > 0 ? "text-red-600 font-semibold" : ""}`}>
                        {fmtEur(g.overdueBalance)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${g.overdueEomBalance > 0 ? "text-amber-600" : ""}`}>
                        {fmtEur(g.overdueEomBalance)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${g.forecastExpected > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {fmtEur(g.forecastExpected)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${g.collected > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {fmtEur(g.collected)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${g.remaining > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {fmtEur(g.remaining)}
                      </TableCell>
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                        <GroupRowActions group={g.group} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          ) : isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              No customers yet. Create one or pull them from Softone in Settings.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <SortableHead label="Open Balance" active={companySort.key === "open"} dir={companySort.dir} onClick={() => toggleCompanySort("open")} />
                  <SortableHead label="Overdue" active={companySort.key === "overdue"} dir={companySort.dir} onClick={() => toggleCompanySort("overdue")} />
                  <SortableHead label="Overdue EOM" active={companySort.key === "overdueEom"} dir={companySort.dir} onClick={() => toggleCompanySort("overdueEom")} />
                  <SortableHead label="Credit Limit" active={companySort.key === "credit"} dir={companySort.dir} onClick={() => toggleCompanySort("credit")} />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/60 font-semibold border-b-2 hover:bg-muted/60">
                  <TableCell colSpan={4}>TOTAL ({filtered.length} companies)</TableCell>
                  <TableCell className="text-right font-mono">{fmtEur(companyTotals.open)}</TableCell>
                  <TableCell className={`text-right font-mono ${companyTotals.overdue > 0 ? "text-red-600" : ""}`}>
                    {fmtEur(companyTotals.overdue)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${companyTotals.overdueEom > 0 ? "text-amber-600" : ""}`}>
                    {fmtEur(companyTotals.overdueEom)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtEur(companyTotals.credit)}</TableCell>
                </TableRow>
                {filtered.map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`${ratingColors[c.rating] ?? ""} font-mono`}
                        title={`Credit score ${c.ratingScore}/100${c.ratingFactors ? `\n${c.ratingFactors.map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`).join("\n")}` : ""}`}
                      >
                        {c.rating}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {c.onHoldStatus !== "Active" ? (
                        <Badge variant="outline" className={onHoldStatusColors[c.onHoldStatus] ?? ""}>
                          {c.onHoldStatus}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(c.openBalance)}</TableCell>
                    <TableCell className={`text-right font-mono ${c.overdueBalance > 0 ? "text-red-600 font-semibold" : ""}`}>
                      {fmtEur(c.overdueBalance)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${c.overdueEomBalance > 0 ? "text-amber-600" : ""}`}>
                      {fmtEur(c.overdueEomBalance)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{fmtEur(c.creditLimit)}</TableCell>
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

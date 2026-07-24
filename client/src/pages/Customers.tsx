import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtByCurrency, fmtEur, onHoldStatusColors, ratingColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, ArrowUpDown, Layers, Plus, Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type GroupSortKey = "companies" | "open" | "overdue" | "overdueEom" | "forecast" | "overdueCount" | "rating";
type CompanySortKey = "open" | "overdue" | "overdueEom" | "credit" | "rating";

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
  const [open, setOpen] = useState(false);
  const [groupSort, setGroupSort] = useState<{ key: GroupSortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  const [companySort, setCompanySort] = useState<{ key: CompanySortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });

  const toggleGroupSort = (key: GroupSortKey) =>
    setGroupSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const toggleCompanySort = (key: CompanySortKey) =>
    setCompanySort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const [form, setForm] = useState({
    code: "",
    name: "",
    vatNumber: "",
    email: "",
    phone: "",
    contactPerson: "",
    creditLimit: "0",
    paymentTermsDays: "30",
  });

  const create = trpc.customers.create.useMutation({
    onSuccess: () => {
      toast.success("Customer created");
      utils.customers.list.invalidate();
      setOpen(false);
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
          case "rating":
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
        (statusFilter === "normal" && g.watchStatus !== "Problematic");
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
          case "overdueCount":
            return g.overdueCount;
          case "rating":
            return g.ratingScore;
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
        (t: { companies: number; open: number; overdue: number; overdueEom: number; forecast: number; overdueCount: number }, g) => ({
          companies: t.companies + g.companyCount,
          open: t.open + g.openBalance,
          overdue: t.overdue + g.overdueBalance,
          overdueEom: t.overdueEom + g.overdueEomBalance,
          forecast: t.forecast + g.forecastExpected,
          overdueCount: t.overdueCount + g.overdueCount,
        }),
        { companies: 0, open: 0, overdue: 0, overdueEom: 0, forecast: 0, overdueCount: 0 }
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" /> New Customer
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>New Customer</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Code *</Label>
                <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="C-001" />
              </div>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>VAT Number</Label>
                <Input value={form.vatNumber} onChange={e => setForm({ ...form, vatNumber: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Person</Label>
                <Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Limit (€)</Label>
                <Input type="number" value={form.creditLimit} onChange={e => setForm({ ...form, creditLimit: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms (days)</Label>
                <Input
                  type="number"
                  value={form.paymentTermsDays}
                  onChange={e => setForm({ ...form, paymentTermsDays: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                disabled={!form.code || !form.name || create.isPending}
                onClick={() =>
                  create.mutate({
                    code: form.code,
                    name: form.name,
                    vatNumber: form.vatNumber || undefined,
                    email: form.email || undefined,
                    phone: form.phone || undefined,
                    contactPerson: form.contactPerson || undefined,
                    creditLimit: Number(form.creditLimit || 0),
                    paymentTermsDays: Number(form.paymentTermsDays || 30),
                  })
                }
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
                    <SortableHead label="Rating" active={groupSort.key === "rating"} dir={groupSort.dir} onClick={() => toggleGroupSort("rating")} />
                    <SortableHead label="Companies" active={groupSort.key === "companies"} dir={groupSort.dir} onClick={() => toggleGroupSort("companies")} />
                    <SortableHead label="Open Balance" active={groupSort.key === "open"} dir={groupSort.dir} onClick={() => toggleGroupSort("open")} />
                    <SortableHead label="Overdue" active={groupSort.key === "overdue"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdue")} />
                    <SortableHead label="Overdue EOM" active={groupSort.key === "overdueEom"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdueEom")} />
                    <SortableHead label="AI Forecast" active={groupSort.key === "forecast"} dir={groupSort.dir} onClick={() => toggleGroupSort("forecast")} />
                    <SortableHead label="Overdue Inv." active={groupSort.key === "overdueCount"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdueCount")} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/60 font-semibold border-b-2 hover:bg-muted/60">
                    <TableCell>TOTAL ({filteredGroups.length} groups)</TableCell>
                    <TableCell />
                    <TableCell className="text-right font-mono">{groupTotals.companies}</TableCell>
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
                    <TableCell className="text-right font-mono">{groupTotals.overdueCount}</TableCell>
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
                          {g.problematic && (
                            <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px] shrink-0" title={g.watchOverride === "Problematic" ? "Manually set to Problematic" : "Forecast covers less than 80% of overdue end-of-month"}>
                              Problematic
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={`${ratingColors[g.rating] ?? ""} font-mono`}
                          title={`Credit score ${g.ratingScore}/100${g.ratingFactors ? `\n${g.ratingFactors.map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`).join("\n")}` : ""}`}
                        >
                          {g.rating}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{g.companyCount}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmtEur(g.openBalance)}
                        <div className="text-[10px] text-muted-foreground">
                          {fmtByCurrency(g.openByCurrency, { skipEurOnly: true })}
                        </div>
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
                      <TableCell className="text-right font-mono">{g.overdueCount}</TableCell>
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
                  <SortableHead label="Rating" active={companySort.key === "rating"} dir={companySort.dir} onClick={() => toggleCompanySort("rating")} />
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

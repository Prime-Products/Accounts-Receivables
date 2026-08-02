import { ColResizer, useResizableColumns, type ResizableColumnsApi } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fmtEur,
  ratingColors,
  confirmationStatusColors,
  confirmationStatusLabels,
  fmtDate,
  isPromiseAmountStated,
  PROMISE_NO_AMOUNT_LABEL,
} from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronDown, Layers, Pencil, Phone, Search, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { memo } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import LogCallDialog from "@/components/LogCallDialog";
import { matchesAllTokens } from "@shared/textMatch";

type GroupSortKey = "companies" | "open" | "overdue" | "overdueEom" | "forecast" | "collected" | "remaining" | "overdueCount";

/**
 * Statuses a collector can set straight from the list, because none of them
 * implies pending work. Statuses that need a live task (Promise to Pay, Pending
 * Follow-up, Escalated) are deliberately absent — those go through Log Call so
 * the promise and its check task are created together.
 */
const REVIEW_STATUSES = [
  { value: "Kept" as const, label: "Paid — Promise Kept", hint: "Money arrived, nothing pending" },
  { value: "Broken" as const, label: "Broken", hint: "Not paying / no commitment given" },
  { value: "Not Contacted" as const, label: "Not Contacted", hint: "Clear the status and start over" },
];

/** Age of the last logged call, in whole days. */
function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}

/**
 * Contact recency for a group: when it was last called, by whom, and how many of
 * the logged calls went unanswered. Colour follows staleness so a desk scan shows
 * neglected accounts: never called → amber, over 14 days → amber, otherwise plain.
 */
const LastContactCell = memo(function LastContactCell({
  at,
  by,
  calls,
  noAnswer,
}: {
  at: number | null;
  by: string | null;
  calls: number;
  noAnswer: number;
}) {
  if (!at) {
    return (
      <span className="text-[11px] italic text-amber-600" title="No call has ever been logged for this group">
        never called
      </span>
    );
  }
  const age = daysSince(at);
  const stale = age > 14;
  return (
    <div className="min-w-0">
      <div
        className={`text-xs truncate ${stale ? "text-amber-600 font-medium" : ""}`}
        title={`Last call ${new Date(at).toLocaleString("en-GB")}${by ? ` by ${by}` : ""} · ${calls} call(s) logged${noAnswer > 0 ? `, ${noAnswer} unanswered` : ""}`}
      >
        {age === 0 ? "today" : age === 1 ? "yesterday" : `${age}d ago`}
      </div>
      {by && <div className="text-[11px] text-muted-foreground truncate">{by}</div>}
      {noAnswer > 0 && (
        <div className="text-[11px] text-muted-foreground">
          {noAnswer} unanswered
        </div>
      )}
    </div>
  );
});
type CompanySortKey = "open" | "overdue" | "overdueEom" | "credit" | "score";

/** Click-to-edit forecast cell. Saving corrects the month's forecast (expected + initial baseline). */
const EditableForecastCell = memo(function EditableForecastCell({ group, value }: { group: string; value: number }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const setForecast = trpc.forecast.setGroupForecast.useMutation({
    onSuccess: () => {
      toast.success(`Forecast updated for ${group}`);
      utils.customers.groups.invalidate();
      utils.forecast.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const save = () => {
    const amount = Number(draft.replace(",", "."));
    if (isNaN(amount) || amount < 0) {
      toast.error("Enter a valid non-negative amount");
      return;
    }
    setEditing(false);
    if (amount !== value) setForecast.mutate({ group, amount });
  };

  if (editing) {
    return (
      <Input
        autoFocus
        type="text"
        inputMode="decimal"
        className="h-7 w-24 ml-auto text-right font-mono text-sm px-1.5"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      className={`group/fc inline-flex items-center gap-1 font-mono hover:underline decoration-dotted underline-offset-2 ${
        setForecast.isPending ? "opacity-50" : ""
      } ${value > 0 ? "text-emerald-700" : "text-muted-foreground"}`}
      title="Click to correct this month's forecast"
      onClick={() => {
        setDraft(value ? String(value) : "");
        setEditing(true);
      }}
    >
      {fmtEur(value)}
      <Pencil className="h-3 w-3 opacity-0 group-hover/fc:opacity-60 shrink-0" />
    </button>
  );
});

/**
 * Clickable confirmation badge. "Promise to Pay" / "Pending Follow-up" badges with a
 * linked auto-created task open that task — never the Log Call dialog (logging a call
 * happens when resolving the task as Kept / Not paid). Statuses without a task
 * (Not Contacted / Broken / Kept) open the Log Call dialog to start a new cycle.
 */
const ConfirmationBadgeButton = memo(function ConfirmationBadgeButton({
  group,
  status,
  taskId,
  taskOverdue,
  updatedAt,
  updatedBy,
}: {
  group: string;
  status: string;
  taskId?: number | null;
  taskOverdue?: boolean;
  updatedAt?: number | null;
  updatedBy?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loadMembers, setLoadMembers] = useState(false);
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
  const taskBackedStatuses = ["Confirmed", "Pending Follow-up", "Escalated"];
  const isOverdue = !!taskOverdue && taskBackedStatuses.includes(status);
  const utils = trpc.useUtils();
  // Quick review — set a status straight from the row without creating any task.
  const review = trpc.calls.reviewStatus.useMutation({
    onSuccess: r => {
      toast.success(`Status set to ${confirmationStatusLabels[r.status] ?? r.status} — no task created.`);
      utils.customers.groups.invalidate();
      utils.customers.groupDetail.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const reviewedLabel = updatedAt
    ? `Last reviewed ${new Date(updatedAt).toLocaleDateString("en-GB")}${updatedBy ? ` by ${updatedBy}` : ""}`
    : "Never reviewed";
  return (
    <>
      {/*
        Clicking the badge always starts a call — logging a call is independent of
        tasks, so the badge never jumps into a task. The caret opens a review menu
        for recording a status directly, again without generating follow-up work.
      */}
      <div className="inline-flex items-stretch">
        <button
          type="button"
          className={`inline-flex items-center gap-1 pl-2 pr-1.5 py-1 rounded-l border border-r-0 text-xs font-medium cursor-pointer transition-transform hover:shadow-sm active:scale-[0.97] ${
            isOverdue
              ? "bg-red-100 text-red-700 border-red-300"
              : confirmationStatusColors[status] || "bg-gray-100 text-gray-700 border-gray-200"
          }`}
          title={
            isOverdue
              ? `The target date has passed. Click to log a call and update the status. ${reviewedLabel}.`
              : `Click to log a call. ${reviewedLabel}.`
          }
          onClick={() => {
            setLoadMembers(true);
            setOpen(true);
          }}
        >
          {isOverdue && <AlertTriangle className="h-3 w-3 text-red-600" />}
          {confirmationStatusLabels[status] ?? status}
          <Phone className="h-3 w-3 opacity-40" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={`inline-flex items-center px-1 rounded-r border text-xs cursor-pointer transition-transform hover:shadow-sm active:scale-[0.97] ${
                isOverdue
                  ? "bg-red-100 text-red-700 border-red-300"
                  : confirmationStatusColors[status] || "bg-gray-100 text-gray-700 border-gray-200"
              }`}
              title="Set the status directly, without creating a task"
              onClick={e => e.stopPropagation()}
            >
              <ChevronDown className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              Set status without a task
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {REVIEW_STATUSES.map(s => (
              <DropdownMenuItem
                key={s.value}
                disabled={review.isPending || status === s.value}
                onClick={() => review.mutate({ group, status: s.value })}
              >
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs font-medium">{s.label}</span>
                  <span className="text-[11px] text-muted-foreground">{s.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                setLoadMembers(true);
                setOpen(true);
              }}
            >
              <Phone className="h-3.5 w-3.5" />
              <span className="text-xs">Log a call instead…</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">{reviewedLabel}</div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {open && (
        <LogCallDialog
          group={group}
          companies={members}
          defaultCustomerId={defaultCustomerId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
});

function SortableHead({
  label,
  active,
  dir,
  onClick,
  col,
  cols,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  col?: string;
  cols?: ResizableColumnsApi;
}) {
  return (
    <TableHead className="relative text-right" style={col && cols ? cols.style(col) : undefined}>
      <button className="inline-flex items-center gap-1 hover:text-foreground justify-end w-full max-w-full pr-1" onClick={onClick}>
        <span className="truncate">{label}</span>
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
      {col && cols && <ColResizer col={col} api={cols} />}
    </TableHead>
  );
}

/** Plain (non-sortable) resizable header cell. */
function PlainHead({ label, col, cols, className }: { label?: string; col: string; cols: ResizableColumnsApi; className?: string }) {
  return (
    <TableHead className={`relative ${className ?? ""}`} style={cols.style(col)}>
      <span className="block truncate pr-1">{label}</span>
      <ColResizer col={col} api={cols} />
    </TableHead>
  );
}

const GROUP_COL_DEFAULTS: Record<string, number> = {
  group: 240,
  confirmation: 150,
  lastContact: 150,
  promised: 100,
  open: 120,
  overdue: 120,
  overdueEom: 120,
  forecast: 110,
  collected: 105,
  remaining: 105,
};

const COMPANY_COL_DEFAULTS: Record<string, number> = {
  code: 90,
  name: 300,
  score: 80,
  open: 130,
  overdue: 130,
  overdueEom: 130,
  credit: 120,
};

export default function Customers() {
  const [view, setView] = useState<"groups" | "companies">("groups");
  const { data, isLoading } = trpc.customers.list.useQuery(undefined, {
    enabled: view === "companies",
  });
  const { data: groups, isLoading: groupsLoading } = trpc.customers.groups.useQuery(undefined, {
    enabled: view === "groups",
  });
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("status");
    return p && ["problematic", "critical", "on-hold", "legal", "normal"].includes(p) ? p : "all";
  });
  const [ratingFilter, setRatingFilter] = useState<string>("all");
  /**
   * Contact recency filter: "all" | "never" | "unanswered" | "called-today" |
   * a number of days meaning "not called in N days".
   */
  const [contactFilter, setContactFilter] = useState<string>("all");
  const [confirmationFilter, setConfirmationFilter] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("conf");
    return p && ["not-contacted", "confirmed", "pending", "broken", "escalated"].includes(p) ? p : "all";
  });
  // Keep filters in sync with the URL — dashboard cards navigate here with ?status= / ?conf=
  // and the lazy useState initializers above only run on first mount.
  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    const s = params.get("status");
    if (s && ["problematic", "critical", "on-hold", "legal", "normal"].includes(s)) {
      setStatusFilter(s);
    }
    const c = params.get("conf");
    if (c && ["not-contacted", "confirmed", "pending", "broken", "escalated"].includes(c)) {
      setConfirmationFilter(c);
    }
  }, [searchStr]);
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [collectorFilter, setCollectorFilter] = useState<string>("all");
  const { data: teamMembers } = trpc.team.list.useQuery();
  const [groupSort, setGroupSort] = useState<{ key: GroupSortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  const [companySort, setCompanySort] = useState<{ key: CompanySortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  // Performance: render only the first 100 rows initially; "Show all" reveals the rest.
  const [showAllGroups, setShowAllGroups] = useState(false);
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const groupCols = useResizableColumns("customer-groups", GROUP_COL_DEFAULTS);
  const companyCols = useResizableColumns("customer-companies", COMPANY_COL_DEFAULTS);

  const toggleGroupSort = (key: GroupSortKey) =>
    setGroupSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const toggleCompanySort = (key: CompanySortKey) =>
    setCompanySort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  const now = new Date();
  const { data: forecastStatus } = trpc.forecast.smartStatus.useQuery({
    year: now.getUTCFullYear(),
    month: now.getUTCMonth() + 1,
  });
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunAck, setRerunAck] = useState(false);
  const generate = trpc.forecast.generateSmart.useMutation({
    onSuccess: r => {
      toast.success(`Forecast refreshed for ${r.customers} customers (${r.aiCount} AI, ${r.heuristicCount} statistical)`);
      utils.customers.groups.invalidate();
      utils.forecast.smartEntries.invalidate();
      utils.forecast.smartMonths.invalidate();
      utils.forecast.smartStatus.invalidate();
      setRerunOpen(false);
      setRerunAck(false);
    },
    onError: e => toast.error(e.message),
  });

  const handleRunForecast = () => {
    if (forecastStatus?.hasRun) {
      setRerunAck(false);
      setRerunOpen(true);
    } else {
      generate.mutate({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, useAi: true });
    }
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let rows = data.filter(c => {
      // Contacts-only companies (never invoiced) belong to the directory, not to collections.
      if ((c as { hasLedger?: boolean }).hasLedger === false) return false;
      // Accents, letter case and word order are handled centrally, so a Greek
      // query also finds a Latin-spelled record (and vice versa).
      const matchesSearch = matchesAllTokens(search, [c.name, c.code, (c as { customerGroup?: string | null }).customerGroup]);
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
      const matchesSearch = matchesAllTokens(search, [g.group]);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "problematic" && g.watchStatus === "Problematic") ||
        (statusFilter === "critical" && g.watchStatus === "Critical") ||
        (statusFilter === "on-hold" && g.watchStatus === "On Hold") ||
        (statusFilter === "legal" && g.watchStatus === "Legal") ||
        (statusFilter === "normal" && !g.watchStatus);
      const matchesRating = ratingFilter === "all" || g.rating === ratingFilter;
      const matchesConfirmation =
        confirmationFilter === "all" ||
        (confirmationFilter === "not-contacted" && g.confirmationStatus === "Not Contacted") ||
        (confirmationFilter === "confirmed" && g.confirmationStatus === "Confirmed") ||
        (confirmationFilter === "pending" && g.confirmationStatus === "Pending Follow-up") ||
        (confirmationFilter === "broken" && g.confirmationStatus === "Broken") ||
        (confirmationFilter === "escalated" && g.confirmationStatus === "Escalated");
      const gManager = (g as any).accountManager as { id: number; name: string } | null;
      const matchesManager =
        managerFilter === "all" ||
        (managerFilter === "unassigned" && !gManager) ||
        (managerFilter !== "unassigned" && managerFilter !== "all" && gManager?.id === Number(managerFilter));
      const gCollector = (g as any).collector as { id: number; name: string } | null;
      const matchesCollector =
        collectorFilter === "all" ||
        (collectorFilter === "unassigned" && !gCollector) ||
        (collectorFilter !== "unassigned" && collectorFilter !== "all" && gCollector?.id === Number(collectorFilter));
      const lastCallAt = (g as any).lastCallAt as number | null;
      const noAnswerCount = ((g as any).noAnswerCount as number | undefined) ?? 0;
      const ageDays = lastCallAt == null ? null : Math.floor((Date.now() - lastCallAt) / 86400000);
      const matchesContact =
        contactFilter === "all" ||
        (contactFilter === "never" && lastCallAt == null) ||
        (contactFilter === "unanswered" && noAnswerCount > 0) ||
        (contactFilter === "called-today" && ageDays === 0) ||
        // "Not called in N days" deliberately includes never-called groups: they are
        // the most overdue for a call, not an edge case to hide.
        (!Number.isNaN(Number(contactFilter)) &&
          contactFilter !== "all" &&
          !["never", "unanswered", "called-today"].includes(contactFilter) &&
          (ageDays == null || ageDays >= Number(contactFilter)));
      return (
        matchesSearch && matchesStatus && matchesRating && matchesConfirmation && matchesManager && matchesCollector && matchesContact
      );
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
  }, [groups, search, statusFilter, ratingFilter, confirmationFilter, managerFilter, collectorFilter, contactFilter, groupSort]);

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

  /** Overall summary across the filtered groups — same cards as the group view, but totals. */
  const summary = useMemo(() => {
    const s = {
      open: 0,
      openByCur: {} as Record<string, number>,
      overdue: 0,
      overdueCount: 0,
      overdueEom: 0,
      forecastCurrent: 0,
      collected: 0,
      remaining: 0,
      agingCurrent: 0,
      agingCurrentCount: 0,
      buckets: {
        "0-30": { amount: 0, count: 0 },
        "31-60": { amount: 0, count: 0 },
        "61-90": { amount: 0, count: 0 },
        "91-120": { amount: 0, count: 0 },
        "120+": { amount: 0, count: 0 },
      } as Record<"0-30" | "31-60" | "61-90" | "91-120" | "120+", { amount: number; count: number }>,
    };
    for (const g of filteredGroups) {
      s.open += g.openBalance;
      for (const [cur, amt] of Object.entries(g.openByCurrency ?? {})) {
        s.openByCur[cur] = (s.openByCur[cur] ?? 0) + amt;
      }
      s.overdue += g.overdueBalance;
      s.overdueCount += g.overdueCount;
      s.overdueEom += g.overdueEomBalance;
      s.forecastCurrent += g.forecastExpected;
      s.collected += g.collected;
      s.remaining += g.remaining;
      const aging = (g as any).aging;
      if (aging) {
        s.agingCurrent += aging.current ?? 0;
        s.agingCurrentCount += aging.currentCount ?? 0;
        for (const b of ["0-30", "31-60", "61-90", "91-120", "120+"] as const) {
          s.buckets[b].amount += aging.buckets?.[b]?.amount ?? 0;
          s.buckets[b].count += aging.buckets?.[b]?.count ?? 0;
        }
      }
    }
    return s;
  }, [filteredGroups]);

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" /> Collections Desk
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
          onClick={handleRunForecast}
        >
          <Sparkles className="h-4 w-4" />
          {generate.isPending ? "Running…" : forecastStatus?.hasRun ? "Forecast (already run)" : "Run Forecast"}
        </Button>
      </div>

      {/* Strong re-run warning: the month's forecast already exists */}
      <Dialog open={rerunOpen} onOpenChange={o => { setRerunOpen(o); if (!o) setRerunAck(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Forecast has already run this month</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              The forecast for <b>{now.toLocaleString("en-GB", { month: "long", year: "numeric" })}</b> was generated
              {forecastStatus?.generatedAt ? ` on ${new Date(forecastStatus.generatedAt).toLocaleDateString("en-GB")}` : ""} for{" "}
              <b>{forecastStatus?.groups ?? 0} groups</b>.
            </p>
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-800">
              <b>Re-running will damage the month's forecast:</b> the AI will recalculate every group's forecast with today's data,
              so it will no longer reflect the start-of-month baseline you are tracking against.
              {(forecastStatus?.adjustedCount ?? 0) > 0 && (
                <> Your {forecastStatus?.adjustedCount} manual correction(s) will be kept.</>
              )}
            </div>
            <p className="text-muted-foreground">
              If you only want to fix a group's number, edit it directly in the Forecast column instead.
            </p>
            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={rerunAck}
                onChange={e => setRerunAck(e.target.checked)}
              />
              <span>I understand that re-running will alter this month's forecast.</span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRerunOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rerunAck || generate.isPending}
              onClick={() =>
                generate.mutate({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, useAi: true, confirmRerun: true })
              }
            >
              {generate.isPending ? "Re-running…" : "Re-run anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="problematic">Problematic</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
                <SelectItem value="on-hold">On Hold</SelectItem>
                <SelectItem value="legal">Legal</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
              </SelectContent>
            </Select>
            <Select value={confirmationFilter} onValueChange={setConfirmationFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Confirmation" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All confirmations</SelectItem>
                <SelectItem value="not-contacted">Not Contacted</SelectItem>
                <SelectItem value="confirmed">Promise to Pay</SelectItem>
                <SelectItem value="pending">Pending Follow-up</SelectItem>
                <SelectItem value="broken">Broken</SelectItem>
                <SelectItem value="escalated">Escalated</SelectItem>
              </SelectContent>
            </Select>
            {/*
              Contact recency: the practical entry point for a day's calling —
              "show me who nobody has called", rather than reading the whole list.
            */}
            <Select value={contactFilter} onValueChange={setContactFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Contact" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any contact</SelectItem>
                <SelectItem value="never">Never called</SelectItem>
                <SelectItem value="7">Not called in 7 days</SelectItem>
                <SelectItem value="14">Not called in 14 days</SelectItem>
                <SelectItem value="30">Not called in 30 days</SelectItem>
                <SelectItem value="unanswered">Has unanswered attempts</SelectItem>
                <SelectItem value="called-today">Called today</SelectItem>
              </SelectContent>
            </Select>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Manager" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All managers</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {(teamMembers ?? []).map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={collectorFilter} onValueChange={setCollectorFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Collector" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collectors</SelectItem>
                <SelectItem value="unassigned">No collector</SelectItem>
                {(teamMembers ?? []).map(m => (
                  <SelectItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
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

      {view === "groups" && !groupsLoading && (
        <>
          {/* Summary KPI cards — totals across the filtered groups (same layout as group view) */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Balance</div>
                <div className="text-xl font-bold font-mono">{fmtEur(summary.open)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{filteredGroups.length} group(s)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className={`text-xl font-bold font-mono ${summary.overdue > 0 ? "text-red-600" : ""}`}>
                  {fmtEur(summary.overdue)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{summary.overdueCount} overdue invoice(s)</div>
                <div className="text-[11px] font-mono mt-0.5 text-orange-600" title="Overdue by end of the current month (today's overdue + invoices falling due until month end)">
                  EOM: {fmtEur(summary.overdueEom)}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Forecast (this month)</div>
                <div className="text-xl font-bold font-mono text-emerald-700">{fmtEur(summary.forecastCurrent)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">expected to collect this month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Paid (this month)</div>
                <div className="text-xl font-bold font-mono text-emerald-700">{fmtEur(summary.collected)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">collected within current month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Remain to Collect (this month)</div>
                <div className={`text-xl font-bold font-mono ${summary.remaining > 0 ? "text-amber-600" : ""}`}>
                  {fmtEur(summary.remaining)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">vs forecast expected this month</div>
              </CardContent>
            </Card>
          </div>

          {/* Aging totals across the filtered groups */}
          <Card>
            <CardContent className="pt-4">
              <div className="text-sm font-semibold mb-2">Aging (all groups in view)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Current (not due)</div>
                  <div className="text-lg font-bold font-mono">{fmtEur(summary.agingCurrent)}</div>
                  <div className="text-xs text-muted-foreground">{summary.agingCurrentCount} invoice(s)</div>
                </div>
                {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
                  <div key={b} className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">{b} days overdue</div>
                    <div className="text-lg font-bold font-mono">{fmtEur(summary.buckets[b].amount)}</div>
                    <div className="text-xs text-muted-foreground">{summary.buckets[b].count} invoice(s)</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

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
              <Table className="table-fixed" style={{ width: groupCols.totalWidth, minWidth: "100%" }}>
                <TableHeader>
                  <TableRow>
                    <PlainHead label="Group" col="group" cols={groupCols} />
                    <PlainHead label="Confirmation" col="confirmation" cols={groupCols} />
                    <PlainHead label="Last Contact" col="lastContact" cols={groupCols} />
                    <PlainHead label="Promised" col="promised" cols={groupCols} className="text-right" />
                    <SortableHead label="Open Balance" active={groupSort.key === "open"} dir={groupSort.dir} onClick={() => toggleGroupSort("open")} col="open" cols={groupCols} />
                    <SortableHead label="Overdue" active={groupSort.key === "overdue"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdue")} col="overdue" cols={groupCols} />
                    <SortableHead label="Overdue EOM" active={groupSort.key === "overdueEom"} dir={groupSort.dir} onClick={() => toggleGroupSort("overdueEom")} col="overdueEom" cols={groupCols} />
                    <SortableHead label="Forecast" active={groupSort.key === "forecast"} dir={groupSort.dir} onClick={() => toggleGroupSort("forecast")} col="forecast" cols={groupCols} />
                    <SortableHead label="Collected" active={groupSort.key === "collected"} dir={groupSort.dir} onClick={() => toggleGroupSort("collected")} col="collected" cols={groupCols} />
                    <SortableHead label="Remaining" active={groupSort.key === "remaining"} dir={groupSort.dir} onClick={() => toggleGroupSort("remaining")} col="remaining" cols={groupCols} />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="bg-muted/60 font-semibold border-b-2 hover:bg-muted/60">
                    <TableCell>TOTAL ({filteredGroups.length} groups)</TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
                    <TableCell></TableCell>
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
                  </TableRow>
                  {(showAllGroups ? filteredGroups : filteredGroups.slice(0, 100)).map(g => (
                    <TableRow
                      key={g.group}
                      className="cursor-pointer"
                      onClick={() => navigate(`/groups/${encodeURIComponent(g.group)}`)}
                    >
                      <TableCell className="font-medium overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <div className="truncate" title={g.group}>{g.group}</div>
                          {g.watchStatus && (
                            <span
                              className={`inline-flex items-center justify-center h-4 w-4 rounded-full text-[10px] font-bold shrink-0 ${
                                g.watchStatus === "On Hold"
                                  ? "bg-orange-500 text-white"
                                  : g.watchStatus === "Critical"
                                    ? "bg-red-600 text-white"
                                    : g.watchStatus === "Legal"
                                      ? "bg-purple-100 text-purple-700"
                                      : "bg-red-100 text-red-700"
                              }`}
                              title={
                                g.watchStatus === "Problematic"
                                  ? g.watchOverride
                                    ? "Problematic (manually set)"
                                    : "Problematic: Forecast covers less than 80% of overdue end-of-month"
                                  : g.watchStatus
                              }
                            >
                              {g.watchStatus.charAt(0)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell onClick={e => e.stopPropagation()}>
                        <ConfirmationBadgeButton
                          group={g.group}
                          status={g.confirmationStatus}
                          updatedAt={(g as any).confirmationUpdatedAt ?? null}
                          updatedBy={(g as any).confirmationUpdatedBy ?? null}
                          taskId={(g as any).confirmationTaskId}
                          taskOverdue={(g as any).confirmationTaskOverdue}
                        />
                        {(g as any).confirmationCarriedOver && (
                          <div className="text-[11px] text-amber-600 mt-1 inline-flex items-center gap-1" title="Recorded in a previous month — still active until its date">
                            <span>↻</span>
                            <span>Carried over</span>
                          </div>
                        )}
                        {g.confirmationFollowUpDate && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Follow-up: {fmtDate(g.confirmationFollowUpDate)}
                          </div>
                        )}
                      </TableCell>
                      {/*
                        Contact tracking: the whole point of logging calls is being able
                        to answer "who spoke to this customer, and when". Unanswered
                        attempts are called out separately, since a run of them means the
                        account is not really being reached at all.
                      */}
                      <TableCell className="overflow-hidden">
                        <LastContactCell
                          at={(g as any).lastCallAt ?? null}
                          by={(g as any).lastCallBy ?? null}
                          calls={(g as any).callCount ?? 0}
                          noAnswer={(g as any).noAnswerCount ?? 0}
                        />
                      </TableCell>
                      {/*
                        A promise / follow-up may legitimately carry no amount ("I'll pay",
                        no figure given). Showing €0 there reads like a zero promise, so
                        those rows say "amount not stated" instead.
                      */}
                      <TableCell
                        className={`text-right ${
                          isPromiseAmountStated(g.confirmationAmount)
                            ? "font-mono text-emerald-700"
                            : "text-[11px] italic text-muted-foreground"
                        }`}
                      >
                        {isPromiseAmountStated(g.confirmationAmount)
                          ? fmtEur(g.confirmationAmount)
                          : g.confirmationStatus === "Confirmed" || g.confirmationStatus === "Pending Follow-up"
                            ? PROMISE_NO_AMOUNT_LABEL
                            : "—"}
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
                      <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                      <EditableForecastCell group={g.group} value={g.forecastExpected} />
                    </TableCell>
                     <TableCell className={`text-right font-mono ${g.collected > 0 ? "text-emerald-700" : "text-muted-foreground"}`}>
                        {fmtEur(g.collected)}
                      </TableCell>
                      <TableCell className={`text-right font-mono ${g.remaining > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {fmtEur(g.remaining)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!showAllGroups && filteredGroups.length > 100 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={9} className="text-center py-4">
                        <span className="text-sm text-muted-foreground mr-3">
                          Showing 100 of {filteredGroups.length.toLocaleString()} groups
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setShowAllGroups(true)}>
                          Show all
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
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
            <Table className="table-fixed" style={{ width: companyCols.totalWidth, minWidth: "100%" }}>
              <TableHeader>
                <TableRow>
                  <PlainHead label="Code" col="code" cols={companyCols} />
                  <PlainHead label="Name" col="name" cols={companyCols} />
                  <SortableHead label="Rating" active={companySort.key === "score"} dir={companySort.dir} onClick={() => toggleCompanySort("score")} col="score" cols={companyCols} />
                  <SortableHead label="Open Balance" active={companySort.key === "open"} dir={companySort.dir} onClick={() => toggleCompanySort("open")} col="open" cols={companyCols} />
                  <SortableHead label="Overdue" active={companySort.key === "overdue"} dir={companySort.dir} onClick={() => toggleCompanySort("overdue")} col="overdue" cols={companyCols} />
                  <SortableHead label="Overdue EOM" active={companySort.key === "overdueEom"} dir={companySort.dir} onClick={() => toggleCompanySort("overdueEom")} col="overdueEom" cols={companyCols} />
                  <SortableHead label="Credit Limit" active={companySort.key === "credit"} dir={companySort.dir} onClick={() => toggleCompanySort("credit")} col="credit" cols={companyCols} />
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="bg-muted/60 font-semibold border-b-2 hover:bg-muted/60">
                  <TableCell colSpan={3}>TOTAL ({filtered.length} companies)</TableCell>
                  <TableCell className="text-right font-mono">{fmtEur(companyTotals.open)}</TableCell>
                  <TableCell className={`text-right font-mono ${companyTotals.overdue > 0 ? "text-red-600" : ""}`}>
                    {fmtEur(companyTotals.overdue)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${companyTotals.overdueEom > 0 ? "text-amber-600" : ""}`}>
                    {fmtEur(companyTotals.overdueEom)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{fmtEur(companyTotals.credit)}</TableCell>
                </TableRow>
                {(showAllCompanies ? filtered : filtered.slice(0, 100)).map(c => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                    <TableCell className="font-mono text-sm">{c.code}</TableCell>
                    <TableCell className="font-medium overflow-hidden">
                      <span className="block truncate" title={c.name}>{c.name}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant="outline"
                        className={`${ratingColors[c.rating] ?? ""} font-mono`}
                        title={`Credit score ${c.ratingScore}/100${c.ratingFactors ? `\n${c.ratingFactors.map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`).join("\n")}` : ""}`}
                      >
                        {c.rating}
                      </Badge>
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
                {!showAllCompanies && filtered.length > 100 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={8} className="text-center py-4">
                      <span className="text-sm text-muted-foreground mr-3">
                        Showing 100 of {filtered.length.toLocaleString()} companies
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setShowAllCompanies(true)}>
                        Show all
                      </Button>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

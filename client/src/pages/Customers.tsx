import { ColResizer, useResizableColumns, type ResizableColumnsApi } from "@/components/ResizableTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
import { collectionActionSortValue } from "@/lib/collectionStatusSort";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, BellRing, Filter, Pencil, Phone, Search, Sparkles, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { memo } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import LogCallDialog from "@/components/LogCallDialog";
import { matchesAllTokens } from "@shared/textMatch";

type GroupSortKey =
  | "companies"
  | "collectionStatus"
  | "open"
  | "overdue"
  | "overdueEom"
  | "forecast"
  | "collected"
  | "remaining"
  | "overdueCount";


/** Age of the last logged call, in whole days. */
function daysSince(ts: number): number {
  return Math.floor((Date.now() - ts) / 86400000);
}


/**
 * The date a group is waiting on, right under its status badge: the promised
 * payment date for a Promise to Pay, or the follow-up date otherwise. When that
 * date has arrived the line turns red/amber and says so — this is how the Desk
 * tells you to act, instead of a separate call-back list.
 */
const DueDateLine = memo(function DueDateLine({
  status,
  followUpDate,
  promiseDate,
  actionDate,
  actionDue,
}: {
  status: string | null;
  followUpDate: number | null;
  promiseDate: number | null;
  actionDate: number | null;
  actionDue: "today" | "overdue" | null;
}) {
  const isPromise = status === "Confirmed";
  const date = actionDate ?? (isPromise ? promiseDate : followUpDate);
  if (!date) return null;
  const label = isPromise ? "Promised" : "Follow-up";
  const days = actionDue === "overdue" ? daysSince(date) : 0;
  return (
    <div
      className={`text-xs mt-1 flex items-center gap-1 whitespace-nowrap ${
        actionDue === "overdue"
          ? "font-semibold text-red-600"
          : actionDue === "today"
            ? "font-medium text-amber-600"
            : "text-muted-foreground"
      }`}
      title={
        actionDue === "overdue"
          ? `${label} ${fmtDate(date)} — ${days} day(s) past due, log a call to move it forward`
          : actionDue === "today"
            ? `${label} ${fmtDate(date)} — due today`
            : `${label} ${fmtDate(date)}`
      }
    >
      {actionDue && <BellRing className="h-3 w-3 shrink-0" />}
      <span>
        {label}: {fmtDate(date)}
        {actionDue === "overdue" ? ` · ${days}d late` : actionDue === "today" ? " · today" : ""}
      </span>
    </div>
  );
});

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
 * Clickable confirmation badge. It only ever opens the Log Call dialog: a status is
 * the outcome of a conversation, so it is never set straight from the list. The
 * badge turns red once the promised / follow-up date has passed.
 */
const ConfirmationBadgeButton = memo(function ConfirmationBadgeButton({
  group,
  status,
  taskOverdue,
  updatedAt,
  updatedBy,
}: {
  group: string;
  status: string;
  taskOverdue?: boolean;
  updatedAt?: number | null;
  updatedBy?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [loadMembers, setLoadMembers] = useState(false);
  // Only this group's companies are fetched. The full scored customer list is
  // several megabytes, and the dialog needs three fields per member.
  const { data: groupMembers } = trpc.customers.groupMembers.useQuery({ group }, { enabled: loadMembers });
  const members = useMemo(() => groupMembers ?? [], [groupMembers]);
  const defaultCustomerId = useMemo(
    () => (members.length > 0 ? [...members].sort((a, b) => b.openBalance - a.openBalance)[0].id : undefined),
    [members]
  );
  const taskBackedStatuses = ["Confirmed", "Pending Follow-up"];
  const isOverdue = !!taskOverdue && taskBackedStatuses.includes(status);
  const reviewedLabel = updatedAt
    ? `Last reviewed ${new Date(updatedAt).toLocaleDateString("en-GB")}${updatedBy ? ` by ${updatedBy}` : ""}`
    : "Never reviewed";
  return (
    <>
      {/*
        Clicking the badge always starts a call — the only place a confirmation
        status can change, so every status carries a conversation behind it.
      */}
      <button
        type="button"
        className={`inline-flex items-center gap-1 px-2 py-1 rounded border text-xs font-medium cursor-pointer transition-transform hover:shadow-sm active:scale-[0.97] ${
          isOverdue
            ? "bg-red-100 text-red-700 border-red-300"
            : confirmationStatusColors[status] || "bg-gray-100 text-gray-700 border-gray-200"
        }`}
        title={
          isOverdue
            ? `The target date has passed. Click to log a call and update the status. ${reviewedLabel}.`
            : `Click to log a call — the status changes from there. ${reviewedLabel}.`
        }
        onClick={e => {
          e.stopPropagation();
          setLoadMembers(true);
          setOpen(true);
        }}
      >
        {isOverdue && <AlertTriangle className="h-3 w-3 text-red-600" />}
        {confirmationStatusLabels[status] ?? status}
        <Phone className="h-3 w-3 opacity-40" />
      </button>
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

/** Left-aligned sortable header cell (for text columns such as Collection Status). */
function SortableTextHead({
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
  col: string;
  cols: ResizableColumnsApi;
}) {
  return (
    <TableHead className="relative" style={cols.style(col)}>
      <button className="inline-flex items-center gap-1 hover:text-foreground w-full max-w-full pr-1" onClick={onClick}>
        <span className="truncate">{label}</span>
        {active ? (
          dir === "desc" ? <ArrowDown className="h-3 w-3 shrink-0" /> : <ArrowUp className="h-3 w-3 shrink-0" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-40 shrink-0" />
        )}
      </button>
      <ColResizer col={col} api={cols} />
    </TableHead>
  );
}

const GROUP_COL_DEFAULTS: Record<string, number> = {
  group: 240,
  confirmation: 175,
  promised: 100,
  open: 120,
  overdue: 120,
  overdueEom: 120,
  forecast: 110,
  collected: 105,
  remaining: 105,
};

export default function Customers() {
  // Collections is tracked per group only. A single company is reached from its
  // group's member list (Customer 360), never from a flat company list here.
  const { data: groups, isLoading: groupsLoading } = trpc.customers.groups.useQuery();
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
  /**
   * Action-due filter: "all" | "due" (promise/follow-up date reached, i.e. today
   * or earlier) | "overdue" (the date has already passed). This replaces the old
   * separate Call Back page — the work surfaces here.
   */
  const [dueFilter, setDueFilter] = useState<"all" | "due" | "overdue">("all");
  const [confirmationFilter, setConfirmationFilter] = useState<string>(() => {
    const p = new URLSearchParams(window.location.search).get("conf");
    return p && ["not-contacted", "confirmed", "pending", "broken"].includes(p) ? p : "all";
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
    if (c && ["not-contacted", "confirmed", "pending", "broken"].includes(c)) {
      setConfirmationFilter(c);
    }
  }, [searchStr]);
  const [managerFilter, setManagerFilter] = useState<string>("all");
  const [collectorFilter, setCollectorFilter] = useState<string>("all");
  const { data: teamMembers } = trpc.team.list.useQuery();
  const [groupSort, setGroupSort] = useState<{ key: GroupSortKey | null; dir: "asc" | "desc" }>({ key: null, dir: "desc" });
  const groupCols = useResizableColumns("customer-groups", GROUP_COL_DEFAULTS);

  const toggleGroupSort = (key: GroupSortKey) =>
    setGroupSort(s => (s.key === key ? { key, dir: s.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
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
        (confirmationFilter === "paid" && g.confirmationStatus === "Kept");
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
      const actionDue = (g as any).actionDue as "today" | "overdue" | null;
      const matchesDue =
        dueFilter === "all" ||
        (dueFilter === "due" && actionDue !== null) ||
        (dueFilter === "overdue" && actionDue === "overdue");
      return (
        matchesSearch && matchesStatus && matchesRating && matchesConfirmation && matchesManager && matchesCollector && matchesContact && matchesDue
      );
    });
    if (groupSort.key) {
      const getVal = (g: (typeof rows)[number]): number => {
        switch (groupSort.key) {
          case "companies":
            return g.companyCount;
          case "collectionStatus":
            // Sorted by the date the group is waiting on, not by status name:
            // overdue → today → upcoming (soonest first) → Not Contacted.
            return collectionActionSortValue(g as any);
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
      // The collection-status key is already "smaller = more urgent", so its
      // first click must sort ascending; amount columns keep highest-first.
      const urgencyKey = groupSort.key === "collectionStatus";
      rows = [...rows].sort((a, b) => {
        const diff = getVal(a) - getVal(b);
        const ascending = urgencyKey ? groupSort.dir === "desc" : groupSort.dir === "asc";
        return ascending ? diff : -diff;
      });
    } else {
      // No explicit sort: same date-driven order, with the largest exposure first
      // inside each date so equal-urgency rows are still ranked by money.
      rows = [...rows].sort(
        (a: any, b: any) =>
          collectionActionSortValue(a) - collectionActionSortValue(b) || b.overdueBalance - a.overdueBalance
      );
    }
    return rows;
  }, [groups, search, statusFilter, ratingFilter, confirmationFilter, managerFilter, collectorFilter, contactFilter, dueFilter, groupSort]);

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

  /**
   * Number of filters currently narrowing the desk. Surfaced with a Clear
   * button, because a filter left on from yesterday hides real work.
   */
  const deskFilterCount = useMemo(
    () =>
      [
        search.trim() !== "",
        statusFilter !== "all",
        confirmationFilter !== "all",
        contactFilter !== "all",
        dueFilter !== "all",
        managerFilter !== "all",
        collectorFilter !== "all",
        ratingFilter !== "all",
      ].filter(Boolean).length,
    [search, statusFilter, confirmationFilter, contactFilter, dueFilter, managerFilter, collectorFilter, ratingFilter],
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
        "91-119": { amount: 0, count: 0 },
        "120+": { amount: 0, count: 0 },
      } as Record<"0-30" | "31-60" | "61-90" | "91-119" | "120+", { amount: number; count: number }>,
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
        for (const b of ["0-30", "31-60", "61-90", "91-119", "120+"] as const) {
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
            Group tracking — click a group for its card with member companies
          </p>
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
          <Button
            size="sm"
            className="gap-2"
            disabled={generate.isPending}
            onClick={handleRunForecast}
          >
            <Sparkles className="h-4 w-4" />
            {generate.isPending ? "Running…" : forecastStatus?.hasRun ? "Forecast (already run)" : "Run Forecast"}
          </Button>
        </div>
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

      {/* Collections is tracked per group only (the company card is reached from a
          group's member list), so there is no view switch here — just the filters. */}
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2 min-w-72">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0 ml-0.5" />
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9 bg-background"
              placeholder="Search group…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 h-9 bg-background">
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
              <SelectTrigger className="w-44 h-9 bg-background">
                <SelectValue placeholder="Collection status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All collection statuses</SelectItem>
                <SelectItem value="not-contacted">Not Contacted</SelectItem>
                <SelectItem value="confirmed">Promise to Pay</SelectItem>
                <SelectItem value="pending">Pending Follow-up</SelectItem>
                <SelectItem value="broken">Promise Broken</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            {/*
              Contact recency: the practical entry point for a day's calling —
              "show me who nobody has called", rather than reading the whole list.
            */}
            <Select value={contactFilter} onValueChange={setContactFilter}>
              <SelectTrigger className="w-44 h-9 bg-background">
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
            {/*
              Action due: replaces the old Call Back page. A promise date or
              follow-up date that has arrived puts the group at the top of the
              Desk; this filter narrows the list to exactly those rows.
            */}
            <Select value={dueFilter} onValueChange={v => setDueFilter(v as "all" | "due" | "overdue")}>
              <SelectTrigger className="w-40 h-9 bg-background">
                <SelectValue placeholder="Action due" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any due date</SelectItem>
                <SelectItem value="due">Due today or earlier</SelectItem>
                <SelectItem value="overdue">Past due only</SelectItem>
              </SelectContent>
            </Select>
            <Select value={managerFilter} onValueChange={setManagerFilter}>
              <SelectTrigger className="w-40 h-9 bg-background">
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
              <SelectTrigger className="w-40 h-9 bg-background">
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
          <Select value={ratingFilter} onValueChange={setRatingFilter}>
            <SelectTrigger className="w-32 h-9 bg-background">
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
          {deskFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setConfirmationFilter("all");
                setContactFilter("all");
                setDueFilter("all");
                setManagerFilter("all");
                setCollectorFilter("all");
                setRatingFilter("all");
              }}
            >
              <X className="h-3.5 w-3.5" /> Clear {deskFilterCount}
            </Button>
          )}
        </div>
      </div>

      {!groupsLoading && (
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
                {(["0-30", "31-60", "61-90", "91-119", "120+"] as const).map(b => (
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
          {groupsLoading ? (
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
                    <SortableTextHead
                      label="Collection Status"
                      active={groupSort.key === "collectionStatus"}
                      dir={groupSort.dir}
                      onClick={() => toggleGroupSort("collectionStatus")}
                      col="confirmation"
                      cols={groupCols}
                    />
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
                  {filteredGroups.map(g => (
                    <TableRow
                      key={g.group}
                      className={`cursor-pointer ${
                        (g as any).actionDue === "overdue"
                          ? "bg-red-50/70 hover:bg-red-50 dark:bg-red-500/5"
                          : (g as any).actionDue === "today"
                            ? "bg-amber-50/70 hover:bg-amber-50 dark:bg-amber-500/5"
                            : ""
                      }`}
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
                          taskOverdue={(g as any).confirmationTaskOverdue}
                        />
                        {(g as any).confirmationCarriedOver && (
                          <div className="text-[11px] text-amber-600 mt-1 inline-flex items-center gap-1" title="Recorded in a previous month — still standing until a new call is logged">
                            <span>↻</span>
                            <span>Carried over</span>
                          </div>
                        )}
                        <DueDateLine
                          status={g.confirmationStatus}
                          followUpDate={g.confirmationFollowUpDate ?? null}
                          promiseDate={(g as any).confirmationPromiseDate ?? null}
                          actionDate={(g as any).actionDate ?? null}
                          actionDue={(g as any).actionDue ?? null}
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
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

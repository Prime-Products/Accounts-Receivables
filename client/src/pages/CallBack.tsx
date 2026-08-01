import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import LogCallDialog from "@/components/LogCallDialog";
import { fmtEur } from "@/lib/format";
import { PhoneCall, Phone, CalendarClock, Search, ChevronRight, PhoneOff } from "lucide-react";

type CallBackRow = {
  group: string;
  company: string | null;
  customerId: number | null;
  reason: "promise_due" | "follow_up_due" | "never_contacted";
  dueDate: number;
  daysLate: number;
  amount: number | null;
  openBalance: number;
  overdueBalance: number;
  confirmationStatus: string | null;
  promiseId: number | null;
  lastCallAt: number | null;
  lastCallBy: string | null;
  lastCallOutcome: string | null;
  lastCallNote: string | null;
  noAnswerCount: number;
};

const REASON_LABEL: Record<CallBackRow["reason"], string> = {
  promise_due: "Promise due",
  follow_up_due: "Follow-up due",
  never_contacted: "Never contacted",
};

const REASON_STYLE: Record<CallBackRow["reason"], string> = {
  promise_due: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  follow_up_due: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  never_contacted: "bg-muted text-muted-foreground border-border",
};

/** Buckets make the day's work obvious without reading dates one by one. */
function bucketOf(row: CallBackRow, todayStart: number): "overdue" | "today" | "later" | "uncontacted" {
  // Never-contacted groups have no real due date — they are a backlog, not a
  // schedule, so they get their own section instead of flooding "Today".
  if (row.reason === "never_contacted") return "uncontacted";
  if (row.dueDate < todayStart) return "overdue";
  if (row.dueDate < todayStart + 24 * 60 * 60 * 1000) return "today";
  return "later";
}

export default function CallBack() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.customers.callBackList.useQuery();
  const [search, setSearch] = useState("");
  const [callGroup, setCallGroup] = useState<{ group: string; customerId: number | null } | null>(null);
  // The never-contacted backlog is long, so it stays folded until asked for.
  const [showUncontacted, setShowUncontacted] = useState(false);
  const [todayStart] = useState(() => {
    const d = new Date();
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  });

  const rows = (data ?? []) as CallBackRow[];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      r =>
        r.group.toLowerCase().includes(q) ||
        (r.company ?? "").toLowerCase().includes(q) ||
        (r.lastCallNote ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  const buckets = useMemo(() => {
    const out = {
      overdue: [] as CallBackRow[],
      today: [] as CallBackRow[],
      later: [] as CallBackRow[],
      uncontacted: [] as CallBackRow[],
    };
    for (const r of filtered) out[bucketOf(r, todayStart)].push(r);
    return out;
  }, [filtered, todayStart]);

  const totalDue = buckets.overdue.length + buckets.today.length;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PhoneCall className="h-6 w-6" /> Call Back
          </h1>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            Who to phone today, built from the promise and follow-up dates you already recorded
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search group, company or note…"
              className="h-9 w-64 pl-8"
            />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 font-medium">Nothing scheduled</p>
          <p className="text-sm text-muted-foreground mt-1">
            No promise or follow-up date has come due, and every overdue group has been contacted.
          </p>
        </Card>
      ) : (
        <>
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{totalDue}</span> due now
            {buckets.later.length > 0 && <> · {buckets.later.length} scheduled ahead</>}
            {buckets.uncontacted.length > 0 && <> · {buckets.uncontacted.length} never contacted</>}
          </div>
          {(["overdue", "today", "later", "uncontacted"] as const).map(key =>
            buckets[key].length === 0 ? null : (
              <section key={key} className="space-y-2">
                {key === "uncontacted" ? (
                  <button
                    onClick={() => setShowUncontacted(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ChevronRight
                      className={`h-3.5 w-3.5 transition-transform duration-150 ${showUncontacted ? "rotate-90" : ""}`}
                    />
                    Never contacted ({buckets[key].length})
                  </button>
                ) : (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {key === "overdue"
                      ? `Overdue (${buckets[key].length})`
                      : key === "today"
                        ? `Today (${buckets[key].length})`
                        : `Scheduled (${buckets[key].length})`}
                  </h2>
                )}
                <div className="space-y-2">
                  {(key === "uncontacted" && !showUncontacted ? [] : buckets[key]).map(row => (
                    <CallBackCard
                      key={`${row.group}-${row.reason}-${row.dueDate}`}
                      row={row}
                      onCall={() => setCallGroup({ group: row.group, customerId: row.customerId })}
                      onOpen={() => navigate(`/groups/${encodeURIComponent(row.group)}`)}
                    />
                  ))}
                </div>
              </section>
            )
          )}
        </>
      )}

      {callGroup && (
        <LogCallDialog
          group={callGroup.group}
          defaultCustomerId={callGroup.customerId ?? undefined}
          open={!!callGroup}
          onOpenChange={o => {
            if (!o) setCallGroup(null);
          }}
        />
      )}
    </div>
  );
}

function CallBackCard({
  row,
  onCall,
  onOpen,
}: {
  row: CallBackRow;
  onCall: () => void;
  onOpen: () => void;
}) {
  return (
    <Card className="p-3 hover:border-primary/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onOpen}
              className="font-medium text-sm hover:underline text-left truncate max-w-[22rem]"
            >
              {row.group}
            </button>
            <Badge variant="outline" className={`text-[10px] ${REASON_STYLE[row.reason]}`}>
              {REASON_LABEL[row.reason]}
            </Badge>
            {row.daysLate > 0 && (
              <span className="text-[11px] font-medium text-red-600 dark:text-red-400">
                {row.daysLate}d late
              </span>
            )}
            {row.noAnswerCount > 0 && (
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <PhoneOff className="h-3 w-3" />
                {row.noAnswerCount} unanswered
              </span>
            )}
          </div>
          {row.company && row.reason === "promise_due" && (
            <div className="text-[11px] text-muted-foreground mt-0.5 truncate">{row.company}</div>
          )}
          <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {row.reason !== "never_contacted" && (
              <span>
                Due {new Date(row.dueDate).toLocaleDateString()}
                {row.amount != null && <> · promised {fmtEur(row.amount)}</>}
              </span>
            )}
            <span>Overdue {fmtEur(row.overdueBalance)}</span>
            {row.lastCallAt && (
              <span>
                Last call {new Date(row.lastCallAt).toLocaleDateString()}
                {row.lastCallBy && <> by {row.lastCallBy}</>}
              </span>
            )}
          </div>
          {row.lastCallNote && (
            <p className="text-xs mt-1.5 rounded-md bg-muted/50 px-2 py-1.5 whitespace-pre-wrap">
              {row.lastCallNote}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Button size="sm" className="h-8 gap-1.5" onClick={onCall}>
            <Phone className="h-3.5 w-3.5" /> Log call
          </Button>
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={onOpen}>
            Open card <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

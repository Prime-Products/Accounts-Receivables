import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import CollectionNotesBox from "@/components/CollectionNotesBox";
import LogCallDialog from "@/components/LogCallDialog";
import SendEmailDialog from "@/components/SendEmailDialog";
import { CommunicationPanel, CommunicationToggle, useCommunicationPanel } from "@/components/CommunicationPanel";
import { buildTimeline } from "@/lib/timeline";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { PeopleRow } from "@/components/PeopleRow";
import { InvoicesTable } from "@/components/InvoicesTable";
import { VesselLink } from "@/components/VesselLink";
import { hideSettled, countSettled, matchesStatusFilter } from "@/lib/invoiceFilters";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, ratingColors, confirmationStatusColors, confirmationStatusLabels } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, ArrowLeft, Banknote, Eye, EyeOff, FileDown, FileMinus2, Filter, HandCoins, HelpCircle, Layers, Mail, Pencil, Phone, Plus, Trash2, History, MoreVertical } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import InstallmentToggle from "@/components/InstallmentToggle";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

const AGING_BUCKETS = ["all", "0-30", "31-60", "61-90", "91-120", "120+"] as const;
type AgingBucket = (typeof AGING_BUCKETS)[number];

/** Click-to-edit forecast amount on the group card. Saving corrects the month's forecast (expected + initial baseline). */
function EditableGroupForecast({ group, value, reasoning }: { group: string; value: number; reasoning?: string | null }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const utils = trpc.useUtils();
  const setForecast = trpc.forecast.setGroupForecast.useMutation({
    onSuccess: () => {
      toast.success("Forecast updated");
      utils.customers.groupForecast.invalidate();
      utils.customers.groupDetail.invalidate();
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
        className="h-8 w-32 font-mono text-lg px-2"
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
      className={`group/gfc inline-flex items-center gap-1.5 text-xl font-bold font-mono text-emerald-700 hover:underline decoration-dotted underline-offset-4 ${
        setForecast.isPending ? "opacity-50" : ""
      }`}
      title={reasoning ? `${reasoning}\n\nClick to correct this month's forecast` : "Click to correct this month's forecast"}
      onClick={() => {
        setDraft(value ? String(value) : "");
        setEditing(true);
      }}
    >
      {fmtEur(value)}
      <Pencil className="h-3.5 w-3.5 opacity-30 group-hover/gfc:opacity-70 shrink-0" />
    </button>
  );
}

/**
 * Group-level actions. The four everyday actions sit side by side next to Log
 * Call instead of hiding in a menu: a collector should see what they can do
 * without opening anything first. Notes are deliberately absent — they belong
 * in Collection Notes on the card, which is where the user keeps them.
 */
function ActionsMenu({
  companies,
  defaultCustomerId,
  group,
}: {
  companies: { id: number; name: string }[];
  defaultCustomerId?: number;
  group: string;
}) {
  const [taskOpen, setTaskOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [askOpen, setAskOpen] = useState(false);
  // `?logCall=1` opens the Log Call dialog straight away, so a call can be
  // logged from a link (e.g. from a task reminder) without extra clicks.
  const [callOpen, setCallOpen] = useState(
    () => new URLSearchParams(window.location.search).get("logCall") === "1",
  );

  return (
    <>
      {/* Log Call — primary standalone action */}
      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={() => setCallOpen(true)}>
        <Phone className="h-4 w-4" /> Log Call
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEmailOpen(true)}>
        <Mail className="h-4 w-4" /> Send Email
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setTaskOpen(true)}>
        <Plus className="h-4 w-4" /> New Task
      </Button>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAskOpen(true)}>
        <HelpCircle className="h-4 w-4" /> Ask for help
      </Button>

      <NewTaskDialog
        customerIds={companies.map(c => c.id)}
        defaultCustomerId={defaultCustomerId}
        hideCustomerPicker
        trigger={<Button className="hidden">Hidden</Button>}
        open={taskOpen}
        onOpenChange={setTaskOpen}
      />

      <SendEmailDialog
        companies={companies}
        defaultCustomerId={defaultCustomerId}
        groupName={group}
        open={emailOpen}
        onOpenChange={setEmailOpen}
      />

      {/*
       * "Ask for help" is the same New Task dialog, pre-typed as Help — one flow,
       * one place to look. No parallel question mechanism to learn.
       */}
      <NewTaskDialog
        customerIds={companies.map(c => c.id)}
        defaultCustomerId={defaultCustomerId}
        hideCustomerPicker
        defaultType="Help"
        defaultTitle={`Help needed: ${group}`}
        trigger={<Button className="hidden">Hidden</Button>}
        open={askOpen}
        onOpenChange={setAskOpen}
      />

      {callOpen && (
        <LogCallDialog
          group={group}
          companies={companies}
          defaultCustomerId={defaultCustomerId}
          open={callOpen}
          onOpenChange={setCallOpen}
        />
      )}
    </>
  );
}

/** Shared company picker for group-level action dialogs. */
function CompanyPicker({
  companies,
  value,
  onChange,
}: {
  companies: { id: number; name: string }[];
  value: number | null;
  onChange: (id: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Company</Label>
      <Select value={value ? String(value) : undefined} onValueChange={v => onChange(Number(v))}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select company…" />
        </SelectTrigger>
        <SelectContent>
          {companies.map(c => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Clickable confirmation-status badge for the group header.
 *
 * Logging a call is independent of tasks (user requirement 2/8), so the badge
 * always opens Log Call — it never redirects into a task. The red state is kept as
 * a pure warning that the target date has passed.
 */
function GroupConfirmationBadge({
  group,
  companies,
  status,
  taskId,
  taskOverdue,
}: {
  group: string;
  companies: { id: number; name: string }[];
  status: string;
  taskId: number | null;
  taskOverdue?: boolean;
}) {
  const [callOpen, setCallOpen] = useState(false);
  const taskBacked = status === "Pending Follow-up" || status === "Confirmed";
  const isOverdue = !!taskOverdue && taskBacked;
  return (
    <>
      <button
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:opacity-80 ${
          isOverdue
            ? "bg-red-100 text-red-700 border-red-300"
            : confirmationStatusColors[status] || "bg-gray-100 text-gray-700 border-gray-200"
        }`}
        title={
          isOverdue
            ? "The target date has passed. Click to log a call and update the status."
            : "Click to log a call and change the confirmation status"
        }
        onClick={() => setCallOpen(true)}
      >
        {isOverdue && <AlertTriangle className="h-3 w-3 text-red-600" />}
        {confirmationStatusLabels[status] ?? status}
        <Phone className="h-3 w-3 opacity-40" />
      </button>
      {callOpen && (
        <LogCallDialog group={group} companies={companies} open={callOpen} onOpenChange={setCallOpen} />
      )}
    </>
  );
}

/** Human-readable "how long ago" for the last-contact line. */
function relativeDays(ts: number): string {
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  };
  const days = Math.round((startOf(Date.now()) - startOf(ts)) / dayMs);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "about a month ago" : `${months} months ago`;
}

/**
 * "When did we last speak to them?" — the first question a collector asks when
 * opening a card, so it sits directly under the title with the note in the tooltip.
 */
function LastContactLine({
  data,
}: {
  data: { lastCallAt?: number | null; lastCallBy?: string | null; lastCallOutcome?: string | null; lastCallNote?: string | null; callCount?: number; noAnswerCount?: number };
}) {
  if (!data.lastCallAt) {
    return (
      <p className="text-xs text-amber-600 mt-0.5">Never contacted — no call has been logged for this group</p>
    );
  }
  const when = new Date(data.lastCallAt).toLocaleDateString("en-GB");
  return (
    <p
      className="text-xs text-muted-foreground mt-0.5"
      title={[
        `${when}${data.lastCallBy ? ` — ${data.lastCallBy}` : ""}`,
        data.lastCallOutcome ?? null,
        data.lastCallNote ?? null,
      ]
        .filter(Boolean)
        .join("\n")}
    >
      Last contact: {relativeDays(data.lastCallAt)}
      {data.lastCallBy ? ` — ${data.lastCallBy}` : ""}
      {data.callCount ? ` · ${data.callCount} call${data.callCount === 1 ? "" : "s"} logged` : ""}
      {data.noAnswerCount ? ` · ${data.noAnswerCount} no answer` : ""}
      {data.lastCallNote ? (
        <span className="ml-1 italic truncate inline-block max-w-[520px] align-bottom">“{data.lastCallNote}”</span>
      ) : null}
    </p>
  );
}

/**
 * "Log call" button for the communication timeline header. Opens the call dialog
 * directly: a call is a record of a conversation and is never gated by a task.
 */
function TimelineLogCallButton({
  group,
  companies,
  defaultCustomerId,
}: {
  group: string;
  companies: { id: number; name: string }[];
  defaultCustomerId?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setOpen(true)}>
        <Phone className="h-3.5 w-3.5" /> Log call
      </Button>
      {open && (
        <LogCallDialog
          group={group}
          companies={companies}
          defaultCustomerId={defaultCustomerId}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

function GroupPromiseDialog({ companies, defaultCustomerId, open: externalOpen, onOpenChange }: { companies: { id: number; name: string }[]; defaultCustomerId?: number; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const utils = trpc.useUtils();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (newOpen: boolean) => {
    if (externalOpen !== undefined) {
      onOpenChange?.(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  };
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);
  const [form, setForm] = useState({ amount: "", date: "", notes: "" });
  const addPromise = trpc.forecast.addPromise.useMutation({
    onSuccess: () => {
      toast.success("Promise-to-pay recorded");
      utils.customers.invalidate();
      utils.forecast.invalidate();
      setOpen(false);
      setForm({ amount: "", date: "", notes: "" });
    },
    onError: e => toast.error(e.message),
  });
  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o);
        if (o) setCustomerId(defaultCustomerId ?? null);
      }}
    >
      {externalOpen === undefined && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <HandCoins className="h-4 w-4" /> Promise-to-Pay
          </Button>
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Promise-to-Pay</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Amount (€) — optional</Label>
            <Input
              type="number"
              placeholder="leave empty if not stated"
              value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Promised date</Label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!customerId || !form.date || addPromise.isPending}
            onClick={() =>
              addPromise.mutate({
                customerId: customerId!,
                amount: form.amount ? Number(form.amount) : 0,
                promisedDate: new Date(form.date).getTime(),
                notes: form.notes || undefined,
              })
            }
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupDetail() {
  const [, params] = useRoute("/groups/:name");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const group = decodeURIComponent(params?.name ?? "");
  const [companyId, setCompanyId] = useState<string>("all");
  const [branch, setBranch] = useState<string>("all");
  const [agingFilter, setAgingFilter] = useState<AgingBucket>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [invoiceView, setInvoiceView] = useState<"list" | "byBranch" | "byVessel">("list");
  /** When set from the By vessel view, the list shows only this vessel's invoices ("none" = no vessel). */
  const [vesselDrill, setVesselDrill] = useState<string>("all");
  const [installmentFilter, setInstallmentFilter] = useState<"all" | "installments">("all");
  // Credit-note toggle: when on, the transactions list shows only credit notes.
  const [creditOnly, setCreditOnly] = useState(false);
  // Payments toggle: when on, the transactions list shows only remittances.
  const [paymentsOnly, setPaymentsOnly] = useState(false);
  // The transactions list is a collection worklist, so settled invoices are hidden
  // by default; the toggle brings them back for reconciliation/history checks.
  const [showPaid, setShowPaid] = useState(false);

  // Convert aging bucket to minDaysOverdue for queries
  const getMinDaysOverdue = (bucket: AgingBucket): number | undefined => {
    if (bucket === "all") return undefined;
    if (bucket === "0-30") return 0;
    if (bucket === "31-60") return 31;
    if (bucket === "61-90") return 61;
    if (bucket === "91-120") return 91;
    if (bucket === "120+") return 120;
    return undefined;
  };



  const query = useMemo(
    () => ({
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
    }),
    [group, companyId, branch],
  );
  const { data, isLoading } = trpc.customers.groupDetail.useQuery(query, { enabled: !!group });
  const { data: groupForecast } = trpc.customers.groupForecast.useQuery({ group }, { enabled: !!group });
  /**
   * Everything that ever happened with this group, in one place. The sources are
   * fetched at page level so both the timeline and the "Group activity" tabs
   * below share one round trip.
   */
  const { data: groupActivity, isLoading: activityLoading } = trpc.customers.groupActivity.useQuery(
    { group },
    { enabled: !!group },
  );
  const { data: groupNoteRows } = trpc.customers.groupNotes.useQuery({ group }, { enabled: !!group });
  const timelineEntries = useMemo(
    () =>
      buildTimeline({
        activityLogs: data?.activityLogs as any,
        emails: groupActivity?.emails as any,
        tasks: groupActivity?.tasks as any,
        receipts: groupActivity?.receipts as any,
        notes: groupNoteRows as any,
      }),
    [data?.activityLogs, groupActivity, groupNoteRows],
  );

  /** Show/hide the communication side panel; the choice is remembered per user. */
  const commPanel = useCommunicationPanel();

  /** Bucket an overdue invoice by days overdue (same rule as the Invoices page). */
  const bucketOf = (dueDate: number, now: number): "0-30" | "31-60" | "61-90" | "91-120" | "120+" | null => {
    if (now <= dueDate) return null;
    const d = Math.floor((now - dueDate) / (24 * 60 * 60 * 1000));
    if (d <= 30) return "0-30";
    if (d <= 60) return "31-60";
    if (d <= 90) return "61-90";
    if (d <= 120) return "91-120";
    return "120+";
  };

  // Full aging of the current scope — always computed over ALL invoices so the cards
  // keep showing every bucket's totals regardless of the selected filter (like Invoices page).
  const computedAging = useMemo(() => {
    if (!data?.invoices) return null;
    const mk = () => ({ amount: 0, count: 0, byCur: {} as Record<string, number> });
    const buckets: Record<"0-30" | "31-60" | "61-90" | "91-120" | "120+", ReturnType<typeof mk>> = {
      "0-30": mk(),
      "31-60": mk(),
      "61-90": mk(),
      "91-120": mk(),
      "120+": mk(),
    };
    let current = 0;
    let currentCount = 0;
    const now = Date.now();
    for (const inv of data.invoices) {
      if (inv.status === "Paid") continue;
      const outstandingEur = Number(inv.amountEur ?? inv.amount) - Number(inv.paidAmount) * (Number(inv.amountEur ?? inv.amount) / Math.max(Number(inv.amount), 0.01));
      const outstandingRaw = Number(inv.amount) - Number(inv.paidAmount);
      if (outstandingRaw <= 0) continue;
      const b = bucketOf(inv.dueDate, now);
      if (b === null) {
        current += outstandingEur;
        currentCount += 1;
        continue;
      }
      buckets[b].amount += outstandingEur;
      buckets[b].count += 1;
      const cur = (inv.currency ?? "EUR").toUpperCase();
      buckets[b].byCur[cur] = (buckets[b].byCur[cur] ?? 0) + outstandingRaw;
    }
    return { buckets, current, currentCount };
  }, [data?.invoices]);

  // Invoices matching the selected status + aging bucket — powers the list and totals row.
  const filteredInvoices = useMemo(() => {
    if (!data?.invoices) return [];
    if (creditOnly || paymentsOnly) return [];
    const now = Date.now();
    return data.invoices.filter(inv => {
      if (hideSettled(inv as any, showPaid, statusFilter)) return false;
      if (!matchesStatusFilter(inv as any, statusFilter)) return false;
      if (installmentFilter === "installments" && !(inv as any).isContractInstallment) return false;
      if (vesselDrill !== "all") {
        const vid = ((inv as any).vesselId ?? null) as number | null;
        if (vesselDrill === "none" ? vid != null : String(vid ?? "") !== vesselDrill) return false;
      }
      if (agingFilter !== "all") {
        if (inv.status === "Paid") return false;
        if (Number(inv.amount) - Number(inv.paidAmount) <= 0) return false;
        if (bucketOf(inv.dueDate, now) !== agingFilter) return false;
      }
      return true;
    });
  }, [data?.invoices, agingFilter, statusFilter, installmentFilter, showPaid, vesselDrill, creditOnly, paymentsOnly]);

  /**
   * Credit notes shown inside the transactions list. They follow the vessel
   * drill-down (a credit note can concern a vessel) but not the invoice-only
   * filters (status, aging bucket, installments), which would otherwise hide them
   * silently.
   */
  const allCreditNotes = ((data as any)?.openCreditNotes ?? []) as any[];
  /**
   * True while a filter that only makes sense for invoices (status, aging bucket,
   * installments) is narrowing the list. Credit notes and payments carry none of
   * those attributes, so they cannot honour such a filter.
   */
  const invoiceOnlyFilterActive =
    installmentFilter === "installments" || statusFilter !== "all" || agingFilter !== "all";
  const visibleCreditNotes = useMemo(() => {
    if (allCreditNotes.length === 0) return [];
    if (paymentsOnly) return [];
    if (!creditOnly && invoiceOnlyFilterActive) return [];
    if (vesselDrill !== "all") {
      return allCreditNotes.filter(c => {
        const name = c.vesselName ?? null;
        if (vesselDrill === "none") return name == null;
        return String(c.vesselId ?? "") === vesselDrill;
      });
    }
    return allCreditNotes;
  }, [allCreditNotes, creditOnly, paymentsOnly, invoiceOnlyFilterActive, vesselDrill]);

  /**
   * Payments (customer remittances) shown inside the same transactions list —
   * including ones already matched in full, which appear as "Matched" so the group
   * card is a complete record of the money received. A payment has no vessel or
   * aging bucket, so the invoice-only filters hide them rather than showing a
   * misleading subset.
   */
  const allTransfers = ((data as any)?.openTransfers ?? []) as any[];
  /** Payments that still have money sitting on account (nothing matched yet, or a remainder). */
  const openTransferCount = allTransfers.filter(t => !(t.settled ?? t.unallocated <= 0.005)).length;
  const visibleTransfers = useMemo(() => {
    if (allTransfers.length === 0) return [];
    if (creditOnly) return [];
    if (!paymentsOnly && (invoiceOnlyFilterActive || vesselDrill !== "all")) return [];
    return allTransfers;
  }, [allTransfers, creditOnly, paymentsOnly, invoiceOnlyFilterActive, vesselDrill]);

  /**
   * Switching to a credit-notes-only or payments-only view drops the invoice-only
   * filters, so the toggle always shows the full set instead of an empty table.
   */
  const clearInvoiceOnlyFilters = () => {
    setStatusFilter("all");
    setAgingFilter("all");
    setInstallmentFilter("all");
  };
  const toggleCreditOnly = () => {
    setPaymentsOnly(false);
    setCreditOnly(v => {
      if (!v) clearInvoiceOnlyFilters();
      return !v;
    });
  };
  const togglePaymentsOnly = () => {
    setCreditOnly(false);
    setPaymentsOnly(v => {
      if (!v) clearInvoiceOnlyFilters();
      return !v;
    });
  };

  /** How many settled invoices are currently being hidden (for the toggle label). */
  const paidHiddenCount = useMemo(() => {
    if (!data?.invoices) return 0;
    return countSettled(data.invoices as any);
  }, [data?.invoices]);

  /**
   * Contract installments in the current scope, and how many of them the other
   * active filters are keeping off screen. The toggle needs both so it can show
   * a count, disable itself at zero and warn when the rows exist but are hidden.
   */
  const installmentCounts = useMemo(() => {
    const rows = (data?.invoices ?? []) as any[];
    const all = rows.filter(i => i.isContractInstallment);
    if (all.length === 0) return { total: 0, hidden: 0 };
    const now = Date.now();
    const visible = all.filter(inv => {
      if (hideSettled(inv, showPaid, statusFilter)) return false;
      if (!matchesStatusFilter(inv, statusFilter)) return false;
      if (vesselDrill !== "all") {
        const vid = (inv.vesselId ?? null) as number | null;
        if (vesselDrill === "none" ? vid != null : String(vid ?? "") !== vesselDrill) return false;
      }
      if (agingFilter !== "all") {
        if (inv.status === "Paid") return false;
        if (Number(inv.amount) - Number(inv.paidAmount) <= 0) return false;
        if (bucketOf(inv.dueDate, now) !== agingFilter) return false;
      }
      return true;
    });
    return { total: all.length, hidden: all.length - visible.length };
  }, [data?.invoices, showPaid, statusFilter, vesselDrill, agingFilter]);

  /** Human label for the active vessel drill-down chip. */
  const vesselDrillLabel = useMemo(() => {
    if (vesselDrill === "all") return "";
    if (vesselDrill === "none") return "No vessel";
    const hit = (data?.invoices ?? []).find(i => String((i as any).vesselId ?? "") === vesselDrill);
    return ((hit as any)?.vesselName as string | undefined) ?? "Vessel";
  }, [vesselDrill, data?.invoices]);

  /** Totals of the currently filtered invoice list: EUR + per-currency (like Invoices page). */
  const filteredTotals = useMemo(() => {
    let eurTotal = 0;
    const byCur: Record<string, number> = {};
    for (const i of filteredInvoices) {
      if (i.status === "Paid") continue;
      const raw = Number(i.amount) - Number(i.paidAmount);
      if (raw <= 0) continue;
      const ratio = Number(i.amount) > 0 ? Number(i.amountEur ?? i.amount) / Number(i.amount) : 1;
      eurTotal += raw * ratio;
      const cur = (i.currency ?? "EUR").toUpperCase();
      byCur[cur] = (byCur[cur] ?? 0) + raw;
    }
    return { eurTotal, byCur, count: filteredInvoices.length };
  }, [filteredInvoices]);

  const exportSoa = trpc.reports.export.useMutation({
    onSuccess: r => {
      downloadBase64(r.filename, r.mimeType, r.base64);
      toast.success("Group Statement of Account downloaded");
    },
    onError: e => toast.error(e.message),
  });
  const doExport = (format: "pdf" | "xlsx") =>
    exportSoa.mutate({
      report: "soa-group",
      format,
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
      minDaysOverdue: getMinDaysOverdue(agingFilter),
    });

  const scopeLabel =
    companyId === "all" && branch === "all" && agingFilter === "all" && statusFilter === "all"
      ? "Whole group"
      : [
          companyId !== "all" ? data?.companies.find(c => String(c.id) === companyId)?.name : null,
          branch !== "all" ? branchShort(branch) : null,
          statusFilter !== "all" ? statusFilter : null,
          agingFilter !== "all" ? `${agingFilter} days overdue` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  const defaultActionCustomerId =
    companyId !== "all"
      ? Number(companyId)
      : data
        ? [...data.companies].sort((a, b) => Number(b.openBalance ?? 0) - Number(a.openBalance ?? 0))[0]?.id
        : undefined;

  if (!group) return null;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4" /> Collections Desk
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6" /> {group}
              {data?.rating && (
                <Badge
                  variant="outline"
                  className={`${ratingColors[data.rating.rating] ?? ""} font-mono text-sm`}
                  title={`Credit score ${data.rating.score}/100\n${data.rating.factors.map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`).join("\n")}`}
                >
                  {data.rating.rating} · {data.rating.score}
                </Badge>
              )}
              {data && <WatchStatusSelect group={group} effective={data.watchStatus ?? null} />}
              {data && (data as any).confirmationStatus && (
                <GroupConfirmationBadge
                  group={group}
                  companies={data.companies}
                  status={(data as any).confirmationStatus}
                  taskId={(data as any).confirmationTaskId ?? null}
                  taskOverdue={(data as any).confirmationTaskOverdue ?? false}
                />
              )}
              {data && (data as any).confirmationCarriedOver && (
                <span
                  className="text-[11px] text-amber-600 font-normal inline-flex items-center gap-1"
                  title="Recorded in a previous month — still standing until a new call is logged"
                >
                  ↻ Carried over
                </span>
              )}
              {/*
               * Who is on this account, inline after the status badges: small
               * avatars with the first name only, so ownership costs no vertical
               * space on a card that is already dense with figures.
               */}
              {data && (
                <span className="ml-1 border-l pl-2 text-base font-normal">
                  <PeopleRow
                    manager={(data as any).accountManager ?? null}
                    collector={(data as any).collector ?? null}
                    watchers={(data as any).watchers ?? []}
                    watcherGroupName={group}
                    groupName={group}
                  />
                </span>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Group card — {data ? `${data.companies.length} companies` : "…"} · showing: {scopeLabel}
            </p>
            {data && <LastContactLine data={data as any} />}
          </div>
        </div>
        {/*
         * The toolbar is read in three clusters, each in its own tinted group so
         * the eye can find them without reading every label: what I DO with this
         * customer, what I TAKE AWAY (exports/summary), and what I SEE (filters).
         */}
        <div className="flex items-start gap-2 flex-wrap">
          {data && data.companies.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
              <ActionsMenu
                key={companyId}
                companies={data.companies}
                defaultCustomerId={defaultActionCustomerId}
                group={group}
              />
            </div>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1">
            <Button variant="outline" size="sm" className="gap-1.5 bg-background" onClick={() => doExport("pdf")} disabled={exportSoa.isPending}>
              <FileDown className="h-4 w-4" /> SOA PDF
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 bg-background" onClick={() => doExport("xlsx")} disabled={exportSoa.isPending}>
              <FileDown className="h-4 w-4" /> SOA Excel
            </Button>
            <CommunicationToggle open={commPanel.open} onToggle={commPanel.toggle} count={timelineEntries.length} />
          </div>
          <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1 pl-2">
            <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger className="w-56 h-8 bg-background text-xs">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All companies (group)</SelectItem>
                {(data?.companies ?? []).map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="w-36 h-8 bg-background text-xs">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(data?.branches ?? []).map(b => (
                  <SelectItem key={b} value={b}>
                    {branchShort(b)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/*
       * The group card is a receivables card, full stop: no top-level tabs. The
       * directory record lives in the Address Book, so nothing here competes
       * with the money view.
       */}
      <div className="mt-4 space-y-4">
      {/*
       * One uninterrupted money flow at full width: KPIs → notes → aging →
       * transactions. The communication history floats above the page in a
       * movable window, so it never reflows or squeezes these figures.
       */}
      <div className="space-y-4">
      {isLoading || !data ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : (
        <>
          {/* KPI cards for current scope */}
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Balance</div>
                <div
                  className="text-xl font-bold font-mono"
                  title={[
                    `Open invoices: ${fmtEur(data.totals.openBalance)}`,
                    ((data.totals as any).unallocatedPayments ?? 0) > 0.005
                      ? `Payments on account (unmatched): −${fmtEur((data.totals as any).unallocatedPayments)}`
                      : null,
                    ((data.totals as any).openCreditNotes ?? 0) > 0.005
                      ? `Open credit notes: −${fmtEur((data.totals as any).openCreditNotes)}`
                      : null,
                    fmtByCurrency(data.totals.openByCurrency, { skipEurOnly: true })
                      ? `By currency: ${fmtByCurrency(data.totals.openByCurrency, { skipEurOnly: true })}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                >
                  {fmtEur((data.totals as any).netOpenBalance ?? data.totals.openBalance)}
                </div>
                {/* Only the net balance and next month's exposure are shown; the
                    invoice / on-account / credit-note breakdown lives in the
                    tooltip so the card stays readable at a glance. */}
                <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
                  <span className="text-[11px] text-muted-foreground">Due next month</span>
                  <span className="text-[11px] font-mono font-medium" title="Open invoices falling due within the next calendar month">
                    {fmtEur((data.totals as any).dueNextMonth ?? 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className={`text-xl font-bold font-mono ${data.totals.overdueBalance > 0 ? "text-red-600" : ""}`}>
                  {fmtEur(data.totals.overdueBalance)}
                </div>
                {/* Secondary amount gets the same weight and layout as the
                    Open Balance card: a labelled row under a divider, so the
                    number is readable instead of a faint coloured line. */}
                <div
                  className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5"
                  title="Overdue by end of the current month (today's overdue + invoices falling due until month end)"
                >
                  <span className="text-[11px] text-muted-foreground">
                    End of month · {data.totals.overdueCount} inv.
                  </span>
                  <span className="text-[11px] font-mono font-medium">{fmtEur(data.overdueEomBalance)}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Forecast (this month)</div>
                {groupForecast && (groupForecast as any).hasForecast !== false ? (
                  <>
                    <EditableGroupForecast group={group} value={groupForecast.expectedAmount} reasoning={groupForecast.aiReasoning} />
                    <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
                      <span className="text-[11px] text-muted-foreground">Expected to collect</span>
                      <span className="text-[11px] font-mono font-medium">
                        {fmtEur((data as any).expectedToCollect ?? groupForecast.expectedAmount)}
                      </span>
                    </div>
                    {(() => {
                      const variance =
                        (data as any).expectedVariance ??
                        ((data as any).expectedToCollect ?? groupForecast.expectedAmount) - groupForecast.expectedAmount;
                      return (
                        <div className="mt-1 flex items-baseline justify-between gap-2" title="Expected to Collect vs Forecast">
                          <span className="text-[11px] text-muted-foreground">vs forecast</span>
                          <span className={`text-[11px] font-mono font-medium ${variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            {variance >= 0 ? "+" : ""}
                            {fmtEur(variance)}
                          </span>
                        </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="mt-1">
                    <EditableGroupForecast group={group} value={0} />
                    <div className="text-[11px] text-muted-foreground mt-0.5">No forecast yet — click to set one</div>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Paid (this month)</div>
                <div className="text-xl font-bold font-mono text-emerald-700">
                  {groupForecast ? fmtEur(groupForecast.collected) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">collected within current month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Remain to Collect (this month)</div>
                <div className={`text-xl font-bold font-mono ${groupForecast && groupForecast.remaining > 0 ? "text-amber-600" : ""}`}>
                  {groupForecast && (groupForecast as any).hasForecast !== false ? fmtEur(groupForecast.remaining) : "—"}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">vs forecast expected this month</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Turnover (up to day)</div>
                <div className="text-xl font-bold font-mono text-blue-700">
                  {data.totals.turnoverYtd > 0 ? fmtEur(data.totals.turnoverYtd) : "—"}
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2 border-t pt-1.5">
                  <span className="text-[11px] text-muted-foreground">
                    Last year
                    {data.totals.turnoverYtd > 0 && data.totals.turnoverLastYear > 0 && (
                      <span className={data.totals.turnoverYtd >= data.totals.turnoverLastYear ? "text-emerald-600" : "text-amber-600"}>
                        {" "}
                        ({((data.totals.turnoverYtd / data.totals.turnoverLastYear - 1) * 100).toFixed(0)}%)
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-mono font-medium">
                    {data.totals.turnoverLastYear > 0 ? fmtEur(data.totals.turnoverLastYear) : "—"}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Always-visible collection notes: call preferences & customer particularities */}
          <CollectionNotesBox group={group} />

          {/* Aging for current scope */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aging (current scope)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Current (not due)</div>
                  <div className="text-lg font-bold font-mono">{fmtEur(computedAging?.current ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">{computedAging?.currentCount ?? 0} invoice(s)</div>
                </div>
                {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
                  <button
                    key={b}
                    onClick={() => setAgingFilter(agingFilter === b ? "all" : b)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      agingFilter === b ? "ring-2 ring-primary bg-primary/5" : "bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-xs text-muted-foreground">{b} days overdue</div>
                    <div className="text-lg font-bold font-mono">{fmtEur(computedAging?.buckets[b].amount ?? 0)}</div>
                    <div className="text-xs text-muted-foreground">{computedAging?.buckets[b].count ?? 0} invoice(s)</div>
                    {fmtByCurrency(computedAging?.buckets[b].byCur, { skipEurOnly: true }) && (
                      <div
                        className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate"
                        title={fmtByCurrency(computedAging?.buckets[b].byCur)}
                      >
                        {fmtByCurrency(computedAging?.buckets[b].byCur)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Filtered totals: EUR + per-currency (like Invoices page) */}
          {filteredInvoices.length > 0 && (
            <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-muted-foreground">{filteredTotals.count} invoice(s) shown</span>
              {statusFilter !== "all" && (
                <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30">
                  {statusFilter}
                  <button
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    title="Clear status filter"
                    onClick={() => setStatusFilter("all")}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {agingFilter !== "all" && (
                <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30">
                  {agingFilter} days overdue
                  <button
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    title="Clear aging filter"
                    onClick={() => setAgingFilter("all")}
                  >
                    ×
                  </button>
                </Badge>
              )}
              {vesselDrill !== "all" && (
                <Badge variant="outline" className="gap-1 bg-primary/5 border-primary/30 max-w-64">
                  <span className="truncate">{vesselDrillLabel}</span>
                  <button
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    title="Clear vessel filter"
                    onClick={() => setVesselDrill("all")}
                  >
                    ×
                  </button>
                </Badge>
              )}
              <span>
                Outstanding total: <span className="font-mono font-semibold">{fmtEur(filteredTotals.eurTotal)}</span>
              </span>
              {!showPaid && paidHiddenCount > 0 && (
                <span className="text-muted-foreground text-xs">
                  {paidHiddenCount} settled invoice(s) hidden
                </span>
              )}
              {fmtByCurrency(filteredTotals.byCur, { skipEurOnly: true }) && (
                <span className="text-muted-foreground">
                  Per currency: <span className="font-mono">{fmtByCurrency(filteredTotals.byCur)}</span>
                </span>
              )}
            </div>
          )}

          {/* Invoices for current scope */}
          <Card>
            {/* The toolbar carries many controls (status, paid, installments,
                payments, credit notes, view toggle). It must wrap instead of
                pushing the last group — "By vessel" — past the card edge. */}
            <CardHeader className="pb-2 flex flex-row flex-wrap items-center justify-between gap-y-2 space-y-0">
              <CardTitle className="text-base shrink-0">Transactions ({scopeLabel})</CardTitle>
              <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
              {/* Invoice status belongs with the transactions it filters, not with the
                  card-level scope filters (company / branch) above. */}
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-7 bg-background text-xs">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(["Open", "Partially Paid", "Paid", "Overdue", "Disputed"] as const).map(s => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant={showPaid ? "secondary" : "ghost"}
                className="h-7 px-2.5 text-xs gap-1.5 border"
                onClick={() => setShowPaid(p => !p)}
                title={
                  showPaid
                    ? "Hide fully paid invoices — show only what is still outstanding"
                    : "Also show fully paid invoices (history / reconciliation)"
                }
              >
                {showPaid ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPaid ? "Hide paid" : `Show paid${paidHiddenCount > 0 ? ` (${paidHiddenCount})` : ""}`}
              </Button>
              <InstallmentToggle
                value={installmentFilter}
                onChange={v => {
                  // Same courtesy as Payments / Credit notes: leaving an
                  // exclusive view returns to the invoice list.
                  if (v === "installments") {
                    setCreditOnly(false);
                    setPaymentsOnly(false);
                  }
                  setInstallmentFilter(v);
                }}
                count={installmentCounts.total}
                hiddenCount={installmentCounts.hidden}
              />
              {/* Payments and Credit notes are permanent members of this toolbar: the
                  collector must always be able to tell whether money on account or an
                  unallocated credit exists, so the buttons never disappear — they go
                  disabled at zero and say when other filters are hiding their rows. */}
              <Button
                size="sm"
                variant={paymentsOnly ? "secondary" : "ghost"}
                disabled={allTransfers.length === 0}
                className={`h-7 px-2.5 text-xs gap-1.5 border ${paymentsOnly ? "border-emerald-300 bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""}`}
                onClick={togglePaymentsOnly}
                title={
                  allTransfers.length === 0
                    ? "No payments on account for this scope"
                    : paymentsOnly
                      ? "Show invoices again"
                      : visibleTransfers.length === 0
                        ? "Payments are hidden by the current filters — click to show them"
                        : `Show only customer payments — ${openTransferCount} with money still on account, ${allTransfers.length - openTransferCount} already matched`
                }
              >
                <Banknote className="h-3.5 w-3.5" />
                Payments ({allTransfers.length})
                {allTransfers.length > 0 && !paymentsOnly && visibleTransfers.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">hidden</span>
                )}
              </Button>
              <Button
                size="sm"
                variant={creditOnly ? "secondary" : "ghost"}
                disabled={allCreditNotes.length === 0}
                className={`h-7 px-2.5 text-xs gap-1.5 border ${creditOnly ? "border-sky-300 bg-sky-100 text-sky-800 hover:bg-sky-100" : ""}`}
                onClick={toggleCreditOnly}
                title={
                  allCreditNotes.length === 0
                    ? "No open credit notes for this scope"
                    : creditOnly
                      ? "Show invoices again"
                      : visibleCreditNotes.length === 0
                        ? "Credit notes are hidden by the current filters — click to show them"
                        : "Show only credit notes"
                }
              >
                <FileMinus2 className="h-3.5 w-3.5" />
                Credit notes ({allCreditNotes.length})
                {allCreditNotes.length > 0 && !creditOnly && visibleCreditNotes.length === 0 && (
                  <span className="text-[10px] text-muted-foreground">hidden</span>
                )}
              </Button>
              <div className="flex items-center rounded-md border p-0.5">
                <Button
                  size="sm"
                  variant={invoiceView === "list" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setInvoiceView("list")}
                >
                  List
                </Button>
                <Button
                  size="sm"
                  variant={invoiceView === "byBranch" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setInvoiceView("byBranch")}
                >
                  By branch
                </Button>
                <Button
                  size="sm"
                  variant={invoiceView === "byVessel" ? "secondary" : "ghost"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setInvoiceView("byVessel")}
                >
                  By vessel
                </Button>
              </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {invoiceView === "byVessel" ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vessel</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                        <TableHead className="text-right">Outstanding (EUR)</TableHead>
                        <TableHead className="text-right">% of total</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        // Outstanding per vessel, converted to EUR the same way as the
                        // By branch view. Invoices without a vessel roll up into a
                        // single "No vessel" row so the totals still reconcile.
                        const byVessel = new Map<string, { label: string; vesselId: number | null; count: number; totalEur: number }>();
                        for (const i of filteredInvoices) {
                          const raw = Number(i.amount) - Number(i.paidAmount);
                          if (raw <= 0.005) continue;
                          const ratio = Number(i.amount) > 0 ? Number((i as any).amountEur ?? i.amount) / Number(i.amount) : 1;
                          const vid = ((i as any).vesselId ?? null) as number | null;
                          const key = vid != null ? String(vid) : "none";
                          const label = (((i as any).vesselName as string | null) ?? "No vessel") || "No vessel";
                          const cur = byVessel.get(key) ?? { label, vesselId: vid, count: 0, totalEur: 0 };
                          cur.count += 1;
                          cur.totalEur += raw * ratio;
                          byVessel.set(key, cur);
                        }
                        const grand = Array.from(byVessel.values()).reduce((s, v) => s + v.totalEur, 0);
                        const rows = Array.from(byVessel.entries()).sort((a, b) => {
                          if (a[0] === "none") return 1;
                          if (b[0] === "none") return -1;
                          return b[1].totalEur - a[1].totalEur;
                        });
                        if (rows.length === 0) {
                          return (
                            <TableRow>
                              <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                                No outstanding invoices in the current scope.
                              </TableCell>
                            </TableRow>
                          );
                        }
                        return rows.map(([key, v]) => (
                          <TableRow
                            key={key}
                            className="cursor-pointer"
                            onClick={() => {
                              setVesselDrill(vesselDrill === key ? "all" : key);
                              setInvoiceView("list");
                            }}
                          >
                            <TableCell className={key === "none" ? "text-muted-foreground" : "font-medium"}>
                              {v.vesselId != null ? (
                                <VesselLink vesselId={v.vesselId} name={v.label} className="font-medium" />
                              ) : (
                                v.label
                              )}
                            </TableCell>
                            <TableCell className="text-right font-mono">{v.count}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{fmtEur(v.totalEur)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {grand > 0 ? `${((v.totalEur / grand) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">View invoices →</TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  <p className="px-4 py-2 text-[11px] text-muted-foreground">
                    Open invoices in the current scope, grouped per vessel (non-EUR converted to EUR). Click a vessel to see its invoices.
                  </p>
                </>
              ) : invoiceView === "byBranch" ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Branch</TableHead>
                        <TableHead className="text-right">Invoices</TableHead>
                        <TableHead className="text-right">Outstanding (EUR)</TableHead>
                        <TableHead className="text-right">% of total</TableHead>
                        <TableHead className="text-right"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const byBranch = new Map<string, { count: number; totalEur: number }>();
                        for (const i of filteredInvoices) {
                          // Outstanding, not the invoice face value — a partly paid
                          // invoice must only contribute what is still owed.
                          const raw = Number(i.amount) - Number(i.paidAmount);
                          if (raw <= 0.005) continue;
                          const ratio = Number(i.amount) > 0 ? Number(i.amountEur ?? i.amount) / Number(i.amount) : 1;
                          const key = branchShort(i.company);
                          const cur = byBranch.get(key) ?? { count: 0, totalEur: 0 };
                          cur.count += 1;
                          cur.totalEur += raw * ratio;
                          byBranch.set(key, cur);
                        }
                        const grand = Array.from(byBranch.values()).reduce((s, b) => s + b.totalEur, 0);
                        const rows = Array.from(byBranch.entries()).sort((a, b) => b[1].totalEur - a[1].totalEur);
                        return rows.map(([b, v]) => (
                          <TableRow
                            key={b}
                            className="cursor-pointer"
                            onClick={() => {
                              const full = (data.branches ?? []).find(x => branchShort(x) === b);
                              setBranch(full && branchShort(branch) !== b ? full : "all");
                              setInvoiceView("list");
                            }}
                          >
                            <TableCell>
                              <Badge variant="outline" className={`text-[11px] ${branchColors[b] ?? ""}`}>
                                {b}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">{v.count}</TableCell>
                            <TableCell className="text-right font-mono font-semibold">{fmtEur(v.totalEur)}</TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {grand > 0 ? `${((v.totalEur / grand) * 100).toFixed(1)}%` : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs text-muted-foreground">View invoices →</TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  <p className="px-4 py-2 text-[11px] text-muted-foreground">
                    Open invoices in the current scope, grouped per Prime branch (non-EUR converted to EUR). Click a branch to see its invoices.
                  </p>
                </>
              ) : (
              <>
              {/* The table scrolls inside its own container so the column header
                  stays pinned while the collector scans the list. */}
              <InvoicesTable
                rows={filteredInvoices as any}
                creditNotes={visibleCreditNotes as any}
                transfers={visibleTransfers as any}
                group={group}
                maxHeight="480px"
                onDisputeChanged={() => utils.customers.groupDetail.invalidate()}
              />
              </>
              )}
            </CardContent>
          </Card>

          {/* Payment history, contracts & tasks across the group (unified card) */}
          <GroupActivityTabs group={group} />
        </>
      )}
      </div>

      {/* One chronological history: calls, notes, promises, emails, tasks, payments */}
      <CommunicationPanel
        open={commPanel.open}
        onClose={commPanel.toggle}
        entries={timelineEntries}
        isLoading={isLoading || activityLoading}
        group={group}
        actions={
          data && data.companies.length > 0 ? (
            <TimelineLogCallButton
              group={group}
              companies={data.companies}
              defaultCustomerId={defaultActionCustomerId}
            />
          ) : undefined
        }
      />
      </div>
    </div>
  );
}

const taskStatusColors: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
  Completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Cancelled: "bg-slate-50 text-slate-500 border-slate-200",
};

/** Payment history, contracts, and tasks aggregated across the member companies (unified card tabs). */
function GroupActivityTabs({ group }: { group: string }) {
  const { data, isLoading } = trpc.customers.groupActivity.useQuery({ group });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Group activity</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="receipts">
          <TabsList>
            <TabsTrigger value="receipts">Payment History{data ? ` (${data.receipts.length})` : ""}</TabsTrigger>
            <TabsTrigger value="contracts">Contracts{data ? ` (${data.contracts.length})` : ""}</TabsTrigger>
            <TabsTrigger value="tasks">Tasks{data ? ` (${data.tasks.length})` : ""}</TabsTrigger>
            <TabsTrigger value="emails">Emails{data ? ` (${data.emails?.length ?? 0})` : ""}</TabsTrigger>
          </TabsList>
          {isLoading || !data ? (
            <Skeleton className="h-40 mt-3" />
          ) : (
            <>
              <TabsContent value="receipts">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.receipts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            No payments recorded
                          </TableCell>
                        </TableRow>
                      )}
                      {data.receipts.map(r => (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(r.receiptDate)}</TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={r.customerName}>{r.customerName}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{r.receiptNumber || "—"}</TableCell>
                          <TableCell className="text-sm">{r.method || "—"}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtEur(Number(r.amount))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="contracts">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Contract</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.contracts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                            No contracts
                          </TableCell>
                        </TableRow>
                      )}
                      {data.contracts.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.contractNumber}</TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={c.customerName}>{c.customerName}</div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(c.startDate)}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{c.endDate ? fmtDate(c.endDate) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">{c.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">{fmtEur(Number(c.totalValue))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="tasks">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Task</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.tasks.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            No tasks
                          </TableCell>
                        </TableRow>
                      )}
                      {data.tasks.map(t => (
                        <TableRow key={t.id}>
                          <TableCell className="text-sm max-w-72">
                            <div className="truncate" title={t.title}>{t.title}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={t.customerName}>{t.customerName}</div>
                          </TableCell>
                          <TableCell className="text-xs">{t.type}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{t.dueDate ? fmtDate(t.dueDate) : "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${taskStatusColors[t.status] ?? ""}`}>{t.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
              <TabsContent value="emails">
                <div className="max-h-80 overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>To</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.emails.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                            No emails sent
                          </TableCell>
                        </TableRow>
                      )}
                      {data.emails.map(e => (
                        <TableRow key={e.id}>
                          <TableCell className="text-sm whitespace-nowrap">{fmtDate(e.createdAt instanceof Date ? e.createdAt.getTime() : e.createdAt)}</TableCell>
                          <TableCell className="text-sm max-w-48">
                            <div className="truncate" title={e.recipientEmail}>{e.recipientEmail}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-52">
                            <div className="truncate" title={e.customerName}>{e.customerName}</div>
                          </TableCell>
                          <TableCell className="text-sm max-w-64">
                            <div className="truncate" title={e.subject}>{e.subject}</div>
                          </TableCell>
                          <TableCell className="text-xs">{e.templateType}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] ${e.status === "Sent" ? "bg-green-50 text-green-700 border-green-200" : e.status === "Failed" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>{e.status}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
}

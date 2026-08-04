import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MentionText from "@/components/MentionText";
import MentionTextarea from "@/components/MentionTextarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { stripMentionMarkup } from "@shared/mentions";
import {
  MessageSquare,
  CheckSquare,
  FileText,
  Mail,
  Phone,
  AlertCircle,
  Banknote,
  ChevronDown,
  ChevronRight,
  Search,
  Pencil,
  Trash2,
} from "lucide-react";

/** One entry on the unified communication timeline, whatever its origin table. */
export interface TimelineEntry {
  id: string;
  /** Milliseconds since epoch (UTC) — the moment the thing happened. */
  at: number;
  kind: "call" | "note" | "promise" | "email" | "task" | "status" | "payment";
  title: string;
  /** Full text — never truncated in the data, only visually clamped. */
  body?: string | null;
  /** Who did it, when known. */
  author?: string | null;
  /** Member company, when the entry belongs to one specific company. */
  company?: string | null;
  /** Optional right-aligned figure, e.g. a promise or payment amount. */
  amount?: number | null;
  /**
   * Set on entries that came from a group note, so the timeline can offer edit
   * and delete in place. Everything else on the timeline is a record of
   * something that happened and stays read-only.
   */
  noteId?: number | null;
}

const KIND_CONFIG: Record<
  TimelineEntry["kind"],
  { icon: React.ReactNode; color: string; label: string }
> = {
  call: { icon: <Phone className="w-4 h-4" />, color: "bg-indigo-50 text-indigo-700 border-indigo-200", label: "Call" },
  note: { icon: <MessageSquare className="w-4 h-4" />, color: "bg-blue-50 text-blue-700 border-blue-200", label: "Note" },
  promise: { icon: <FileText className="w-4 h-4" />, color: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Promise" },
  email: { icon: <Mail className="w-4 h-4" />, color: "bg-orange-50 text-orange-700 border-orange-200", label: "Email" },
  task: { icon: <CheckSquare className="w-4 h-4" />, color: "bg-purple-50 text-purple-700 border-purple-200", label: "Task" },
  status: { icon: <AlertCircle className="w-4 h-4" />, color: "bg-rose-50 text-rose-700 border-rose-200", label: "Status" },
  payment: { icon: <Banknote className="w-4 h-4" />, color: "bg-teal-50 text-teal-700 border-teal-200", label: "Payment" },
};

const FILTERS: { key: "all" | TimelineEntry["kind"]; label: string }[] = [
  { key: "all", label: "All" },
  { key: "call", label: "Calls" },
  { key: "note", label: "Notes" },
  { key: "promise", label: "Promises" },
  { key: "email", label: "Emails" },
  { key: "task", label: "Tasks" },
  { key: "status", label: "Status" },
  { key: "payment", label: "Payments" },
];

/** UTC month key, e.g. "2026-08" — the collections cycle is a calendar month. */
function monthKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function fmtAmount(n: number): string {
  return `€${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A body longer than this gets a "Show more" toggle instead of being clamped silently. */
const CLAMP_CHARS = 180;

function EntryBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  // Clamp on what the reader sees, not on the stored markers, so "@[Name](7)"
  // does not eat the character budget.
  const readable = stripMentionMarkup(text);
  const long = readable.length > CLAMP_CHARS;
  if (!long)
    return (
      <p className="text-sm text-muted-foreground mt-1">
        <MentionText text={text} />
      </p>
    );
  return (
    <div className="mt-1">
      <p className="text-sm text-muted-foreground">
        {open ? <MentionText text={text} /> : `${readable.slice(0, CLAMP_CHARS).trimEnd()}…`}
      </p>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs font-medium text-primary hover:underline mt-0.5"
      >
        {open ? "Show less" : "Show more"}
      </button>
    </div>
  );
}

interface CommunicationTimelineProps {
  entries: TimelineEntry[];
  isLoading?: boolean;
  /** Card heading — defaults to "Communication". */
  title?: string;
  /** Rendered on the header row, e.g. a "Log call" button. */
  actions?: React.ReactNode;
  /**
   * Chromeless mode: no Card wrapper and no title row, for when the timeline is
   * hosted inside a side panel that already provides the frame and heading.
   */
  embedded?: boolean;
  /** Height cap of the scrollable list. Defaults to the standalone-card height. */
  maxHeightClass?: string;
  /**
   * Note composer (or anything else) pinned above the entry list. Kept as a slot
   * so the timeline stays presentational and the caller decides which group the
   * note belongs to.
   */
  composer?: React.ReactNode;
  /**
   * Group whose notes can be edited in place. Without it, note entries render
   * read-only — a timeline shown outside a group context has nothing to write to.
   */
  editableNotesGroup?: string;
}

/**
 * One timeline for everything that happened with a customer or group: calls,
 * notes, promises, emails, tasks, status changes and payments.
 *
 * Grouped by collections cycle (calendar month) because that is the unit of
 * work — the current month is expanded, earlier months are collapsed.
 */
export function CommunicationTimeline({
  entries,
  isLoading,
  title = "Communication",
  actions,
  embedded = false,
  maxHeightClass = "max-h-[560px]",
  composer,
  editableNotesGroup,
}: CommunicationTimelineProps) {
  const [filter, setFilter] = useState<"all" | TimelineEntry["kind"]>("all");
  const [q, setQ] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  /** Which note is being edited inline, and its working text. */
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const utils = trpc.useUtils();
  const refreshNotes = () => {
    if (editableNotesGroup) utils.customers.groupNotes.invalidate({ group: editableNotesGroup });
    utils.customers.groupDetail.invalidate();
    utils.customers.get360.invalidate();
  };
  const updateNote = trpc.customers.updateGroupNote.useMutation({
    onSuccess: () => {
      setEditingNoteId(null);
      toast.success("Note updated");
      refreshNotes();
    },
    onError: e => toast.error(e.message),
  });
  const deleteNote = trpc.customers.deleteGroupNote.useMutation({
    onSuccess: () => {
      toast.success("Note deleted");
      refreshNotes();
    },
    onError: e => toast.error(e.message),
  });

  const currentMonth = useMemo(() => monthKey(Date.now()), []);

  const months = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = entries.filter(e => {
      if (filter !== "all" && e.kind !== filter) return false;
      if (!needle) return true;
      return (
        e.title.toLowerCase().includes(needle) ||
        stripMentionMarkup(e.body).toLowerCase().includes(needle) ||
        (e.author ?? "").toLowerCase().includes(needle) ||
        (e.company ?? "").toLowerCase().includes(needle)
      );
    });
    const byMonth = new Map<string, TimelineEntry[]>();
    for (const e of filtered.slice().sort((a, b) => b.at - a.at)) {
      const k = monthKey(e.at);
      const list = byMonth.get(k);
      if (list) list.push(e);
      else byMonth.set(k, [e]);
    }
    return Array.from(byMonth.entries());
  }, [entries, filter, q]);

  const total = entries.length;
  const searching = q.trim().length > 0;

  const header = (
    <>
      <div className={`flex items-center justify-between gap-3 flex-wrap ${embedded ? "" : ""}`}>
        {!embedded && (
          <CardTitle className="text-base">
            {title}
            {total > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">{total} entries</span>}
          </CardTitle>
        )}
        <div className={`flex items-center gap-2 ${embedded ? "w-full" : ""}`}>
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search notes…"
              className={`h-8 pl-7 text-xs ${embedded ? "w-full" : "w-44"}`}
            />
          </div>
          {actions}
        </div>
      </div>
      <div className="flex items-center gap-1 flex-wrap pt-1">
        {FILTERS.map(f => {
          const count = f.key === "all" ? total : entries.filter(e => e.kind === f.key).length;
          if (f.key !== "all" && count === 0) return null;
          return (
            <Button
              key={f.key}
              type="button"
              size="sm"
              variant={filter === f.key ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="ml-1 text-muted-foreground">{count}</span>
            </Button>
          );
        })}
      </div>
    </>
  );

  const list = (
    <>
        {composer && <div className="pb-3">{composer}</div>}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-muted/50 animate-pulse" />
            ))}
          </div>
        ) : months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            {total === 0
              ? "Nothing recorded yet. Log a call to start the history."
              : "No entries match this filter."}
          </p>
        ) : (
          // Embedded (floating window / sheet): the host provides the single
          // scroll container, so no second scrollbar is introduced here.
          <div className={embedded ? "space-y-4 pr-1" : `space-y-4 ${maxHeightClass} overflow-y-auto pr-1`}>
            {months.map(([key, list]) => {
              // Current cycle open by default; earlier cycles folded unless searching.
              const isCurrent = key === currentMonth;
              const isOpen = collapsed[key] !== undefined ? !collapsed[key] : isCurrent || searching;
              return (
                <div key={key}>
                  <button
                    type="button"
                    onClick={() => setCollapsed(prev => ({ ...prev, [key]: isOpen }))}
                    className="flex items-center gap-1.5 w-full text-left mb-2 group"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                    )}
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground">
                      {monthLabel(key)}
                    </span>
                    {isCurrent && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-primary/5 border-primary/20 text-primary">
                        current cycle
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">· {list.length}</span>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 pl-1">
                      {list.map(e => {
                        const cfg = KIND_CONFIG[e.kind];
                        const editable = Boolean(editableNotesGroup) && e.kind === "note" && typeof e.noteId === "number";
                        const isEditing = editable && editingNoteId === e.noteId;
                        return (
                          <div key={e.id} className="flex gap-3 pb-3 border-b last:border-b-0">
                            <div className="flex-shrink-0 pt-0.5">
                              <div className={`p-2 rounded-lg ${cfg.color}`}>{cfg.icon}</div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-sm break-words">{e.title}</p>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  {e.amount != null && e.amount > 0 && (
                                    <span className="text-sm font-mono font-semibold">{fmtAmount(e.amount)}</span>
                                  )}
                                  {editable && !isEditing && (
                                    <div className="flex items-center gap-0.5">
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground"
                                        title="Edit note"
                                        onClick={() => {
                                          setEditingNoteId(e.noteId as number);
                                          setEditDraft(e.body ?? "");
                                        }}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                                        title="Delete note"
                                        disabled={deleteNote.isPending}
                                        onClick={() => deleteNote.mutate({ id: e.noteId as number })}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  )}
                                  <Badge variant="outline" className={`text-[10px] whitespace-nowrap ${cfg.color}`}>
                                    {cfg.label}
                                  </Badge>
                                </div>
                              </div>
                              {isEditing ? (
                                <div className="mt-1.5 space-y-2">
                                  <MentionTextarea
                                    value={editDraft}
                                    onChange={setEditDraft}
                                    rows={3}
                                    maxLength={5000}
                                    autoFocus
                                    hint={false}
                                    className="bg-background text-sm"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs"
                                      onClick={() => setEditingNoteId(null)}
                                      disabled={updateNote.isPending}
                                    >
                                      Cancel
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="h-7 text-xs"
                                      disabled={!editDraft.trim() || updateNote.isPending}
                                      onClick={() =>
                                        updateNote.mutate({ id: e.noteId as number, content: editDraft.trim() })
                                      }
                                    >
                                      {updateNote.isPending ? "Saving…" : "Save"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                e.body && <EntryBody text={e.body} />
                              )}
                              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-muted-foreground flex-wrap">
                                <span>{fmtDateTime(e.at)}</span>
                                {e.author && (
                                  <>
                                    <span>·</span>
                                    <span>{e.author}</span>
                                  </>
                                )}
                                {e.company && (
                                  <>
                                    <span>·</span>
                                    <span className="truncate max-w-[220px]">{e.company}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
    </>
  );

  if (embedded) {
    return (
      // h-full + min-h-0 so, inside the floating window, the header stays put
      // and only the entry list scrolls.
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="shrink-0">{header}</div>
        <div className="min-h-0 flex-1 overflow-y-auto">{list}</div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">{header}</CardHeader>
      <CardContent>{list}</CardContent>
    </Card>
  );
}

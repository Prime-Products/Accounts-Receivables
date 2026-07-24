import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { trpc } from "@/lib/trpc";
import { fmtEur, ratingColors } from "@/lib/format";
import {
  Phone,
  HandCoins,
  ListTodo,
  TrendingUp,
  StickyNote,
  ExternalLink,
  Sparkles,
  PhoneOff,
  PhoneCall,
  CheckCircle2,
  TrendingDown,
  AlertTriangle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface CollectionWorkspaceProps {
  group: string;
  isOpen: boolean;
  onClose: () => void;
  onOpenFullCard: () => void;
}

const OUTCOMES = [
  { value: "No Answer", icon: PhoneOff },
  { value: "Contacted", icon: PhoneCall },
  { value: "Forecast Confirmed", icon: CheckCircle2 },
  { value: "Forecast Reduced", icon: TrendingDown },
  { value: "Promise Received", icon: HandCoins },
  { value: "Escalation Needed", icon: AlertTriangle },
] as const;

function StatCell({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold font-mono tabular-nums ${className ?? ""}`}>{value}</div>
    </div>
  );
}

export default function CollectionWorkspace({ group, isOpen, onClose, onOpenFullCard }: CollectionWorkspaceProps) {
  const utils = trpc.useUtils();
  const [outcomeDialog, setOutcomeDialog] = useState(false);
  const [outcome, setOutcome] = useState<string>("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [promiseDialog, setPromiseDialog] = useState(false);
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseDate, setPromiseDate] = useState(() => new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
  const [promiseNotes, setPromiseNotes] = useState("");
  const [taskDialog, setTaskDialog] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDate, setTaskDate] = useState(() => new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
  const [noteDialog, setNoteDialog] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [forecastDialog, setForecastDialog] = useState(false);
  const [forecastAmount, setForecastAmount] = useState("");

  const enabled = isOpen && !!group;
  const { data: detail, isLoading } = trpc.customers.groupDetail.useQuery({ group }, { enabled });
  const { data: forecast } = trpc.customers.groupForecast.useQuery({ group }, { enabled });
  const { data: activity } = trpc.customers.groupActivity.useQuery({ group }, { enabled });
  const { data: promises } = trpc.customers.groupPromises.useQuery({ group }, { enabled });
  const { data: notes } = trpc.customers.groupNotes.useQuery({ group }, { enabled });

  const primaryCustomerId = detail?.companies[0]?.id;
  const openTasks = useMemo(() => (activity?.tasks ?? []).filter(t => t.status === "Pending" || t.status === "In Progress"), [activity]);
  const openPromises = useMemo(() => (promises ?? []).filter(p => p.status === "Pending"), [promises]);
  const lastContactTs = useMemo(() => {
    const ts = (notes ?? []).map(n => n.createdAt).sort((a, b) => b - a)[0];
    return ts ?? null;
  }, [notes]);

  const overdueEom = detail?.overdueEomBalance ?? 0;
  const expected = forecast?.expectedAmount ?? detail?.forecastExpected ?? 0;
  const collected = forecast?.collected ?? 0;
  const remaining = forecast ? forecast.remaining : Math.max(0, expected - collected);
  const coverage = overdueEom > 0 ? expected / overdueEom : null;

  // Recommendation engine (simple client-side rules on real data)
  const recommendation = useMemo(() => {
    if (!detail) return null;
    const actions: string[] = [];
    let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
    if (overdueEom > 0 && (coverage === null || coverage < 0.8)) {
      priority = "HIGH";
      actions.push("Contact customer today");
      if (expected > 0) actions.push(`Validate expected payment of ${fmtEur(expected)}`);
      else actions.push("No forecast on file — ask for a payment commitment");
      actions.push("Update forecast if commitment changed");
      actions.push("Escalate if no commitment is received");
    } else if (overdueEom > 0) {
      priority = "MEDIUM";
      actions.push(`Confirm expected payment of ${fmtEur(expected)} is on track`);
      if (openPromises.length > 0) actions.push(`Follow up on ${openPromises.length} open promise(s)`);
      else actions.push("Record a promise-to-pay if the customer commits");
    } else {
      actions.push("No overdue exposure this month — no call needed");
      if (openTasks.length > 0) actions.push(`Close out ${openTasks.length} open task(s)`);
    }
    if (detail.watchStatus === "Problematic") actions.push("Account flagged Problematic — consider On-Hold proposal if unresponsive");
    return { priority, actions };
  }, [detail, overdueEom, coverage, expected, openPromises.length, openTasks.length]);

  const addNote = trpc.customers.addGroupNote.useMutation({
    onError: e => toast.error(e.message),
  });
  const addPromise = trpc.forecast.addPromise.useMutation({
    onSuccess: () => {
      toast.success("Promise-to-pay recorded");
      utils.customers.invalidate();
      utils.forecast.invalidate();
      utils.tasks.invalidate();
      setPromiseDialog(false);
      setPromiseAmount("");
      setPromiseNotes("");
    },
    onError: e => toast.error(e.message),
  });
  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      utils.tasks.invalidate();
      utils.customers.invalidate();
      setTaskDialog(false);
      setTaskTitle("");
    },
    onError: e => toast.error(e.message),
  });
  const adjustForecast = trpc.forecast.adjustEntry.useMutation({
    onSuccess: () => {
      toast.success("Forecast updated");
      utils.customers.invalidate();
      utils.forecast.invalidate();
      setForecastDialog(false);
      setForecastAmount("");
    },
    onError: e => toast.error(e.message),
  });

  const recordOutcome = async () => {
    if (!outcome) {
      toast.error("Please select an outcome");
      return;
    }
    await addNote.mutateAsync({
      group,
      content: `Call outcome — ${outcome}${outcomeNotes.trim() ? `: ${outcomeNotes.trim()}` : ""}`,
    });
    utils.customers.groupNotes.invalidate({ group });
    setOutcomeDialog(false);
    setOutcomeNotes("");
    const chosen = outcome;
    setOutcome("");
    if (chosen === "Promise Received") {
      setPromiseDialog(true);
    } else if (chosen === "Forecast Reduced") {
      setForecastDialog(true);
    } else if (chosen === "Escalation Needed") {
      if (primaryCustomerId) {
        await createTask.mutateAsync({
          customerId: primaryCustomerId,
          type: "Escalation +30",
          title: `Escalation — ${group}`,
          description: outcomeNotes.trim() || "Escalation requested from Collection Workspace",
          dueDate: Date.now() + 86400000,
        });
      }
      toast.success("Escalation task created for management");
    } else {
      toast.success(`Outcome recorded: ${chosen}`);
    }
  };

  const watch = detail?.watchOverride ?? detail?.watchStatus ?? null;

  return (
    <>
      <Sheet open={isOpen} onOpenChange={o => !o && onClose()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-0">
          <SheetHeader className="border-b px-5 py-4">
            <SheetTitle className="flex items-center justify-between gap-2 pr-6">
              <span className="truncate">{group}</span>
            </SheetTitle>
            <SheetDescription className="flex flex-wrap items-center gap-2">
              {detail && (
                <>
                  <Badge variant="outline" className={ratingColors[detail.rating.rating] ?? ""}>
                    {detail.rating.rating} · {detail.rating.score}
                  </Badge>
                  <WatchStatusSelect group={group} value={watch} />
                  {detail.holdStatus !== "Active" && (
                    <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                      {detail.holdStatus}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{detail.companies.length} companies</span>
                </>
              )}
            </SheetDescription>
          </SheetHeader>

          {isLoading || !detail ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <div className="space-y-5 px-5 py-4">
              {/* OVERVIEW */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Overview</h3>
                <div className="grid grid-cols-2 gap-2">
                  <StatCell label="Overdue EOM" value={fmtEur(overdueEom)} className="text-red-600" />
                  <StatCell
                    label="AI Forecast"
                    value={expected > 0 ? fmtEur(expected) : "—"}
                    className="text-emerald-700"
                  />
                  <StatCell label="Collected this month" value={fmtEur(collected)} />
                  <StatCell label="Remaining to forecast" value={fmtEur(remaining)} className="text-orange-600" />
                  <StatCell
                    label="Last contact"
                    value={lastContactTs ? new Date(lastContactTs).toLocaleDateString("en-GB") : "Never"}
                  />
                  <StatCell
                    label="Open tasks · promises"
                    value={`${openTasks.length} · ${openPromises.length}`}
                  />
                </div>
                {coverage !== null && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Forecast covers <span className={`font-semibold ${coverage < 0.8 ? "text-red-600" : "text-emerald-700"}`}>{Math.round(coverage * 100)}%</span> of the overdue-EOM balance.
                  </p>
                )}
              </section>

              {/* WHAT SHOULD I DO NEXT */}
              {recommendation && (
                <section>
                  <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" /> What should I do next?
                  </h3>
                  <div className="rounded-lg border bg-muted/40 p-3">
                    <Badge
                      variant="outline"
                      className={
                        recommendation.priority === "HIGH"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : recommendation.priority === "MEDIUM"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-emerald-100 text-emerald-700 border-emerald-200"
                      }
                    >
                      Priority: {recommendation.priority}
                    </Badge>
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {recommendation.actions.map((a, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              )}

              <Separator />

              {/* QUICK ACTIONS */}
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick actions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="default" size="sm" className="col-span-2 justify-start gap-2" onClick={() => setOutcomeDialog(true)}>
                    <Phone className="h-4 w-4" /> Record Call Outcome
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setPromiseDialog(true)}>
                    <HandCoins className="h-4 w-4" /> Promise to Pay
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setTaskDialog(true)}>
                    <ListTodo className="h-4 w-4" /> Create Task
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-start gap-2"
                    onClick={() => {
                      if (!forecast) {
                        toast.info("No forecast entry for this group this month");
                        return;
                      }
                      setForecastDialog(true);
                    }}
                  >
                    <TrendingUp className="h-4 w-4" /> Update Forecast
                  </Button>
                  <Button variant="outline" size="sm" className="justify-start gap-2" onClick={() => setNoteDialog(true)}>
                    <StickyNote className="h-4 w-4" /> Add Note
                  </Button>
                </div>
              </section>

              {/* RECENT ACTIVITY */}
              {(notes ?? []).length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest notes</h3>
                  <div className="space-y-2">
                    {(notes ?? []).slice(0, 3).map(n => (
                      <div key={n.id} className="rounded-lg border bg-card px-3 py-2 text-xs">
                        <div className="text-muted-foreground">
                          {new Date(n.createdAt).toLocaleDateString("en-GB")} · {n.authorName}
                        </div>
                        <div className="mt-0.5 line-clamp-2">{n.content}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <Separator />

              {/* FULL ACCOUNT */}
              <Button variant="secondary" className="w-full justify-between" onClick={onOpenFullCard}>
                Open Full Customer Card
                <ExternalLink className="h-4 w-4" />
              </Button>
              <p className="pb-2 text-center text-[11px] text-muted-foreground">
                Use the full card for invoices, aging, contracts, payment history, SOA and exports.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* CALL OUTCOME DIALOG */}
      <Dialog open={outcomeDialog} onOpenChange={setOutcomeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record call outcome — {group}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map(o => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => setOutcome(o.value)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                    outcome === o.value ? "border-primary bg-primary/5 font-medium" : "hover:bg-muted/60"
                  }`}
                >
                  <o.icon className="h-4 w-4 text-muted-foreground" />
                  {o.value}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea rows={3} value={outcomeNotes} onChange={e => setOutcomeNotes(e.target.value)} placeholder="What was agreed on the call…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOutcomeDialog(false)}>Cancel</Button>
            <Button onClick={recordOutcome} disabled={!outcome || addNote.isPending}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PROMISE DIALOG */}
      <Dialog open={promiseDialog} onOpenChange={setPromiseDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Promise to pay — {group}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (EUR)</Label>
                <Input type="number" min="0" step="0.01" value={promiseAmount} onChange={e => setPromiseAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Promised date</Label>
                <Input type="date" value={promiseDate} onChange={e => setPromiseDate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Notes (optional)</Label>
              <Textarea rows={2} value={promiseNotes} onChange={e => setPromiseNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPromiseDialog(false)}>Cancel</Button>
            <Button
              disabled={addPromise.isPending || !promiseAmount || Number(promiseAmount) <= 0}
              onClick={() => {
                if (!primaryCustomerId) {
                  toast.error("Group has no member companies");
                  return;
                }
                addPromise.mutate({
                  customerId: primaryCustomerId,
                  amount: Number(promiseAmount),
                  promisedDate: new Date(`${promiseDate}T12:00:00Z`).getTime(),
                  notes: promiseNotes.trim() || undefined,
                });
              }}
            >
              Record promise
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* TASK DIALOG */}
      <Dialog open={taskDialog} onOpenChange={setTaskDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New task — {group}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Task title</Label>
              <Input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="e.g. Call about overdue invoices" />
            </div>
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={taskDate} onChange={e => setTaskDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaskDialog(false)}>Cancel</Button>
            <Button
              disabled={createTask.isPending || !taskTitle.trim()}
              onClick={() => {
                if (!primaryCustomerId) {
                  toast.error("Group has no member companies");
                  return;
                }
                createTask.mutate({
                  customerId: primaryCustomerId,
                  type: "Manual",
                  title: taskTitle.trim(),
                  dueDate: new Date(`${taskDate}T12:00:00Z`).getTime(),
                });
              }}
            >
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* NOTE DIALOG */}
      <Dialog open={noteDialog} onOpenChange={setNoteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add note — {group}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1">
            <Label>Note</Label>
            <Textarea rows={4} value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Call outcome, agreement, context…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteDialog(false)}>Cancel</Button>
            <Button
              disabled={addNote.isPending || !noteText.trim()}
              onClick={async () => {
                await addNote.mutateAsync({ group, content: noteText.trim() });
                toast.success("Note added");
                utils.customers.groupNotes.invalidate({ group });
                setNoteDialog(false);
                setNoteText("");
              }}
            >
              Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FORECAST DIALOG */}
      <Dialog open={forecastDialog} onOpenChange={setForecastDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update forecast — {group}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {forecast ? (
              <p className="text-sm text-muted-foreground">
                Current expected amount: <span className="font-semibold text-foreground">{fmtEur(forecast.expectedAmount)}</span>
                {forecast.aiSuggestedAmount !== forecast.expectedAmount && (
                  <> · AI suggested {fmtEur(forecast.aiSuggestedAmount)}</>
                )}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">No forecast entry exists for this group this month.</p>
            )}
            <div className="space-y-1">
              <Label>New expected amount (EUR)</Label>
              <Input type="number" min="0" step="0.01" value={forecastAmount} onChange={e => setForecastAmount(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForecastDialog(false)}>Cancel</Button>
            <Button
              disabled={adjustForecast.isPending || !forecast || forecastAmount === "" || Number(forecastAmount) < 0}
              onClick={() => {
                if (!forecast) return;
                adjustForecast.mutate({
                  id: forecast.entryId,
                  expectedAmount: Number(forecastAmount),
                  note: "Adjusted from Collection Workspace",
                });
              }}
            >
              Update forecast
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

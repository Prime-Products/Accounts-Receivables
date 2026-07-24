import { useMemo, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { fmtEur } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Phone, StickyNote, HandCoins, ListPlus, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const reasonColors: Record<string, string> = {
  "Broken promise": "border-red-300 bg-red-50 text-red-700",
  "Aging 61-90": "border-orange-300 bg-orange-50 text-orange-700",
  "Low coverage": "border-purple-300 bg-purple-50 text-purple-700",
  "No recent payment": "border-slate-300 bg-slate-100 text-slate-700",
  "Rating D": "border-orange-300 bg-orange-50 text-orange-700",
  "Rating E": "border-red-300 bg-red-50 text-red-700",
};

const statusBadge: Record<string, string> = {
  Problematic: "border-amber-300 bg-amber-50 text-amber-800",
  Critical: "border-red-300 bg-red-50 text-red-700",
  Legal: "border-purple-300 bg-purple-50 text-purple-700",
};

import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type CallRow = inferRouterOutputs<AppRouter>["customers"]["callList"][number];

/** Quick-action dialog state: which row and which action. */
type QuickAction = { row: CallRow; kind: "note" | "promise" | "task" } | null;

export default function CallList() {
  const { data, isLoading } = trpc.customers.callList.useQuery();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [action, setAction] = useState<QuickAction>(null);

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
                    <TableHead className="text-right">Actions</TableHead>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Add note" onClick={() => setAction({ row: r, kind: "note" })}>
                            <StickyNote className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Promise-to-pay" onClick={() => setAction({ row: r, kind: "promise" })}>
                            <HandCoins className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="New task" onClick={() => setAction({ row: r, kind: "task" })}>
                            <ListPlus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {action && <QuickActionDialog action={action} onClose={() => setAction(null)} />}
    </div>
  );
}

function QuickActionDialog({ action, onClose }: { action: NonNullable<QuickAction>; onClose: () => void }) {
  const { row, kind } = action;
  const utils = trpc.useUtils();
  // Actions are recorded against the group: internally we attach them to the
  // group's primary member (first member id) — no company selection needed.
  const customerId = row.memberIds[0];
  const [text, setText] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));

  const done = (msg: string) => {
    toast.success(msg);
    utils.customers.callList.invalidate();
    onClose();
  };
  const addNote = trpc.customers.addGroupNote.useMutation({ onSuccess: () => done("Note added"), onError: e => toast.error(e.message) });
  const addPromise = trpc.forecast.addPromise.useMutation({ onSuccess: () => done("Promise recorded"), onError: e => toast.error(e.message) });
  const createTask = trpc.tasks.create.useMutation({ onSuccess: () => done("Task created"), onError: e => toast.error(e.message) });

  const pending = addNote.isPending || addPromise.isPending || createTask.isPending;
  const canSubmit =
    !pending &&
    (kind !== "note" || text.trim().length > 0) &&
    (kind !== "promise" || (amount !== "" && Number(amount) > 0)) &&
    (kind !== "task" || text.trim().length > 0);

  const submit = () => {
    if (kind === "note") {
      addNote.mutate({ group: row.group, content: text.trim() });
    } else if (kind === "promise") {
      addPromise.mutate({
        customerId,
        promisedDate: new Date(`${date}T12:00:00Z`).getTime(),
        amount: Number(amount),
        notes: text.trim() || undefined,
      });
    } else {
      createTask.mutate({
        customerId,
        type: "Manual",
        title: text.trim(),
        dueDate: new Date(`${date}T12:00:00Z`).getTime(),
      });
    }
  };

  const titles = { note: "Add note", promise: "Record promise-to-pay", task: "New task" } as const;
  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {titles[kind]} — {row.group}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {kind === "promise" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Amount (EUR)</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Promised date</Label>
                <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </div>
          )}
          {kind === "task" && (
            <div className="space-y-1">
              <Label>Due date</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          )}
          <div className="space-y-1">
            <Label>{kind === "task" ? "Task title" : kind === "promise" ? "Notes (optional)" : "Note"}</Label>
            <Textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder={kind === "task" ? "e.g. Call about overdue invoices" : "Call outcome, agreement, context…"} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

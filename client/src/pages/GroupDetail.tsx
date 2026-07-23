import { Badge } from "@/components/ui/badge";
import NewTaskDialog from "@/components/NewTaskDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { branchColors, branchShort, downloadBase64, fmtByCurrency, fmtCur, fmtDate, fmtEur, invoiceStatusColors, tierColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Building2, FileDown, Filter, HandCoins, Layers, PauseCircle, Pencil, Plus, Sparkles, StickyNote, Trash2 } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

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

function GroupPromiseDialog({ companies, defaultCustomerId }: { companies: { id: number; name: string }[]; defaultCustomerId?: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
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
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <HandCoins className="h-4 w-4" /> Promise-to-Pay
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record Promise-to-Pay</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <CompanyPicker companies={companies} value={customerId} onChange={setCustomerId} />
          <div className="space-y-1.5">
            <Label>Amount (€)</Label>
            <Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
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
            disabled={!customerId || !form.amount || !form.date || addPromise.isPending}
            onClick={() =>
              addPromise.mutate({
                customerId: customerId!,
                amount: Number(form.amount),
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

function GroupOnHoldDialog({ companies, defaultCustomerId }: { companies: { id: number; name: string }[]; defaultCustomerId?: number }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(defaultCustomerId ?? null);
  const [reason, setReason] = useState("");
  const submit = trpc.onHold.submit.useMutation({
    onSuccess: () => {
      toast.success("On-Hold proposal submitted — status: Under Review");
      utils.customers.invalidate();
      utils.onHold.list.invalidate();
      setOpen(false);
      setReason("");
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
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm" className="gap-1.5">
          <PauseCircle className="h-4 w-4" /> Propose On-Hold
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit On-Hold Proposal</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Supporting data (overdue invoices, amounts, days overdue) is aggregated automatically for the selected
          company. The proposal starts as <strong>Under Review</strong> and Management decides the next step.
        </p>
        <div className="space-y-3">
          <CompanyPicker companies={companies} value={customerId} onChange={setCustomerId} />
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Why should this company be placed on hold?" />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!customerId || !reason || submit.isPending}
            onClick={() => submit.mutate({ customerId: customerId!, reason })}
          >
            Submit Proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GroupDetail() {
  const [, params] = useRoute("/groups/:name");
  const [, navigate] = useLocation();
  const group = decodeURIComponent(params?.name ?? "");
  const [companyId, setCompanyId] = useState<string>("all");
  const [branch, setBranch] = useState<string>("all");
  const [agingFilter, setAgingFilter] = useState<string>("all");

  const query = useMemo(
    () => ({
      group,
      customerId: companyId === "all" ? undefined : Number(companyId),
      branch: branch === "all" ? undefined : branch,
      minDaysOverdue: agingFilter === "all" ? undefined : Number(agingFilter),
    }),
    [group, companyId, branch, agingFilter],
  );
  const { data, isLoading } = trpc.customers.groupDetail.useQuery(query, { enabled: !!group });

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
      minDaysOverdue: agingFilter === "all" ? undefined : Number(agingFilter),
    });

  const scopeLabel =
    companyId === "all" && branch === "all" && agingFilter === "all"
      ? "Whole group"
      : [
          companyId !== "all" ? data?.companies.find(c => String(c.id) === companyId)?.name : null,
          branch !== "all" ? branchShort(branch) : null,
          agingFilter !== "all" ? `${agingFilter}+ days overdue` : null,
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
            <ArrowLeft className="h-4 w-4" /> Customers
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Layers className="h-6 w-6" /> {group}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Group card — {data ? `${data.companies.length} companies` : "…"} · showing: {scopeLabel}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data && data.companies.length > 0 && (
            <>
              <NewTaskDialog
                key={companyId}
                customerIds={data.companies.map(c => c.id)}
                defaultCustomerId={defaultActionCustomerId}
                trigger={
                  <Button size="sm" className="gap-1.5">
                    <Plus className="h-4 w-4" /> New Task
                  </Button>
                }
              />
              <GroupPromiseDialog key={`ptp-${companyId}`} companies={data.companies} defaultCustomerId={defaultActionCustomerId} />
              <GroupOnHoldDialog key={`oh-${companyId}`} companies={data.companies} defaultCustomerId={defaultActionCustomerId} />
            </>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => doExport("pdf")} disabled={exportSoa.isPending}>
            <FileDown className="h-4 w-4" /> SOA (PDF)
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => doExport("xlsx")} disabled={exportSoa.isPending}>
            <FileDown className="h-4 w-4" /> SOA (Excel)
          </Button>
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={companyId} onValueChange={setCompanyId}>
            <SelectTrigger className="w-64 h-9">
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
            <SelectTrigger className="w-44 h-9">
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
          <Select value={agingFilter} onValueChange={setAgingFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="Aging" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All invoices</SelectItem>
              <SelectItem value="1">Overdue (any)</SelectItem>
              <SelectItem value="60">Overdue 60+ days</SelectItem>
              <SelectItem value="120">Overdue 120+ days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

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
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Balance</div>
                <div className="text-xl font-bold font-mono">{fmtEur(data.totals.openBalance)}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {fmtByCurrency(data.totals.openByCurrency, { skipEurOnly: true })}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Overdue</div>
                <div className={`text-xl font-bold font-mono ${data.totals.overdueBalance > 0 ? "text-red-600" : ""}`}>
                  {fmtEur(data.totals.overdueBalance)}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{data.totals.overdueCount} overdue invoice(s)</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Open Invoices</div>
                <div className="text-xl font-bold font-mono">{data.totals.openCount}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{data.companies.length} companies in group</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground">Payment Behavior (last year)</div>
                {data.behavior ? (
                  <>
                    <div
                      className={`text-xl font-bold font-mono ${
                        data.behavior.medianDaysLate > 30 ? "text-red-600" : data.behavior.medianDaysLate > 7 ? "text-amber-600" : "text-emerald-700"
                      }`}
                    >
                      {data.behavior.medianDaysLate > 0 ? `+${data.behavior.medianDaysLate}` : data.behavior.medianDaysLate}d median
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      avg {data.behavior.avgDaysLate}d vs due date · {data.behavior.payments} payments
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground mt-1">No payment history</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Aging for current scope */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Aging (current scope)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="rounded-md border bg-muted/40 px-3 py-2">
                  <div className="text-[11px] text-muted-foreground">Current (not due)</div>
                  <div className="text-sm font-bold font-mono">{fmtEur(data.aging.current)}</div>
                </div>
                {(["0-30", "31-60", "61-90", "91-120", "120+"] as const).map(b => (
                  <div key={b} className="rounded-md border bg-muted/40 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{b} days overdue</div>
                    <div className="text-sm font-bold font-mono">{fmtEur(data.aging.buckets[b].amount)}</div>
                    <div className="text-[10px] text-muted-foreground">{data.aging.buckets[b].count} inv.</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Member companies */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Companies of the group
                {branch !== "all" && (
                  <Badge variant="outline" className={branchColors[branchShort(branch)] ?? ""}>
                    {branchShort(branch)} only
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead className="text-right">Behavior</TableHead>
                    <TableHead className="text-right">Open Balance</TableHead>
                    <TableHead className="text-right">Overdue</TableHead>
                    <TableHead className="text-right">Open Inv.</TableHead>
                    <TableHead className="text-right">Card</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.companies.map(c => (
                    <TableRow
                      key={c.id}
                      className={`cursor-pointer ${String(c.id) === companyId ? "bg-primary/5" : ""}`}
                      onClick={() => setCompanyId(String(c.id) === companyId ? "all" : String(c.id))}
                    >
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={tierColors[c.tier] ?? ""}>
                          {c.tier}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {c.medianDaysLate !== null ? (
                          <span
                            className={`font-mono text-xs ${
                              Number(c.medianDaysLate) > 30 ? "text-red-600" : Number(c.medianDaysLate) > 7 ? "text-amber-600" : "text-emerald-700"
                            }`}
                            title={`Last year: median ${c.medianDaysLate}d / avg ${c.avgDaysLate}d late (${c.historyPayments} payments)`}
                          >
                            med {c.medianDaysLate}d
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtEur(c.openBalance)}</TableCell>
                      <TableCell className={`text-right font-mono ${c.overdueBalance > 0 ? "text-red-600" : ""}`}>
                        {fmtEur(c.overdueBalance)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{c.invoiceCount}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={e => {
                            e.stopPropagation();
                            navigate(`/customers/${c.id}`);
                          }}
                        >
                          Customer 360 →
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground">
                Click a company row to scope all data above to that company; click again to return to the whole group.
              </p>
            </CardContent>
          </Card>

          {/* Invoices for current scope */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Invoices ({scopeLabel})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Branch</TableHead>
                      <TableHead>Doc. Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.invoices.map(i => (
                      <TableRow key={i.id}>
                        <TableCell className="font-mono text-xs">{i.invoiceNumber}</TableCell>
                        <TableCell className="text-sm max-w-52">
                          <div className="truncate" title={i.customerName}>{i.customerName}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${branchColors[branchShort(i.company)] ?? ""}`}>
                            {branchShort(i.company)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.issueDate)}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">{fmtDate(i.dueDate)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-[10px] ${invoiceStatusColors[i.status] ?? ""}`}>
                            {i.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {fmtCur(Number(i.amount), i.currency ?? "EUR")}
                          {i.currency && i.currency !== "EUR" && i.amountEur != null && (
                            <div className="text-[10px] text-muted-foreground">≈ {fmtEur(Number(i.amountEur))}</div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Promises-to-pay, Notes & AI summary */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <GroupPromisesCard group={group} />
            <GroupNotesCard group={group} />
          </div>
          <GroupAiSummaryCard group={group} />
        </>
      )}
    </div>
  );
}

const promiseStatusColors: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Kept: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Broken: "bg-red-50 text-red-700 border-red-200",
};

function GroupPromisesCard({ group }: { group: string }) {
  const utils = trpc.useUtils();
  const { data: promises, isLoading } = trpc.customers.groupPromises.useQuery({ group });
  const update = trpc.forecast.updatePromise.useMutation({
    onSuccess: () => {
      toast.success("Promise updated");
      utils.customers.groupPromises.invalidate({ group });
    },
    onError: e => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <HandCoins className="h-4 w-4" /> Promises-to-Pay
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-24" />
          </div>
        ) : !promises || promises.length === 0 ? (
          <p className="text-sm text-muted-foreground p-4">No promises recorded for this group yet. Use the "Promise-to-Pay" button above.</p>
        ) : (
          <div className="max-h-72 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Promised date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-32" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {promises.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm max-w-44">
                      <div className="truncate" title={p.customerName}>{p.customerName}</div>
                      {p.notes && (
                        <div className="text-[11px] text-muted-foreground truncate" title={p.notes}>
                          {p.notes}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{fmtDate(p.promisedDate)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtEur(Number(p.amount))}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${promiseStatusColors[p.status] ?? ""}`}>{p.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {p.status === "Pending" && (
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-emerald-700"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "Kept" })}
                          >
                            Kept
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs text-red-700"
                            disabled={update.isPending}
                            onClick={() => update.mutate({ id: p.id, status: "Broken" })}
                          >
                            Broken
                          </Button>
                        </div>
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
  );
}

function GroupNotesCard({ group }: { group: string }) {
  const utils = trpc.useUtils();
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const { data: notes, isLoading } = trpc.customers.groupNotes.useQuery({ group });
  const add = trpc.customers.addGroupNote.useMutation({
    onSuccess: () => {
      setContent("");
      utils.customers.groupNotes.invalidate({ group });
    },
    onError: e => toast.error(e.message),
  });
  const update = trpc.customers.updateGroupNote.useMutation({
    onSuccess: () => {
      setEditingId(null);
      utils.customers.groupNotes.invalidate({ group });
    },
    onError: e => toast.error(e.message),
  });
  const del = trpc.customers.deleteGroupNote.useMutation({
    onSuccess: () => utils.customers.groupNotes.invalidate({ group }),
    onError: e => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <StickyNote className="h-4 w-4" /> Group Notes
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Add a note about this group (calls, agreements, context)…"
            className="min-h-16"
          />
          <Button
            size="sm"
            className="self-end"
            disabled={!content.trim() || add.isPending}
            onClick={() => add.mutate({ group, content: content.trim() })}
          >
            Add
          </Button>
        </div>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : !notes || notes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-auto pr-1">
            {notes.map(n => (
              <div key={n.id} className="rounded-md border p-2.5 text-sm">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-[11px] text-muted-foreground">
                    {n.authorName} · {new Date(n.createdAt).toLocaleString()}
                  </span>
                  <div className="flex gap-0.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground"
                      onClick={() => {
                        setEditingId(n.id);
                        setEditContent(n.content);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
                      onClick={() => del.mutate({ id: n.id })}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {editingId === n.id ? (
                  <div className="space-y-2">
                    <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="min-h-16" />
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={!editContent.trim() || update.isPending}
                        onClick={() => update.mutate({ id: n.id, content: editContent.trim() })}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{n.content}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GroupAiSummaryCard({ group }: { group: string }) {
  const [summary, setSummary] = useState<{ text: string; at: number } | null>(null);
  const gen = trpc.customers.groupAiSummary.useMutation({
    onSuccess: r => setSummary({ text: r.summary, at: r.generatedAt }),
    onError: e => toast.error(e.message),
  });
  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4" /> AI Summary
        </CardTitle>
        <Button size="sm" variant="outline" className="gap-1.5" disabled={gen.isPending} onClick={() => gen.mutate({ group })}>
          {gen.isPending ? <Spinner className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {gen.isPending ? "Analyzing…" : summary ? "Regenerate" : "Generate Summary"}
        </Button>
      </CardHeader>
      <CardContent>
        {gen.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
        ) : summary ? (
          <div>
            <div className="text-sm whitespace-pre-wrap leading-relaxed">{summary.text}</div>
            <p className="text-[11px] text-muted-foreground mt-2">Generated {new Date(summary.at).toLocaleString()}</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Generate an AI snapshot of this group: exposure, overdue risk, payment behavior, promises, open tasks and notes — useful before a
            collection call.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

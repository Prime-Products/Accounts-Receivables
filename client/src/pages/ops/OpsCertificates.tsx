import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { VesselLink } from "@/components/VesselLink";
import { fmtDate } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { CERT_REMINDER_DAYS, certUrgencyClass, type CertUrgency } from "@shared/certificateExpiry";
import { matchesAllTokens } from "@shared/textMatch";
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type SortKey = "certificateNumber" | "assetName" | "expiryDate" | "issueDate";

const COL_DEFAULTS: Record<string, number> = {
  certificateNumber: 150,
  asset: 180,
  vessel: 150,
  issueDate: 110,
  expiryDate: 110,
  daysLeft: 120,
  actions: 70,
};

/** Filter buckets mirror the reminder windows, so what you see is what gets chased. */
const URGENCY_FILTERS = [
  { value: "all", label: "All certificates" },
  { value: "expired", label: "Expired" },
  { value: "final", label: `Final notice (≤${Math.min(...CERT_REMINDER_DAYS)}d)` },
  { value: "warning", label: `Renewal due (≤${Math.max(...CERT_REMINDER_DAYS)}d)` },
  { value: "ok", label: "Not due yet" },
] as const;

const URGENCY_BADGE: Record<CertUrgency, { label: string; className: string }> = {
  expired: { label: "Expired", className: "bg-red-100 text-red-700 border-red-200" },
  final: { label: "Final notice", className: "bg-red-50 text-red-700 border-red-200" },
  warning: { label: "Renewal due", className: "bg-amber-100 text-amber-800 border-amber-200" },
  ok: { label: "Valid", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
};

/** `<input type="date">` wants `yyyy-mm-dd`; timestamps are what we store. */
const toDateInput = (ts: number | null | undefined) =>
  ts == null ? "" : new Date(ts).toISOString().slice(0, 10);

export default function OpsCertificates() {
  const { data: certs, isLoading } = trpc.opsCertificates.list.useQuery({});
  const { data: assets } = trpc.opsAssets.list.useQuery({});
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("expiryDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const cols = useResizableColumns("ops-certificates", COL_DEFAULTS);

  /* ─── Create / edit dialog ─────────────────────────────────────────────── */
  const EMPTY_FORM = { assetId: "", certificateNumber: "", issueDate: "", expiryDate: "", notes: "" };
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [assetSearch, setAssetSearch] = useState("");

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAssetSearch("");
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAssetSearch("");
    setDialogOpen(true);
  };

  const openEdit = (c: NonNullable<typeof certs>[number]) => {
    setEditingId(c.id);
    setForm({
      assetId: String(c.assetId),
      certificateNumber: c.certificateNumber,
      issueDate: toDateInput(c.issueDate),
      expiryDate: toDateInput(c.expiryDate),
      notes: c.notes ?? "",
    });
    setAssetSearch("");
    setDialogOpen(true);
  };

  /** Equipment list can run long, so the picker carries its own search box. */
  const assetOptions = useMemo(() => {
    const list = assets ?? [];
    const q = assetSearch.trim();
    const matched = q
      ? list.filter(a => matchesAllTokens(q, [a.name, a.serialNumber, a.vesselName ?? ""]))
      : list;
    return matched.slice(0, 60);
  }, [assets, assetSearch]);

  const invalidate = () => {
    utils.opsCertificates.list.invalidate();
    utils.opsAssets.list.invalidate();
    utils.opsDashboard.summary.invalidate();
  };

  const create = trpc.opsCertificates.create.useMutation({
    onSuccess: () => { toast.success("Certificate added"); invalidate(); closeDialog(); },
    onError: e => toast.error(e.message),
  });
  const update = trpc.opsCertificates.update.useMutation({
    onSuccess: () => { toast.success("Certificate updated"); invalidate(); closeDialog(); },
    onError: e => toast.error(e.message),
  });
  const runReminders = trpc.opsCertificates.runReminders.useMutation({
    onSuccess: r => {
      toast.success(
        r.created === 0
          ? "No new reminders — everything due has already been raised"
          : `${r.created} reminder task${r.created !== 1 ? "s" : ""} created`,
      );
      utils.tasks.invalidate();
      invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const submit = () => {
    const assetId = Number(form.assetId);
    const issueDate = form.issueDate ? new Date(form.issueDate).getTime() : Date.now();
    const expiryDate = new Date(form.expiryDate).getTime();
    if (editingId != null) {
      update.mutate({
        id: editingId,
        certificateNumber: form.certificateNumber.trim(),
        issueDate,
        expiryDate,
        notes: form.notes.trim() || null,
      });
    } else {
      create.mutate({
        assetId,
        certificateNumber: form.certificateNumber.trim(),
        issueDate,
        expiryDate,
        notes: form.notes.trim() || undefined,
      });
    }
  };

  const formValid =
    form.certificateNumber.trim().length > 0 &&
    form.expiryDate.length > 0 &&
    (editingId != null || form.assetId.length > 0);

  /* ─── Table ────────────────────────────────────────────────────────────── */
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    if (!certs) return [];
    const q = search.trim();
    let rows = q
      ? certs.filter(c => matchesAllTokens(q, [c.certificateNumber, c.assetName, c.assetSerial, c.vesselName ?? ""]))
      : certs;
    if (urgencyFilter !== "all") rows = rows.filter(c => c.urgency === urgencyFilter);
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey as keyof typeof a];
      const vb = b[sortKey as keyof typeof b];
      if (typeof va === "string") return String(va).localeCompare(String(vb ?? "")) * dir;
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [certs, search, urgencyFilter, sortKey, sortDir]);

  /** Counts drive the header line so the size of the problem is visible at a glance. */
  const counts = useMemo(() => {
    const c = { expired: 0, final: 0, warning: 0 };
    for (const row of certs ?? []) {
      if (row.urgency === "expired") c.expired++;
      else if (row.urgency === "final") c.final++;
      else if (row.urgency === "warning") c.warning++;
    }
    return c;
  }, [certs]);

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 ml-1" /> : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  if (isLoading) {
    return (
      <div className="p-2 sm:p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Certificates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} certificate{filtered.length !== 1 ? "s" : ""}
            {counts.expired > 0 && <span className="text-red-700 font-medium"> · {counts.expired} expired</span>}
            {counts.final > 0 && <span className="text-red-700 font-medium"> · {counts.final} final notice</span>}
            {counts.warning > 0 && <span className="text-amber-700 font-medium"> · {counts.warning} renewal due</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="gap-2"
            disabled={runReminders.isPending}
            onClick={() => runReminders.mutate()}
            title="Create the reminder tasks that are due (60 and 15 days before expiry). Safe to run more than once."
          >
            <BellRing className="h-4 w-4" />
            {runReminders.isPending ? "Checking..." : "Run reminders"}
          </Button>
          <Button className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" /> New Certificate
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search certificates..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {URGENCY_FILTERS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table style={{ tableLayout: "fixed", width: cols.totalWidth }}>
              <TableHeader>
                <TableRow>
                  <TableHead style={cols.style("certificateNumber")} className="relative cursor-pointer select-none" onClick={() => toggleSort("certificateNumber")}>
                    <span className="flex items-center">Certificate # <SortIcon col="certificateNumber" /></span>
                    <ColResizer col="certificateNumber" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("asset")} className="relative cursor-pointer select-none" onClick={() => toggleSort("assetName")}>
                    <span className="flex items-center">Equipment <SortIcon col="assetName" /></span>
                    <ColResizer col="asset" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("vessel")} className="relative">
                    <span>Vessel</span>
                    <ColResizer col="vessel" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("issueDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("issueDate")}>
                    <span className="flex items-center">Issued <SortIcon col="issueDate" /></span>
                    <ColResizer col="issueDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("expiryDate")} className="relative cursor-pointer select-none" onClick={() => toggleSort("expiryDate")}>
                    <span className="flex items-center">Expires <SortIcon col="expiryDate" /></span>
                    <ColResizer col="expiryDate" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("daysLeft")} className="relative text-center">
                    <span>Days Left</span>
                    <ColResizer col="daysLeft" api={cols} />
                  </TableHead>
                  <TableHead style={cols.style("actions")} className="relative text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p>No certificates found</p>
                      <p className="text-xs mt-1">
                        Add one with “New Certificate”, or enter the certificate while creating the equipment.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(c => {
                    const badge = URGENCY_BADGE[c.urgency as CertUrgency];
                    return (
                      <TableRow key={c.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm truncate">{c.certificateNumber}</TableCell>
                        <TableCell>
                          <div className="font-medium truncate">{c.assetName}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.assetSerial}</div>
                        </TableCell>
                        <TableCell className="text-sm truncate">
                          <VesselLink vesselId={c.vesselId} name={c.vesselName} />
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(c.issueDate)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(c.expiryDate)}</TableCell>
                        <TableCell className="text-center text-sm">
                          {c.urgency === "ok" ? (
                            <span className="text-muted-foreground">{c.daysLeft}d</span>
                          ) : (
                            <Badge variant="outline" className={badge.className} title={`${c.daysLeft}d`}>
                              {c.urgency === "expired" ? badge.label : `${badge.label} · ${c.daysLeft}d`}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(c)} title="Edit certificate">
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ─── Create / Edit Certificate ─────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={o => (o ? setDialogOpen(true) : closeDialog())}>
        <ResizableDialogContent storageKey="ops-certificate-form" defaultWidth={540} defaultHeight={520} minWidth={420} minHeight={380}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingId != null ? <Pencil className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
              {editingId != null ? "Edit Certificate" : "New Certificate"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 overflow-y-auto pr-1">
            <div className="space-y-1.5 col-span-2">
              <Label>Equipment *</Label>
              {editingId != null ? (
                <p className="text-sm border rounded-md px-3 py-2 bg-muted/40">
                  {certs?.find(c => c.id === editingId)?.assetName} — {certs?.find(c => c.id === editingId)?.assetSerial}
                </p>
              ) : (assets ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground border rounded-md px-3 py-2 bg-muted/40">
                  No equipment registered yet — add equipment first, then its certificate.
                </p>
              ) : (
                <Select value={form.assetId} onValueChange={v => setForm({ ...form, assetId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select equipment" /></SelectTrigger>
                  <SelectContent>
                    <div className="p-2 sticky top-0 bg-popover z-10">
                      <Input
                        placeholder="Search by name, serial or vessel..."
                        value={assetSearch}
                        onChange={e => setAssetSearch(e.target.value)}
                        onKeyDown={e => e.stopPropagation()}
                        className="h-8"
                      />
                    </div>
                    {assetOptions.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No equipment matches "{assetSearch}"</p>
                    ) : (
                      assetOptions.map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name} — {a.serialNumber}{a.vesselName ? ` (${a.vesselName})` : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-1.5 col-span-2">
              <Label>Certificate Number *</Label>
              <Input
                value={form.certificateNumber}
                onChange={e => setForm({ ...form, certificateNumber: e.target.value })}
                placeholder="e.g. CAL-2026-01187"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Issue Date <span className="text-muted-foreground font-normal">(defaults to today)</span></Label>
              <Input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Expiry Date *</Label>
              <Input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} />
            </div>
            {form.expiryDate && (
              <p className={`col-span-2 text-xs ${certUrgencyClass(new Date(form.expiryDate).getTime()) || "text-muted-foreground"}`}>
                Reminders will be raised {CERT_REMINDER_DAYS.slice().sort((a, b) => b - a).join(" and ")} days before this date.
              </p>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Calibration lab, gas mix, remarks..."
                className="min-h-[64px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button disabled={!formValid || create.isPending || update.isPending} onClick={submit}>
              {create.isPending || update.isPending
                ? "Saving..."
                : editingId != null ? "Save Changes" : "Add Certificate"}
            </Button>
          </DialogFooter>
        </ResizableDialogContent>
      </Dialog>
    </div>
  );
}

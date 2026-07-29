import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { InvoicesTable } from "@/components/InvoicesTable";
import { fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Anchor, FileText, Flag, Pencil, Ship } from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { toast } from "sonner";

export default function VesselDetail() {
  const [, params] = useRoute("/vessels/:id");
  const id = Number(params?.id);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.vessels.detail.useQuery({ id }, { enabled: Number.isFinite(id) });

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ imo: "", vesselType: "", flag: "", notes: "" });
  const updateVessel = trpc.vessels.update.useMutation({
    onSuccess: () => {
      toast.success("Vessel updated");
      utils.vessels.invalidate();
      setEditOpen(false);
    },
    onError: e => toast.error(e.message),
  });

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <Button variant="outline" size="sm" onClick={() => navigate("/vessels")} className="gap-1.5">
          <ArrowLeft className="h-4 w-4" /> Vessels
        </Button>
        <div className="text-muted-foreground">Vessel not found.</div>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const { vessel, stats, invoices, relatedCompanies } = data;

  const openEdit = () => {
    setForm({
      imo: vessel.imo ?? "",
      vesselType: vessel.vesselType ?? "",
      flag: vessel.flag ?? "",
      notes: vessel.notes ?? "",
    });
    setEditOpen(true);
  };

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Button variant="ghost" size="sm" onClick={() => navigate("/vessels")} className="gap-1.5 -ml-2 h-7 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Vessels
          </Button>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ship className="h-6 w-6 text-sky-600" /> {vessel.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {vessel.imo && (
              <Badge variant="outline" className="gap-1 font-mono">
                <Anchor className="h-3 w-3" /> IMO {vessel.imo}
              </Badge>
            )}
            {vessel.vesselType && <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">{vessel.vesselType}</Badge>}
            {vessel.flag && (
              <Badge variant="outline" className="gap-1">
                <Flag className="h-3 w-3" /> {vessel.flag}
              </Badge>
            )}
          </div>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={openEdit}>
          <Pencil className="h-3.5 w-3.5" /> Edit details
        </Button>
      </div>

      {/* Info + owner */}
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground">Vessel information</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">IMO number</div>
              <div className="font-mono">{vessel.imo || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Vessel type</div>
              <div>{vessel.vesselType || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Flag</div>
              <div>{vessel.flag || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Owner / Group</div>
              <div>
                {vessel.ownerGroup ? (
                  <Link href={`/groups/${encodeURIComponent(vessel.ownerGroup)}`} className="text-primary hover:underline underline-offset-2">
                    {vessel.ownerGroup}
                  </Link>
                ) : relatedCompanies.length > 0 ? (
                  <Link href={`/groups/${encodeURIComponent(relatedCompanies[0].group)}`} className="text-primary hover:underline underline-offset-2">
                    {relatedCompanies[0].group}
                  </Link>
                ) : (
                  "—"
                )}
              </div>
            </div>
            {vessel.notes && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground">Notes</div>
                <div className="whitespace-pre-wrap">{vessel.notes}</div>
              </div>
            )}
            {relatedCompanies.length > 0 && (
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground mb-1">Invoiced by</div>
                <div className="flex flex-wrap gap-1.5">
                  {relatedCompanies.map(c => (
                    <Link key={c.id} href={`/customers/${c.id}`}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted font-normal">{c.name}</Badge>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Financial summary */}
        <div className="grid grid-cols-2 gap-3 content-start">
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Open balance</div>
              <div className="text-lg font-bold font-mono">{fmtEur(stats.openBalance)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Overdue</div>
              <div className={`text-lg font-bold font-mono ${stats.overdueAmount > 0 ? "text-red-600" : ""}`}>{fmtEur(stats.overdueAmount)}</div>
              <div className="text-[11px] text-muted-foreground">
                {stats.overdueCount > 0 ? `${stats.overdueCount} invoice(s) · max ${stats.maxDaysOverdue}d` : "nothing overdue"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total invoiced</div>
              <div className="text-lg font-bold font-mono">{fmtEur(stats.totalInvoiced)}</div>
              <div className="text-[11px] text-muted-foreground">{stats.invoiceCount} invoice(s)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">Total paid</div>
              <div className="text-lg font-bold font-mono text-emerald-700">{fmtEur(stats.totalPaid)}</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Invoices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <FileText className="h-4 w-4" /> Invoices for this vessel ({invoices.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {invoices.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">No invoices linked to this vessel yet.</div>
          ) : (
            <InvoicesTable rows={invoices} onDisputeChanged={() => utils.vessels.detail.invalidate({ id })} />
          )}
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Ship className="h-5 w-5 text-sky-600" /> Edit {vessel.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-imo">IMO number</Label>
              <Input id="v-imo" value={form.imo} onChange={e => setForm({ ...form, imo: e.target.value })} placeholder="e.g. 9321483" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-type">Vessel type</Label>
              <Input id="v-type" value={form.vesselType} onChange={e => setForm({ ...form, vesselType: e.target.value })} placeholder="e.g. Container Ship, Bulk Carrier, Tanker" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-flag">Flag</Label>
              <Input id="v-flag" value={form.flag} onChange={e => setForm({ ...form, flag: e.target.value })} placeholder="e.g. Liberia, Malta, Panama" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-notes">Notes</Label>
              <Textarea id="v-notes" rows={3} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              disabled={updateVessel.isPending}
              onClick={() =>
                updateVessel.mutate({
                  id,
                  imo: form.imo.trim() || null,
                  vesselType: form.vesselType.trim() || null,
                  flag: form.flag.trim() || null,
                  notes: form.notes.trim() || null,
                })
              }
            >
              {updateVessel.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

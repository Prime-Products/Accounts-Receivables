import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { InvoicesTable } from "@/components/InvoicesTable";
import { VesselProductsTable, vesselSupplySummary } from "@/components/VesselProductsTable";
import { fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Anchor, FileText, FileSignature, Flag, Package, Ship } from "lucide-react";
import { Link } from "wouter";

/**
 * Inline vessel detail dialog: opens on top of the current page (no navigation)
 * showing the vessel's information, financial KPIs and its invoices.
 */
export function VesselDetailDialog({
  vesselId,
  open,
  onOpenChange,
}: {
  vesselId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const { data, isLoading, error } = trpc.vessels.detail.useQuery(
    { id: vesselId ?? -1 },
    { enabled: open && vesselId != null },
  );

  const vessel = data?.vessel;
  const stats = data?.stats;
  const invoices = data?.invoices ?? [];
  const relatedCompanies = data?.relatedCompanies ?? [];
  // Prime 247 contracts this vessel is enrolled in.
  const contracts = data?.contracts ?? [];
  // Everything the vessel is entitled to under those contracts, read exactly like the
  // contract's Products card so the modal is the full vessel view, not a summary.
  const contractItems = data?.contractItems ?? [];
  const supply = vesselSupplySummary(contractItems);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * The modal is a fixed-size shell: header stays put and only the body scrolls, so a
       * wide Products table can never push the KPI row past the dialog edge.
       */}
      <ResizableDialogContent
        storageKey="vessel-detail"
        className="sm:max-w-none w-[68rem] max-w-[96vw] h-[88vh] max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0"
      >
        <DialogHeader className="shrink-0 border-b px-6 py-4">
          <DialogTitle className="flex items-center gap-2">
            <Ship className="h-5 w-5 text-sky-600" />
            {vessel ? vessel.name : "Vessel"}
          </DialogTitle>
          {vessel && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {vessel.imo && (
                <Badge variant="outline" className="gap-1 font-mono">
                  <Anchor className="h-3 w-3" /> IMO {vessel.imo}
                </Badge>
              )}
              {vessel.vesselType && (
                <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">{vessel.vesselType}</Badge>
              )}
              {vessel.flag && (
                <Badge variant="outline" className="gap-1">
                  <Flag className="h-3 w-3" /> {vessel.flag}
                </Badge>
              )}
              {contracts.length > 0 && (
                <Badge variant="outline" className="gap-1 bg-violet-50 text-violet-700 border-violet-200">
                  <FileSignature className="h-3 w-3" /> {contracts.length} contract{contracts.length === 1 ? "" : "s"}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        {error ? (
          <div className="py-8 text-center text-muted-foreground">Vessel not found.</div>
        ) : isLoading || !vessel || !stats ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Open balance</div>
                  <div className="text-lg font-bold font-mono">{fmtEur(stats.openBalance)}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Overdue</div>
                  <div className={`text-lg font-bold font-mono ${stats.overdueAmount > 0 ? "text-red-600" : ""}`}>{fmtEur(stats.overdueAmount)}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {stats.overdueCount > 0 ? `${stats.overdueCount} invoice(s) · max ${stats.maxDaysOverdue}d` : "nothing overdue"}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total invoiced</div>
                  <div className="text-lg font-bold font-mono">{fmtEur(stats.totalInvoiced)}</div>
                  <div className="text-[11px] text-muted-foreground">{stats.invoiceCount} invoice(s)</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-3">
                  <div className="text-xs text-muted-foreground">Total paid</div>
                  <div className="text-lg font-bold font-mono text-emerald-700">{fmtEur(stats.totalPaid)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Info */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm rounded-lg border bg-muted/30 p-4">
              <div>
                <div className="text-xs text-muted-foreground">Owner / Group</div>
                <div>
                  {vessel.ownerGroup ? (
                    <Link
                      href={`/groups/${encodeURIComponent(vessel.ownerGroup)}`}
                      className="text-primary hover:underline underline-offset-2"
                      onClick={() => onOpenChange(false)}
                    >
                      {vessel.ownerGroup}
                    </Link>
                  ) : relatedCompanies.length > 0 ? (
                    <Link
                      href={`/groups/${encodeURIComponent(relatedCompanies[0].group)}`}
                      className="text-primary hover:underline underline-offset-2"
                      onClick={() => onOpenChange(false)}
                    >
                      {relatedCompanies[0].group}
                    </Link>
                  ) : (
                    "—"
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">IMO / Type / Flag</div>
                <div className="font-mono text-xs pt-0.5">
                  {[vessel.imo, vessel.vesselType, vessel.flag].filter(Boolean).join(" · ") || "—"}
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
                      <Link key={c.id} href={`/customers/${c.id}`} onClick={() => onOpenChange(false)}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted font-normal">{c.name}</Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <div className="text-xs text-muted-foreground mb-1">
                  Prime 247 contracts ({contracts.length})
                </div>
                {contracts.length === 0 ? (
                  <div className="text-muted-foreground text-xs">Not enrolled in any contract yet.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {contracts.map(c => (
                      <Link key={c.id} href={`/ops/contracts/${c.id}`} onClick={() => onOpenChange(false)}>
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:bg-muted font-normal gap-1"
                          title={c.title ?? undefined}
                        >
                          <span className="font-mono text-[11px]">{c.contractNumber ?? `#${c.id}`}</span>
                          {c.status && <span className="text-muted-foreground">· {c.status}</span>}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Products — the contract's Products card, scoped to this vessel */}
            <div>
              <div className="flex items-end justify-between gap-3 mb-2">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
                    <Package className="h-4 w-4" /> Products
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Grouped by nature — equipment first, then consumables and anything else supplied to this vessel
                  </p>
                </div>
                {supply.unitsTotal > 0 && (
                  <div className="text-right">
                    <div className="text-sm font-semibold font-mono">
                      {supply.unitsSupplied} / {supply.unitsTotal}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {supply.linesOutstanding > 0 ? `${supply.linesOutstanding} line(s) still to deliver` : "nothing outstanding"}
                    </div>
                  </div>
                )}
              </div>
              {contractItems.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm rounded-lg border">
                  This vessel is not assigned to any Prime 247 contract yet. Items appear here as soon as the vessel joins a contract.
                </div>
              ) : (
                <div className="rounded-lg border">
                  <VesselProductsTable items={contractItems} onNavigate={() => onOpenChange(false)} />
                </div>
              )}
            </div>

            {/* Invoices */}
            <div>
              <div className="text-sm font-semibold text-muted-foreground flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4" /> Invoices for this vessel ({invoices.length})
              </div>
              {invoices.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground rounded-lg border">No invoices linked to this vessel yet.</div>
              ) : (
                <div className="rounded-lg border overflow-x-auto">
                  <InvoicesTable
                    rows={invoices}
                    disableVesselDialog
                    onDisputeChanged={() => utils.vessels.detail.invalidate({ id: vesselId ?? -1 })}
                  />
                </div>
              )}
            </div>
          </div>
        )}
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}

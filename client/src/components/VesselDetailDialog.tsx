import { ResizableDialogContent } from "@/components/ResizableDialogContent";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoicesTable } from "@/components/InvoicesTable";
import { VesselProductsTable, vesselSupplySummary } from "@/components/VesselProductsTable";
import { trpc } from "@/lib/trpc";
import { Anchor, FileText, FileSignature, Flag, Package, Ship } from "lucide-react";
import { Link } from "wouter";

/**
 * Inline vessel detail dialog: opens on top of the current page (no navigation)
 * showing the vessel's information, then its Products and Invoices as tabs. There is
 * deliberately no metric row: the vessel card is a record view, and the receivables
 * figures live on the customer/group pages and in Invoices.
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
  const invoices = data?.invoices ?? [];
  const relatedCompanies = data?.relatedCompanies ?? [];
  // Prime 247 contracts this vessel is enrolled in.
  const contracts = data?.contracts ?? [];
  // Everything the vessel is entitled to under those contracts, read exactly like the
  // contract's Products card so the modal is the full vessel view, not a summary.
  const contractItems = data?.contractItems ?? [];
  const supply = vesselSupplySummary(contractItems);

  /*
   * Ownership chain shown under the header. The group is the umbrella; the "group company"
   * is the specific member of it that the vessel sits under — the registered owner when the
   * vessel is linked to one, otherwise the company that has billed it most. Any remaining
   * companies of the group that also billed the vessel are listed separately, which is what
   * the old, unexplained "Invoiced by" row was trying to say.
   */
  const billingCompanies = [...relatedCompanies].sort(
    (a, b) => Number(b.isOwner) - Number(a.isOwner) || b.invoiceCount - a.invoiceCount,
  );
  const ownerCompany = billingCompanies[0] ?? null;
  const otherBillingCompanies = billingCompanies.slice(1).filter(c => c.invoiceCount > 0);
  const groupName = vessel?.ownerGroup ?? ownerCompany?.group ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
       * The modal is a fixed-size shell: header stays put and only the body scrolls, so a
       * wide Products table can never push the layout past the dialog edge.
       */}
      <ResizableDialogContent
        storageKey="vessel-detail"
        className="sm:max-w-none w-[min(68rem,94vw)] max-w-[94vw] h-[88vh] max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0"
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

        {/*
         * The body is the only scroll container: min-w-0 stops a wide table from stretching the
         * dialog, and overflow-auto (not just -y) means a table wider than the dialog can be
         * scrolled to instead of being clipped at the right edge.
         */}
        <div className="flex-1 min-w-0 overflow-auto px-6 py-4">
        {error ? (
          <div className="py-8 text-center text-muted-foreground">Vessel not found.</div>
        ) : isLoading || !vessel ? (
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-48" />
          </div>
        ) : (
          <div className="space-y-4 min-w-0">
            {/* Info */}
            {/*
             * IMO, type and flag are already stated as badges in the header, so they are not
             * repeated here. What this block adds is the chain of ownership: which group the
             * vessel belongs to, and which company inside that group it sits under / is billed by.
             */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm rounded-lg border bg-muted/30 p-4">
              <div className="col-span-2 grid grid-cols-2 gap-x-6 gap-y-3">
                <div>
                  <div className="text-xs text-muted-foreground">Owner / Group</div>
                  <div>
                    {groupName ? (
                      <Link
                        href={`/groups/${encodeURIComponent(groupName)}`}
                        className="text-primary hover:underline underline-offset-2"
                        onClick={() => onOpenChange(false)}
                      >
                        {groupName}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Group company</div>
                  {ownerCompany ? (
                    <div>
                      <Link
                        href={`/customers/${ownerCompany.id}`}
                        className="text-primary hover:underline underline-offset-2"
                        onClick={() => onOpenChange(false)}
                      >
                        {ownerCompany.name}
                      </Link>
                      {ownerCompany.isOwner && (
                        <span className="text-xs text-muted-foreground"> · registered owner</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">Not linked to a company of the group yet</div>
                  )}
                </div>
              </div>
              {otherBillingCompanies.length > 0 && (
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground mb-1">
                    Other companies of the group billing this vessel
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {otherBillingCompanies.map(c => (
                      <Link key={c.id} href={`/customers/${c.id}`} onClick={() => onOpenChange(false)}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted font-normal gap-1">
                          {c.name}
                          <span className="text-muted-foreground font-mono text-[11px]">
                            {c.invoiceCount} inv
                          </span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
              {vessel.notes && (
                <div className="col-span-2">
                  <div className="text-xs text-muted-foreground">Notes</div>
                  <div className="whitespace-pre-wrap">{vessel.notes}</div>
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

            {/*
             * Products and Invoices are two ways of looking at the same vessel — what it is
             * entitled to, and what it has been billed. Stacking both tables made the modal a
             * long scroll, so they are tabs: pick one, see it whole. Products opens first
             * because it is what the office looks at when a vessel is on the phone.
             */}
            <Tabs defaultValue="products">
              <TabsList>
                <TabsTrigger value="products" className="gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Products
                  {contractItems.length > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">({contractItems.length})</span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="invoices" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" /> Invoices
                  {invoices.length > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">({invoices.length})</span>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* Products — the contract's Products card, scoped to this vessel */}
              <TabsContent value="products" className="mt-3">
                <div className="flex items-end justify-between gap-3 mb-2">
                  <p className="text-xs text-muted-foreground">
                    Grouped by nature — equipment first, then consumables and anything else supplied to this vessel
                  </p>
                  {supply.unitsTotal > 0 && (
                    <div className="text-right shrink-0">
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
              </TabsContent>

              <TabsContent value="invoices" className="mt-3">
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
              </TabsContent>
            </Tabs>
          </div>
        )}
        </div>
      </ResizableDialogContent>
    </Dialog>
  );
}

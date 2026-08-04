import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SupplyBadge } from "@/components/SupplyBadge";
import { fmtEur } from "@/lib/format";
import { groupContractProducts, productGroupBadgeColors } from "@shared/productGrouping";
import { ChevronRight } from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { Link } from "wouter";

/** Same status palette as the Equipment page, so a status reads identically everywhere. */
const assetStatusColors: Record<string, string> = {
  "Not Supplied": "bg-gray-100 text-gray-700 border-gray-200",
  "In Transit": "bg-indigo-100 text-indigo-800 border-indigo-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Pending Return": "bg-amber-100 text-amber-800 border-amber-200",
  Returned: "bg-sky-100 text-sky-800 border-sky-200",
};

/** Colour a certificate countdown by how close it is to the reminder thresholds. */
function certToneClass(days: number | null): string {
  if (days == null) return "text-muted-foreground";
  if (days < 0) return "text-red-600 font-medium";
  if (days <= 15) return "text-orange-600 font-medium";
  if (days <= 60) return "text-amber-600";
  return "text-muted-foreground";
}

/** Stable key for one contract line on this vessel, used for expand/collapse. */
const itemKey = (item: { contractId: number | null; id: number }) => `${item.contractId}-${item.id}`;

export type VesselContractItem = {
  id: number;
  contractId: number | null;
  contractNumber: string | null;
  itemType: string;
  name: string;
  quantity: number;
  notes: string | null;
  quotaType: string | null;
  quotaLimit: number | null;
  sellingPrice: string | number;
  unitsExpected: number;
  unitsSupplied: number;
  serials: {
    id: number;
    serialNumber: string;
    status: string;
    targetReturnPort: string | null;
    notes: string | null;
    updatedAt: number | null;
    certificateNumber: string | null;
    certificateExpiry: number | null;
    daysUntilCertificateExpiry: number | null;
  }[];
};

/**
 * The contract's Products card, scoped to one vessel: grouped by nature (Equipment
 * first, then Consumables, then anything else) with per-group value, per-line supply
 * badges, expandable serial detail and a closing vessel total. Shared by the vessel
 * page and the vessel modal so a vessel reads the same wherever it is opened.
 */
export function VesselProductsTable({
  items,
  onNavigate,
}: {
  items: VesselContractItem[];
  /** Called before following a link, so a modal can close itself first. */
  onNavigate?: () => void;
}) {
  const groups = useMemo(() => groupContractProducts(items), [items]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const unitsTotal = items.reduce((s, i) => s + i.unitsExpected, 0);
  const unitsSupplied = items.reduce((s, i) => s + i.unitsSupplied, 0);
  const vesselValue = items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead className="text-center">Qty / Vessel</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Line Total</TableHead>
            <TableHead>Quota</TableHead>
            <TableHead>Supply</TableHead>
            <TableHead>Contract</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(group => (
            <Fragment key={group.group}>
              {/* Same badge heading as the contract card, with the per-vessel value */}
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                <TableCell colSpan={7} className="py-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={productGroupBadgeColors[group.group] ?? ""}>{group.label}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {group.items.length} line{group.items.length !== 1 ? "s" : ""} ·{" "}
                      {fmtEur(group.items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0))} per vessel
                    </span>
                  </div>
                </TableCell>
              </TableRow>
              {group.items.map(item => (
                <Fragment key={itemKey(item)}>
                  <TableRow
                    className={`${item.serials.length > 0 ? "cursor-pointer" : ""} ${expanded.has(itemKey(item)) ? "border-b-0 bg-muted/20" : ""}`}
                    onClick={item.serials.length > 0 ? () => toggle(itemKey(item)) : undefined}
                  >
                    <TableCell className="pl-6">
                      <div className="flex items-start gap-1.5">
                        {/* The chevron only appears where there is serial detail to open. */}
                        {item.serials.length > 0 ? (
                          <ChevronRight
                            className={`h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground transition-transform duration-150 ${expanded.has(itemKey(item)) ? "rotate-90" : ""}`}
                          />
                        ) : (
                          <span className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="font-medium">{item.name}</div>
                          {item.notes && <div className="text-xs text-muted-foreground mt-0.5">{item.notes}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono text-sm">{item.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{fmtEur(Number(item.sellingPrice))}</TableCell>
                    <TableCell className="text-right font-mono text-sm font-semibold">
                      {fmtEur(Number(item.sellingPrice) * item.quantity)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.quotaType ? `${item.quotaLimit} / ${item.quotaType === "ContractLife" ? "contract" : "year"}` : "—"}
                    </TableCell>
                    <TableCell>
                      <SupplyBadge supplied={item.unitsSupplied} total={item.unitsExpected} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-between gap-2">
                        {item.contractId ? (
                          <Link
                            href={`/ops/contracts/${item.contractId}`}
                            onClick={e => { e.stopPropagation(); onNavigate?.(); }}
                            className="text-primary hover:underline underline-offset-2 font-mono text-xs"
                          >
                            {item.contractNumber ?? `#${item.contractId}`}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {item.serials.length > 0 && (
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                            {item.serials.length} serial(s)
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {/* One nested row per serial, carrying every field the Equipment page shows. */}
                  {item.serials.length > 0 && expanded.has(itemKey(item)) && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="pt-0 pb-3">
                        <div className="rounded-md border bg-muted/20 overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                <th className="text-left font-medium px-3 py-1.5">Serial number</th>
                                <th className="text-left font-medium px-3 py-1.5">Status</th>
                                <th className="text-left font-medium px-3 py-1.5">Certificate</th>
                                <th className="text-left font-medium px-3 py-1.5">Return port</th>
                                <th className="text-left font-medium px-3 py-1.5">Updated</th>
                                <th className="text-right font-medium px-3 py-1.5">Open</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.serials.map(u => (
                                <tr key={u.id} className="border-t">
                                  <td className="px-3 py-1.5 font-mono">{u.serialNumber}</td>
                                  <td className="px-3 py-1.5">
                                    <Badge variant="outline" className={assetStatusColors[u.status] ?? ""}>{u.status}</Badge>
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {u.certificateExpiry == null ? (
                                      <span className="text-muted-foreground">No certificate</span>
                                    ) : (
                                      <span className={certToneClass(u.daysUntilCertificateExpiry)}>
                                        {u.certificateNumber ? <span className="font-mono">{u.certificateNumber}</span> : null}
                                        {u.certificateNumber ? " · " : ""}
                                        {new Date(u.certificateExpiry).toLocaleDateString()}
                                        {" · "}
                                        {(u.daysUntilCertificateExpiry ?? 0) < 0
                                          ? `expired ${Math.abs(u.daysUntilCertificateExpiry ?? 0)}d ago`
                                          : `${u.daysUntilCertificateExpiry}d left`}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    {u.targetReturnPort || <span className="text-muted-foreground">—</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-muted-foreground">
                                    {u.updatedAt ? new Date(u.updatedAt).toLocaleDateString() : "—"}
                                  </td>
                                  <td className="px-3 py-1.5 text-right">
                                    <Link
                                      href={`/ops/assets?q=${encodeURIComponent(u.serialNumber)}`}
                                      onClick={() => onNavigate?.()}
                                      className="text-primary hover:underline underline-offset-2"
                                    >
                                      Equipment
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {item.serials.some(u => u.notes) && (
                          <div className="mt-1.5 space-y-0.5">
                            {item.serials.filter(u => u.notes).map(u => (
                              <div key={u.id} className="text-[11px] text-muted-foreground">
                                <span className="font-mono">{u.serialNumber}</span>: {u.notes}
                              </div>
                            ))}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </Fragment>
          ))}
          {/* Same closing total row as the contract card, scoped to this vessel */}
          <TableRow className="bg-muted/40 font-medium">
            <TableCell colSpan={3} className="text-sm">This vessel total</TableCell>
            <TableCell className="text-right font-mono text-sm">{fmtEur(vesselValue)}</TableCell>
            <TableCell colSpan={3} className="text-sm text-muted-foreground">
              {unitsTotal > 0 ? `${unitsSupplied} of ${unitsTotal} unit(s) supplied` : "—"}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

/** Supply progress across every line of a vessel's entitlement, in units not lines. */
export function vesselSupplySummary(items: VesselContractItem[]) {
  return {
    unitsTotal: items.reduce((s, i) => s + i.unitsExpected, 0),
    unitsSupplied: items.reduce((s, i) => s + i.unitsSupplied, 0),
    linesOutstanding: items.filter(i => i.unitsSupplied < i.unitsExpected).length,
    value: items.reduce((s, i) => s + Number(i.sellingPrice) * i.quantity, 0),
  };
}

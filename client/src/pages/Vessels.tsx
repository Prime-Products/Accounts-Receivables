import { ColResizer, useResizableColumns } from "@/components/ResizableTable";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VesselDetailDialog } from "@/components/VesselDetailDialog";
import { fmtEur } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { ArrowDown, ArrowUp, ArrowUpDown, Ship } from "lucide-react";
import { useMemo, useState } from "react";

type SortKey = "name" | "ownerGroup" | "vesselType" | "flag" | "openBalance" | "overdueAmount" | "invoiceCount";

const COL_DEFAULTS: Record<string, number> = {
  name: 200,
  imo: 90,
  vesselType: 110,
  flag: 90,
  ownerGroup: 220,
  invoiceCount: 90,
  openBalance: 130,
  overdueAmount: 130,
  maxDaysOverdue: 120,
};

export default function Vessels() {
  const { data: vessels, isLoading } = trpc.vessels.listWithStats.useQuery();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("openBalance");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [dialogVesselId, setDialogVesselId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = new URLSearchParams(window.location.search).get("vessel");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const [dialogOpen, setDialogOpen] = useState(dialogVesselId != null);
  const cols = useResizableColumns("vessels", COL_DEFAULTS);
  const openVessel = (id: number) => {
    setDialogVesselId(id);
    setDialogOpen(true);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      const descFirst: SortKey[] = ["openBalance", "overdueAmount", "invoiceCount"];
      setSortDir(descFirst.includes(key) ? "desc" : "asc");
    }
  };

  const filtered = useMemo(() => {
    if (!vessels) return [];
    const q = search.trim().toLowerCase();
    const rows = q
      ? vessels.filter(v =>
          v.name.toLowerCase().includes(q) ||
          (v.imo ?? "").toLowerCase().includes(q) ||
          (v.ownerGroup ?? "").toLowerCase().includes(q) ||
          (v.vesselType ?? "").toLowerCase().includes(q) ||
          (v.flag ?? "").toLowerCase().includes(q),
        )
      : vessels;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" || typeof vb === "string") {
        return String(va ?? "").toLowerCase().localeCompare(String(vb ?? "").toLowerCase()) * dir;
      }
      return ((Number(va) || 0) - (Number(vb) || 0)) * dir;
    });
  }, [vessels, search, sortKey, sortDir]);

  const totals = useMemo(() => {
    const src = filtered;
    return {
      open: src.reduce((s, v) => s + v.openBalance, 0),
      overdue: src.reduce((s, v) => s + v.overdueAmount, 0),
      invoices: src.reduce((s, v) => s + v.invoiceCount, 0),
    };
  }, [filtered]);

  const SortableHead = ({ label, k, align }: { label: string; k: SortKey; align?: "right" }) => (
    <TableHead className={`relative ${align === "right" ? "text-right" : ""}`} style={cols.style(k)}>
      <button
        type="button"
        onClick={() => toggleSort(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors select-none max-w-full pr-1 ${align === "right" ? "justify-end w-full" : ""} ${sortKey === k ? "text-foreground font-semibold" : ""}`}
        title={`Sort by ${label}`}
      >
        <span className="truncate">{label}</span>
        {sortKey === k ? (
          sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
      <ColResizer col={k} api={cols} />
    </TableHead>
  );

  return (
    <div className="p-2 sm:p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ship className="h-6 w-6 text-sky-600" /> Vessels
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All vessels with open balances, overdue amounts and invoicing history
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          className="flex-1 min-w-52"
          placeholder="Search vessel name, IMO, owner, type or flag…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {!isLoading && filtered.length > 0 && (
        <div className="rounded-lg border bg-muted/30 px-4 py-2.5 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span className="text-muted-foreground">{filtered.length} vessel(s)</span>
          <span>
            Open balance: <span className="font-mono font-semibold">{fmtEur(totals.open)}</span>
          </span>
          <span>
            Overdue: <span className="font-mono font-semibold text-red-600">{fmtEur(totals.overdue)}</span>
          </span>
          <span className="text-muted-foreground">{totals.invoices} invoice(s)</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground">
              {search ? "No vessels match the search." : "No vessels yet — vessels are created from invoice data."}
            </div>
          ) : (
            <Table className="table-fixed" style={{ width: cols.totalWidth, minWidth: "100%" }}>
              <TableHeader>
                <TableRow>
                  <SortableHead label="Vessel" k="name" />
                  <TableHead className="relative" style={cols.style("imo")}>
                    IMO
                    <ColResizer col="imo" api={cols} />
                  </TableHead>
                  <SortableHead label="Type" k="vesselType" />
                  <SortableHead label="Flag" k="flag" />
                  <SortableHead label="Owner / Group" k="ownerGroup" />
                  <SortableHead label="Invoices" k="invoiceCount" align="right" />
                  <SortableHead label="Open Balance" k="openBalance" align="right" />
                  <SortableHead label="Overdue" k="overdueAmount" align="right" />
                  <TableHead className="relative text-right" style={cols.style("maxDaysOverdue")}>
                    Max Days Overdue
                    <ColResizer col="maxDaysOverdue" api={cols} />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(v => (
                  <TableRow key={v.id}>
                    <TableCell className="font-medium overflow-hidden">
                      <button
                        type="button"
                        onClick={() => openVessel(v.id)}
                        className="inline-flex items-center gap-1.5 text-sky-700 hover:underline underline-offset-2 max-w-full"
                        title={`View vessel: ${v.name}`}
                      >
                        <Ship className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{v.name}</span>
                      </button>
                    </TableCell>
                    <TableCell className="font-mono text-sm text-muted-foreground">{v.imo || "—"}</TableCell>
                    <TableCell className="text-sm overflow-hidden">
                      <span className="block truncate" title={v.vesselType ?? undefined}>{v.vesselType || "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm overflow-hidden">
                      <span className="block truncate" title={v.flag ?? undefined}>{v.flag || "—"}</span>
                    </TableCell>
                    <TableCell className="text-sm overflow-hidden">
                      <span className="block truncate" title={v.ownerGroup ?? undefined}>{v.ownerGroup || "—"}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">{v.invoiceCount}</TableCell>
                    <TableCell className="text-right font-mono font-semibold">{v.openBalance > 0 ? fmtEur(v.openBalance) : "—"}</TableCell>
                    <TableCell className={`text-right font-mono ${v.overdueAmount > 0 ? "text-red-600 font-semibold" : ""}`}>
                      {v.overdueAmount > 0 ? (
                        <span>
                          {fmtEur(v.overdueAmount)}
                          <span className="block text-[11px] text-muted-foreground font-normal">{v.overdueCount} invoice(s)</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${v.maxDaysOverdue > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {v.maxDaysOverdue > 0 ? v.maxDaysOverdue : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <VesselDetailDialog
        vesselId={dialogVesselId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

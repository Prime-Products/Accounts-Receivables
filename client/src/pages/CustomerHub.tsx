import { PeopleRow } from "@/components/PeopleRow";
import WatchStatusSelect from "@/components/WatchStatusSelect";
import { VesselLink } from "@/components/VesselLink";
import { RecordBreadcrumb } from "@/components/RecordBreadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtEur, ratingColors } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  FileText,
  Layers,
  Lock,
  PieChart,
  Receipt,
  Ship,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { useLocation, useRoute } from "wouter";

/**
 * The customer hub — level 2 of the customer architecture.
 *
 *   1. identity  → who this customer is (name, status, people): the block at the top
 *   2. hub       → this page: the customer's home, with key figures and the modules
 *   3. modules   → Receivables (live) and its future siblings
 *
 * The hub deliberately holds no working tools of its own. Anything you *do* with a
 * customer happens inside a module, so this page stays readable as the account's
 * front page and each module can grow without crowding the others.
 */

/** One key figure on the hub. Kept flat and unstyled beyond emphasis so the numbers read fast. */
function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "warning";
}) {
  const valueTone =
    tone === "danger" ? "text-red-600" : tone === "warning" ? "text-amber-600" : "text-foreground";
  return (
    <div className="px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 font-mono text-xl font-bold ${valueTone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

/**
 * A module tile. Live modules navigate; planned ones say so plainly instead of
 * pretending to work — a disabled-looking card with a "Planned" badge and a toast.
 */
function ModuleTile({
  icon: Icon,
  title,
  description,
  stat,
  live,
  onOpen,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  stat?: string;
  live: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={live ? `Open ${title}` : `${title} — planned`}
      className={`group/tile flex h-full flex-col items-start gap-2 rounded-lg border p-4 text-left transition-[transform,box-shadow,background-color] duration-150 ease-out active:scale-[0.99] ${
        live
          ? "bg-card hover:border-primary/40 hover:shadow-sm"
          : "border-dashed bg-muted/30 hover:bg-muted/50"
      }`}
    >
      <div className="flex w-full items-center gap-2">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-md ${
            live ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="font-semibold">{title}</span>
        {live ? (
          <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover/tile:translate-x-0.5" />
        ) : (
          <Badge variant="outline" className="ml-auto gap-1 text-[10px] font-normal">
            <Lock className="h-3 w-3" /> Planned
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
      {stat && <p className="mt-auto pt-1 font-mono text-sm font-semibold">{stat}</p>}
    </button>
  );
}

export default function CustomerHub() {
  const [, params] = useRoute("/groups/:name");
  const [, navigate] = useLocation();
  const group = params?.name ? decodeURIComponent(params.name) : "";

  const query = useMemo(() => ({ group }), [group]);
  const { data, isLoading, error } = trpc.customers.groupDetail.useQuery(query, { enabled: !!group });
  // Contracts and vessels are group-wide facts, so they come from the shared lists
  // rather than a new per-group procedure.
  const { data: contracts } = trpc.opsContracts.list.useQuery(undefined, { enabled: !!group });
  const { data: vessels } = trpc.vessels.listWithStats.useQuery(undefined, { enabled: !!group });

  const groupContracts = useMemo(
    () => (contracts ?? []).filter(c => c.customerGroup === group),
    [contracts, group],
  );
  const groupVessels = useMemo(
    () => (vessels ?? []).filter(v => v.ownerGroup === group),
    [vessels, group],
  );
  const activeContracts = groupContracts.filter(c => c.status === "Active").length;

  const receivablesPath = `/groups/${encodeURIComponent(group)}/receivables`;
  const planned = (name: string) => toast.info(`${name} is planned for this customer — not built yet`);

  if (!group) return null;

  if (error) {
    return (
      <div className="p-2 sm:p-4">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/customers")}>
          <ArrowLeft className="h-4 w-4" /> Customers
        </Button>
        <Card className="mt-4">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Customer “{group}” was not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  const totals = data?.totals;

  return (
    <div className="p-2 sm:p-4 space-y-4">
      {/* ── Identity ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate("/customers")}>
            <ArrowLeft className="h-4 w-4" /> Customers
          </Button>
          <div>
            {/*
             * Say what kind of record this is before the title: a group card and a
             * company card carry the same figures, so the badge tells them apart.
             */}
            <RecordBreadcrumb
              entity="group"
              trail={[{ label: group }]}
            />
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
              <Layers className="h-6 w-6" /> {group}
              {data?.rating && (
                <Badge
                  variant="outline"
                  className={`${ratingColors[data.rating.rating] ?? ""} font-mono text-sm`}
                  title={`Credit score ${data.rating.score}/100\n${data.rating.factors
                    .map(f => `${f.label}: ${f.points}/${f.max} (${f.detail})`)
                    .join("\n")}`}
                >
                  {data.rating.rating} · {data.rating.score}
                </Badge>
              )}
              {data && <WatchStatusSelect group={group} effective={data.watchStatus ?? null} />}
              {data && (
                <span className="ml-1 border-l pl-2 text-base font-normal">
                  <PeopleRow
                    manager={(data as any).accountManager ?? null}
                    collector={(data as any).collector ?? null}
                    watchers={(data as any).watchers ?? []}
                    watcherGroupName={group}
                    groupName={group}
                  />
                </span>
              )}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Customer card — {data ? `${data.companies.length} companies` : "…"} in the group
            </p>
          </div>
        </div>
        {/* The hub's own action is to enter the module people use every day. */}
        <Button size="sm" className="gap-1.5" onClick={() => navigate(receivablesPath)}>
          <Wallet className="h-4 w-4" /> Open Receivables
        </Button>
      </div>

      {/* ── Key figures ──────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          {isLoading || !totals ? (
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-card px-4 py-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="mt-2 h-6 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-3 lg:grid-cols-5 [&>*]:bg-card">
              <Figure
                label="Open balance"
                value={fmtEur(totals.openBalance)}
                hint={`${totals.openCount} open invoices`}
              />
              <Figure
                label="Overdue"
                value={fmtEur(totals.overdueBalance)}
                hint={`${totals.overdueCount} invoices past due`}
                tone={totals.overdueBalance > 0 ? "danger" : undefined}
              />
              <Figure
                label="Due by end of month"
                value={fmtEur(data.overdueEomBalance)}
                hint="Overdue on the last day of this month"
                tone={data.overdueEomBalance > 0 ? "warning" : undefined}
              />
              <Figure
                label="Companies"
                value={String(data.companies.length)}
                hint={data.branches.length > 0 ? `${data.branches.length} invoicing branches` : undefined}
              />
              <Figure
                label="Vessels"
                value={String(groupVessels.length)}
                hint={groupContracts.length > 0 ? `${groupContracts.length} Prime 247 contracts` : "No contracts"}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Modules ──────────────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">Modules</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ModuleTile
            icon={Wallet}
            title="Receivables"
            description="Collections work on this customer: invoices, calls, promises, remittances and the activity trail."
            stat={totals ? `${fmtEur(totals.openBalance)} open` : undefined}
            live
            onOpen={() => navigate(receivablesPath)}
          />
          <ModuleTile
            icon={FileText}
            title="Prime 247 contracts"
            description="Equipment contracts for this customer's fleet, with vessels, products and installments."
            stat={
              groupContracts.length > 0
                ? `${groupContracts.length} contracts · ${activeContracts} active`
                : "No contracts yet"
            }
            live
            onOpen={() => navigate(`/ops/contracts?q=${encodeURIComponent(group)}`)}
          />
          <ModuleTile
            icon={Ship}
            title="Vessels"
            description="The fleet we invoice under this customer, with equipment on board and open items per vessel."
            stat={groupVessels.length > 0 ? `${groupVessels.length} vessels` : "No vessels linked"}
            live
            /* The vessels list filters from `?q=`, and owner group is one of the searched fields. */
            onOpen={() => navigate(`/vessels?q=${encodeURIComponent(group)}`)}
          />
          <ModuleTile
            icon={PieChart}
            title="Financials"
            description="Turnover, margin and payment behaviour over time — beyond what is still owed today."
            live={false}
            onOpen={() => planned("Financials")}
          />
          <ModuleTile
            icon={Receipt}
            title="Quotations"
            description="Offers made to this customer and what became of them."
            live={false}
            onOpen={() => planned("Quotations")}
          />
          <ModuleTile
            icon={ShoppingCart}
            title="Orders"
            description="Orders placed by this customer and their delivery state."
            live={false}
            onOpen={() => planned("Orders")}
          />
        </div>
      </div>

      {/* ── Companies in the group ───────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4" /> Companies in this group
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (data?.companies ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No companies are linked to this group.</p>
          ) : (
            <div className="divide-y">
              {(data?.companies ?? []).map(c => (
                <button
                  key={c.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 py-2 text-left hover:bg-muted/40"
                  onClick={() => navigate(`/customers/${c.id}`)}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-[11px] text-muted-foreground">
                      {c.code} · {c.invoiceCount} open invoices
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-sm font-semibold">{fmtEur(c.openBalance)}</span>
                    {c.overdueBalance > 0 && (
                      <span className="block font-mono text-[11px] text-red-600">
                        {fmtEur(c.overdueBalance)} overdue
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Fleet shortcut ───────────────────────────────────────────────────── */}
      {groupVessels.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ship className="h-4 w-4" /> Fleet ({groupVessels.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-2">
              {groupVessels.slice(0, 24).map(v => (
                <span key={v.id} className="rounded-md border bg-muted/30 px-2 py-1 text-xs">
                  <VesselLink vesselId={v.id} name={v.name} />
                </span>
              ))}
              {groupVessels.length > 24 && (
                <span className="self-center text-xs text-muted-foreground">
                  +{groupVessels.length - 24} more
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * The one-line "where am I?" locator that sits above every record title.
 *
 * It replaces what used to be four separate things fighting for the same space:
 * a back button, a breadcrumb repeating the record name, the title, and a
 * subtitle repeating the module. The rule now is: each fact appears once.
 *
 *   ← MSC SHIPMANAGEMENT LTD · GROUP › Receivables
 *   MSC SHIPMANAGEMENT LTD          ← the title, stated once, below
 *
 * So this component renders, left to right:
 *  1. the way OUT — the nearest ancestor, drawn as a real back affordance,
 *     because "up one level" and "the parent's name" are the same fact;
 *  2. the KIND of record — GROUP or COMPANY, colour-coded (violet / sky),
 *     since a group and one of its companies look otherwise identical;
 *  3. the MODULE inside the record, when you are in one (e.g. Receivables).
 *
 * On the record's own landing page there is no module and the ancestor is the
 * list, so the line collapses to "← Customers · GROUP" and stays one line.
 */
import { ArrowLeft, Building2, ChevronRight, Layers } from "lucide-react";
import { Link } from "wouter";

export type RecordEntity = "group" | "company";

/** Visual identity of each record kind — one source of truth for icon + colour. */
export const RECORD_KIND: Record<RecordEntity, { label: string; icon: typeof Layers; className: string }> = {
  group: {
    label: "GROUP",
    icon: Layers,
    className: "bg-violet-50 text-violet-700 border-violet-200",
  },
  company: {
    label: "COMPANY",
    icon: Building2,
    className: "bg-sky-50 text-sky-700 border-sky-200",
  },
};

export function RecordTypeBadge({ entity, className = "" }: { entity: RecordEntity; className?: string }) {
  const kind = RECORD_KIND[entity];
  const Icon = kind.icon;
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${kind.className} ${className}`}
      title={entity === "group" ? "A customer group — it owns companies" : "A single company inside a customer group"}
    >
      <Icon className="h-3 w-3" />
      {kind.label}
    </span>
  );
}

export function RecordBreadcrumb({
  entity,
  /** Nearest level up: its name IS the back button, so it is never repeated. */
  parent,
  /** Module inside the record (e.g. "Receivables"); omit on the record's own page. */
  module,
}: {
  entity: RecordEntity;
  parent: { label: string; href: string };
  module?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
      {/* Up one level. The label is the parent's name, so "back" needs no second line. */}
      <Link
        href={parent.href}
        className="group/up -ml-1 inline-flex min-w-0 items-center gap-1 rounded px-1 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        title={`Back to ${parent.label}`}
      >
        <ArrowLeft className="h-3.5 w-3.5 shrink-0 transition-transform duration-150 group-hover/up:-translate-x-0.5" />
        <span className="max-w-[18rem] truncate font-medium">{parent.label}</span>
      </Link>
      <span className="text-muted-foreground/40" aria-hidden>
        ·
      </span>
      <RecordTypeBadge entity={entity} />
      {module && (
        <>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" aria-hidden />
          <span className="max-w-[14rem] truncate font-medium text-foreground" aria-current="page">
            {module}
          </span>
        </>
      )}
    </nav>
  );
}

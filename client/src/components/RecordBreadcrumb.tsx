/**
 * "Where am I?" strip, shown above the title on every customer-related page.
 *
 * Two jobs, and only these two:
 *  1. Name the KIND of record you are looking at — GROUP or COMPANY — because a
 *     group and one of its companies otherwise look identical: same title style,
 *     same figures, same badges. The kind is stated in words and colour-coded
 *     (violet = group, sky = company), so it reads without being read.
 *  2. Name the trail that got you here, with every ancestor clickable, so a
 *     company card is never a dead end back to its group.
 *
 * Deliberately not a generic breadcrumb: the type badge is the point, so the
 * component takes an `entity` and renders the badge itself instead of trusting
 * each page to remember.
 */
import { Building2, ChevronRight, Layers } from "lucide-react";
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

export type Crumb = {
  label: string;
  /** Omit on the current page: the last crumb is text, not a link. */
  href?: string;
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
  trail,
  /** Module inside the record (e.g. "Receivables"); shown as the final crumb. */
  module,
}: {
  entity: RecordEntity;
  trail: Crumb[];
  module?: string;
}) {
  const crumbs: Crumb[] = module ? [...trail, { label: module }] : trail;
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
    >
      <RecordTypeBadge entity={entity} />
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight className="h-3 w-3 shrink-0 opacity-50" aria-hidden />
            {c.href && !last ? (
              <Link
                href={c.href}
                className="max-w-[16rem] truncate rounded transition-colors hover:text-foreground hover:underline"
                title={c.label}
              >
                {c.label}
              </Link>
            ) : (
              <span
                className={`max-w-[16rem] truncate ${last ? "font-medium text-foreground" : ""}`}
                title={c.label}
                aria-current={last ? "page" : undefined}
              >
                {c.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

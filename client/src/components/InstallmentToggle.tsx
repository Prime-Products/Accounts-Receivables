import { Button } from "@/components/ui/button";
import { FileSignature } from "lucide-react";

/**
 * Single-button invoice scope toggle shared by every invoice list.
 * Click once → only contract installments; click again → back to all invoices.
 *
 * It reads like its neighbours (Payments, Credit notes): the count is always on
 * the button, and when the current scope contains no contract installments the
 * button is disabled instead of switching to an empty table.
 */
export default function InstallmentToggle({
  value,
  onChange,
  count,
  hiddenCount = 0,
}: {
  value: "all" | "installments";
  onChange: (v: "all" | "installments") => void;
  /** Contract installments available in the current scope. */
  count?: number;
  /** Of those, how many are hidden by other active filters (status/aging/…). */
  hiddenCount?: number;
}) {
  const active = value === "installments";
  // `count` is optional so older call sites keep working; when it is missing the
  // button behaves as a plain toggle with no number and no disabled state.
  const known = typeof count === "number";
  const empty = known && count === 0;
  const hiding = known && !active && count > 0 && hiddenCount > 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      disabled={empty}
      title={
        empty
          ? "No contract installments in this scope"
          : active
            ? "Showing contract installments only — click again to show all invoices"
            : hiding
              ? "Some installments are hidden by the current filters — click to show them"
              : "Show contract installments only"
      }
      onClick={() => onChange(active ? "all" : "installments")}
      className={`h-9 gap-1.5 ${
        active
          ? "bg-violet-50 border-violet-300 text-violet-800 hover:bg-violet-100 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-200"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <FileSignature className={`h-3.5 w-3.5 ${active ? "text-violet-600" : ""}`} />
      Installments{known ? ` (${count})` : ""}
      {hiding && <span className="text-[10px] text-muted-foreground">hidden</span>}
    </Button>
  );
}

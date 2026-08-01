import { Button } from "@/components/ui/button";
import { FileSignature } from "lucide-react";

/**
 * Single-button invoice scope toggle shared by every invoice list.
 * Click once → only contract installments; click again → back to all invoices.
 */
export default function InstallmentToggle({
  value,
  onChange,
}: {
  value: "all" | "installments";
  onChange: (v: "all" | "installments") => void;
}) {
  const active = value === "installments";
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={active}
      title={
        active
          ? "Showing contract installments only — click again to show all invoices"
          : "Show contract installments only"
      }
      onClick={() => onChange(active ? "all" : "installments")}
      className={`h-9 gap-1.5 ${
        active
          ? "bg-violet-50 border-violet-300 text-violet-800 hover:bg-violet-100 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-200"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <FileSignature className={`h-3.5 w-3.5 ${active ? "text-violet-600" : ""}`} /> Installments
    </Button>
  );
}

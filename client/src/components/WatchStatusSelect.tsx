import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Watch-status control for a customer group. Two statuses only:
 * - "Problematic" (red) — set manually or flagged by the forecast rule
 *   (Expected < 80% of Overdue EOM);
 * - "Normal" (grey) — everything else.
 *
 * Shows the EFFECTIVE status (manual override or automatic rule), so it always
 * matches what the customers list displays. Picking a value stores a manual
 * override; "Normal" clears the Problematic flag even if the rule would set it.
 */
export default function WatchStatusSelect({ group, effective }: { group: string; effective: string | null }) {
  const utils = trpc.useUtils();
  const setStatus = trpc.customers.setWatchStatus.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`Status: ${vars.status}`);
      utils.customers.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const current = effective === "Problematic" ? "Problematic" : "Normal";
  const colors: Record<string, string> = {
    Normal: "bg-slate-50 text-slate-600 border-slate-200",
    Problematic: "bg-red-100 text-red-700 border-red-200",
  };
  return (
    <Select
      value={current}
      onValueChange={v => {
        if (v === current) return;
        setStatus.mutate({ group, status: v as "Normal" | "Problematic" });
      }}
    >
      <SelectTrigger
        className={`h-6 gap-1 rounded-full border px-2.5 text-xs font-semibold w-auto ${colors[current] ?? ""}`}
        title="Group status. Problematic is set automatically when the forecast covers less than 80% of the overdue end-of-month, or manually from here. Choose Normal to clear it."
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Normal">Normal</SelectItem>
        <SelectItem value="Problematic">Problematic</SelectItem>
      </SelectContent>
    </Select>
  );
}

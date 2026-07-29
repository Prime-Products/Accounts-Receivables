import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Unified Account Status control for a customer group.
 * Workflow: Normal → Problematic → Under Review → On Hold → Legal.
 *
 * - "Problematic" is set manually or by the forecast rule (Expected < 80% of Overdue EOM).
 * - "Under Review", "On Hold" and "Legal" are manual decisions.
 * - Picking "Normal" clears any flag, even if the rule would set it.
 *
 * Shows the EFFECTIVE status (manual override or forecast rule), so it always
 * matches what the customers list displays.
 */
export const GROUP_STATUS_COLORS: Record<string, string> = {
  Normal: "bg-slate-50 text-slate-600 border-slate-200",
  Problematic: "bg-red-100 text-red-700 border-red-200",
  "Under Review": "bg-amber-100 text-amber-800 border-amber-200",
  "On Hold": "bg-orange-500 text-white border-orange-600",
  Legal: "bg-purple-100 text-purple-700 border-purple-200",
};

export default function WatchStatusSelect({ group, effective }: { group: string; effective: string | null }) {
  const utils = trpc.useUtils();
  const setStatus = trpc.customers.setWatchStatus.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`Status: ${vars.status}`);
      utils.customers.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const current = effective && GROUP_STATUS_COLORS[effective] ? effective : "Normal";
  return (
    <Select
      value={current}
      onValueChange={v => {
        if (v === current) return;
        setStatus.mutate({ group, status: v as "Normal" | "Problematic" | "Under Review" | "On Hold" | "Legal" });
      }}
    >
      <SelectTrigger
        className={`h-6 gap-1 rounded-full border px-2.5 text-xs font-semibold w-auto ${GROUP_STATUS_COLORS[current] ?? ""}`}
        title="Account status workflow: Normal → Problematic → Under Review → On Hold → Legal. Problematic is set automatically when the forecast covers less than 80% of the overdue end-of-month; Under Review, On Hold and Legal are manual decisions."
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Normal">Normal</SelectItem>
        <SelectItem value="Problematic">Problematic</SelectItem>
        <SelectItem value="Under Review">Under Review</SelectItem>
        <SelectItem value="On Hold">On Hold</SelectItem>
        <SelectItem value="Legal">Legal</SelectItem>
      </SelectContent>
    </Select>
  );
}

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Unified status control for a customer group.
 * Workflow: Normal → Problematic → Critical → Legal / Resolved.
 *
 * - "Problematic" is set manually or by the forecast rule (Expected < 80% of Overdue EOM).
 * - "Critical" escalates AUTOMATICALLY after 30 consecutive Problematic days
 *   (candidate for on-hold / legal discussion) — can also be set manually.
 * - "Legal" and "Resolved" are manual decisions.
 * - Picking "Normal" clears any flag, even if the rule would set it.
 *
 * Shows the EFFECTIVE status (manual override, rule, or 30-day escalation), so it
 * always matches what the customers list displays.
 */
export const GROUP_STATUS_COLORS: Record<string, string> = {
  Normal: "bg-slate-50 text-slate-600 border-slate-200",
  Problematic: "bg-red-100 text-red-700 border-red-200",
  Critical: "bg-red-600 text-white border-red-700",
  Legal: "bg-purple-100 text-purple-700 border-purple-200",
  Resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
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
        setStatus.mutate({ group, status: v as "Normal" | "Problematic" | "Critical" | "Legal" | "Resolved" });
      }}
    >
      <SelectTrigger
        className={`h-6 gap-1 rounded-full border px-2.5 text-xs font-semibold w-auto ${GROUP_STATUS_COLORS[current] ?? ""}`}
        title="Group status workflow: Normal → Problematic → Critical → Legal / Resolved. Problematic is set automatically when the forecast covers less than 80% of the overdue end-of-month; Critical escalates automatically after 30 consecutive Problematic days. Legal and Resolved are manual decisions."
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Normal">Normal</SelectItem>
        <SelectItem value="Problematic">Problematic</SelectItem>
        <SelectItem value="Critical">Critical</SelectItem>
        <SelectItem value="Legal">Legal</SelectItem>
        <SelectItem value="Resolved">Resolved</SelectItem>
      </SelectContent>
    </Select>
  );
}

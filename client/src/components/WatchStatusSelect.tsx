import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/**
 * Manual watch-status control for a customer group.
 * "Auto" follows the forecast rule (Problematic when Expected < 80% of Overdue EOM);
 * "Problematic" / "On Watch" override it manually.
 */
export default function WatchStatusSelect({ group, value }: { group: string; value: string | null }) {
  const utils = trpc.useUtils();
  const setStatus = trpc.customers.setWatchStatus.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`Watch status: ${vars.status === "Auto" ? "Auto (forecast rule)" : vars.status}`);
      utils.customers.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const current = value ?? "Auto";
  const colors: Record<string, string> = {
    Auto: "bg-slate-50 text-slate-600 border-slate-200",
    Problematic: "bg-red-100 text-red-700 border-red-200",
    "On Watch": "bg-amber-100 text-amber-700 border-amber-200",
  };
  return (
    <Select value={current} onValueChange={v => setStatus.mutate({ group, status: v as "Auto" | "Problematic" | "On Watch" })}>
      <SelectTrigger
        className={`h-6 gap-1 rounded-full border px-2.5 text-xs font-semibold w-auto ${colors[current] ?? ""}`}
        title="Manual watch status: Auto follows the forecast rule (Problematic when Expected < 80% of Overdue EOM); Problematic / On Watch override it"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="Auto">Auto (forecast rule)</SelectItem>
        <SelectItem value="Problematic">Problematic</SelectItem>
        <SelectItem value="On Watch">On Watch</SelectItem>
      </SelectContent>
    </Select>
  );
}

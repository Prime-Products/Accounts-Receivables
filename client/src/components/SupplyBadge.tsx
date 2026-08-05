import { Badge } from "@/components/ui/badge";
import { supplyState, supplyStateClasses, supplyStateLabels } from "@shared/supplyState";
import { CheckCircle2, Circle, Clock } from "lucide-react";

/**
 * One badge, used everywhere a line's supply progress is shown (vessel card, contract
 * summary), so "supplied" always looks and reads the same. The count is appended while
 * the line is incomplete, since that is the part the user has to act on.
 */
export function SupplyBadge({
  supplied,
  total,
  showCount = true,
  className = "",
}: {
  supplied: number;
  total: number;
  showCount?: boolean;
  className?: string;
}) {
  const state = supplyState(supplied, total);
  if (!state) return <span className="text-muted-foreground text-sm">—</span>;
  const Icon = state === "supplied" ? CheckCircle2 : state === "partial" ? Clock : Circle;
  const owed = total - supplied;
  return (
    <Badge
      variant="outline"
      className={`gap-1 whitespace-nowrap ${supplyStateClasses[state]} ${className}`}
      title={
        state === "supplied"
          ? `All ${total} unit(s) supplied`
          : `${owed} of ${total} unit(s) still to deliver`
      }
    >
      <Icon className="h-3 w-3" />
      {supplyStateLabels[state]}
      {showCount && state !== "supplied" ? ` ${supplied}/${total}` : ""}
    </Badge>
  );
}

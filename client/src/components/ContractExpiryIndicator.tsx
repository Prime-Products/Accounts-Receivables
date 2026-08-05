import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fmtDate } from "@/lib/format";
import {
  contractExpiryDotClass,
  contractExpiryLabel,
  contractExpiryPillClass,
  contractExpiryUrgency,
  daysUntilContractEnd,
} from "@shared/contractExpiry";

/**
 * Colour-coded countdown for a contract end date.
 *
 * Two shapes of the same signal:
 * - `pill` (default) — a badge with the wording, for cards and headers.
 * - `dot` — a bare coloured dot with the wording in a tooltip, for dense table rows.
 *
 * Green while there is more than half a year of the period left, then yellow at
 * 180 days, amber at 90 and red at 30 or once expired.
 */
export function ContractExpiryIndicator({
  endDate,
  variant = "pill",
  className = "",
}: {
  endDate: number;
  variant?: "pill" | "dot";
  className?: string;
}) {
  const urgency = contractExpiryUrgency(endDate);
  const label = contractExpiryLabel(endDate);
  const days = daysUntilContractEnd(endDate);

  if (variant === "dot") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${contractExpiryDotClass(urgency)} ${className}`}
            aria-label={label}
          />
        </TooltipTrigger>
        <TooltipContent>
          {fmtDate(endDate)} — {label}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 font-normal ${contractExpiryPillClass(urgency)} ${className}`}
      title={`Contract ends ${fmtDate(endDate)}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${contractExpiryDotClass(urgency)}`} />
      {label}
      {urgency !== "expired" && days <= 90 && <span className="sr-only"> — renewal due</span>}
    </Badge>
  );
}

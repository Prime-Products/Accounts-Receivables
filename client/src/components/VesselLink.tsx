import { Badge } from "@/components/ui/badge";
import { useVesselModal } from "@/contexts/VesselModalContext";
import { Ship } from "lucide-react";

/**
 * A vessel name that opens the vessel modal in place. Used everywhere a vessel appears
 * so the behaviour is identical across the app: click the name, the vessel opens on top
 * of the current page. When no vesselId is known the name renders as plain text.
 */
export function VesselLink({
  vesselId,
  name,
  className,
  fallback = "—",
}: {
  vesselId: number | null | undefined;
  name: string | null | undefined;
  className?: string;
  fallback?: string;
}) {
  const { openVessel } = useVesselModal();
  if (!name) return <span className="text-muted-foreground">{fallback}</span>;
  if (vesselId == null) return <span className={className}>{name}</span>;
  return (
    <button
      type="button"
      title={`Open ${name}`}
      onClick={e => {
        // Vessel names often sit inside clickable rows; the modal wins over the row.
        e.stopPropagation();
        openVessel(vesselId);
      }}
      className={`text-left text-primary hover:underline underline-offset-2 truncate ${className ?? ""}`}
    >
      {name}
    </button>
  );
}

/**
 * The sky-tinted vessel badge used on invoice rows and cards, clickable when the vessel
 * is known.
 */
export function VesselBadge({
  vesselId,
  name,
  className,
}: {
  vesselId: number | null | undefined;
  name: string;
  className?: string;
}) {
  const { openVessel } = useVesselModal();
  const clickable = vesselId != null;
  return (
    <Badge
      variant="outline"
      title={clickable ? `Open ${name}` : `Vessel: ${name}`}
      onClick={
        clickable
          ? e => {
              e.stopPropagation();
              openVessel(vesselId!);
            }
          : undefined
      }
      className={`bg-sky-50 text-sky-700 border-sky-200 gap-1 font-normal max-w-full ${clickable ? "cursor-pointer hover:bg-sky-100 transition-colors" : ""} ${className ?? ""}`}
    >
      <Ship className="h-3 w-3 shrink-0" />
      <span className="truncate">{name}</span>
    </Badge>
  );
}

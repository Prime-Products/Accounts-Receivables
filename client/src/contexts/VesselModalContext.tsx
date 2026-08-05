import { VesselDetailDialog } from "@/components/VesselDetailDialog";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * App-wide vessel modal. Clicking a vessel anywhere in AR Pro opens the vessel on top
 * of the current page instead of navigating away, so the user never loses their place.
 * Pages call `openVessel(id)` from a click handler; a single dialog instance lives at
 * the app root.
 */
type VesselModalApi = {
  openVessel: (vesselId: number) => void;
  closeVessel: () => void;
  vesselId: number | null;
};

const VesselModalContext = createContext<VesselModalApi | null>(null);

export function VesselModalProvider({ children }: { children: ReactNode }) {
  const [vesselId, setVesselId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);

  const openVessel = useCallback((id: number) => {
    if (!Number.isFinite(id) || id <= 0) return;
    setVesselId(id);
    setOpen(true);
  }, []);
  const closeVessel = useCallback(() => setOpen(false), []);

  const api = useMemo<VesselModalApi>(() => ({ openVessel, closeVessel, vesselId }), [openVessel, closeVessel, vesselId]);

  return (
    <VesselModalContext.Provider value={api}>
      {children}
      <VesselDetailDialog vesselId={vesselId} open={open} onOpenChange={setOpen} />
    </VesselModalContext.Provider>
  );
}

/**
 * Open the vessel modal from anywhere. Falls back to a no-op outside the provider so
 * components stay usable in isolation (tests, storybook-style renders).
 */
export function useVesselModal(): VesselModalApi {
  const ctx = useContext(VesselModalContext);
  return ctx ?? { openVessel: () => {}, closeVessel: () => {}, vesselId: null };
}

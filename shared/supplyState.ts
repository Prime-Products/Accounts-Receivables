/**
 * Supply state of a contract line.
 *
 * A line is read as one of three states so the same wording and colour can be used on
 * the vessel card, on the contract card and in any summary:
 *   - `supplied`      every unit of the line has left the warehouse
 *   - `partial`       some units shipped, some still owed
 *   - `not-supplied`  nothing has shipped yet
 */
export type SupplyState = "supplied" | "partial" | "not-supplied";

/** Statuses that mean a unit is no longer sitting in the warehouse. */
export const suppliedAssetStatuses = ["In Transit", "Active", "Pending Return", "Returned"] as const;

/** True when an equipment row counts towards the supplied total. */
export function isSuppliedStatus(status: string): boolean {
  return (suppliedAssetStatuses as readonly string[]).includes(status);
}

/**
 * Derive the supply state from a shipped/expected pair. A line with nothing expected
 * (no units to track) has no meaningful state, hence `null`.
 */
export function supplyState(supplied: number, total: number): SupplyState | null {
  if (total <= 0) return null;
  if (supplied >= total) return "supplied";
  return supplied > 0 ? "partial" : "not-supplied";
}

/** Short label shown on the badge. */
export const supplyStateLabels: Record<SupplyState, string> = {
  supplied: "Supplied",
  partial: "Partially supplied",
  "not-supplied": "Not supplied",
};

/** Badge colours, consistent everywhere a supply state is shown. */
export const supplyStateClasses: Record<SupplyState, string> = {
  supplied: "bg-emerald-100 text-emerald-800 border-emerald-200",
  partial: "bg-amber-100 text-amber-800 border-amber-200",
  "not-supplied": "bg-slate-100 text-slate-700 border-slate-200",
};

/**
 * How a customer sent the money.
 *
 * One list, shared by the server enum, the Remittances page, the company card and
 * the transaction rows, so the label a collector reads is always the same word.
 * Rows written before the field existed (and any legacy "Wire transfer" /
 * "Credit card" spelling) read as their current equivalent instead of showing a
 * blank or a stale name.
 */
export const REMITTANCE_METHODS = ["Transfer", "Cheque", "Credit Card"] as const;

export type RemittanceMethod = (typeof REMITTANCE_METHODS)[number];

/** Bank transfer is the common case, so an unknown or empty value reads as Transfer. */
export const DEFAULT_REMITTANCE_METHOD: RemittanceMethod = "Transfer";

/** Older spellings kept readable after the rename. */
const LEGACY: Record<string, RemittanceMethod> = {
  "wire transfer": "Transfer",
  wire: "Transfer",
  transfer: "Transfer",
  "bank transfer": "Transfer",
  cheque: "Cheque",
  check: "Cheque",
  "credit card": "Credit Card",
  card: "Credit Card",
};

export function normalizeRemittanceMethod(method?: string | null): RemittanceMethod {
  const raw = (method ?? "").trim();
  if ((REMITTANCE_METHODS as readonly string[]).includes(raw)) return raw as RemittanceMethod;
  return LEGACY[raw.toLowerCase()] ?? DEFAULT_REMITTANCE_METHOD;
}

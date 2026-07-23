/** Shared formatting helpers. */
export const fmtEur = (n: number | string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));

export const fmtEurFull = (n: number | string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(Number(n));

export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

/** Format an amount in an arbitrary currency (EUR, AED, SGD, USD, ...). */
export const fmtCur = (n: number | string, currency = "EUR", digits = 0) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: digits, minimumFractionDigits: digits }).format(Number(n));

/** Render a per-currency breakdown map as e.g. "AED 1,623,352 · SGD 316,565 · $51,962". */
export const fmtByCurrency = (byCur: Record<string, number> | undefined | null, opts?: { skipEurOnly?: boolean }) => {
  if (!byCur) return "";
  const entries = Object.entries(byCur).filter(([, v]) => Math.abs(v) >= 0.005);
  if (entries.length === 0) return "";
  if (opts?.skipEurOnly && entries.length === 1 && entries[0][0] === "EUR") return "";
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([cur, v]) => fmtCur(v, cur))
    .join(" · ");
};

/** Short display label for Prime branches (companies). */
export const branchShort = (company?: string | null) => {
  if (!company) return "—";
  const map: Record<string, string> = {
    "Prime Products LTD": "Prime LTD",
    "Prime Products Distribution FZC LTD": "Prime FZC",
    "Prime Products Distribution(s) PTE LTD": "Prime PTE",
    "Prime Products Distribution B.V": "Prime B.V",
    "Prime Products Distribution USA LLC": "Prime USA",
    "P.P.D. Prime Products Distribution Ltd": "P.P.D.",
  };
  return map[company] ?? company;
};

export const branchColors: Record<string, string> = {
  "Prime LTD": "bg-blue-50 text-blue-700 border-blue-200",
  "Prime FZC": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Prime PTE": "bg-violet-50 text-violet-700 border-violet-200",
  "Prime B.V": "bg-orange-50 text-orange-700 border-orange-200",
  "Prime USA": "bg-red-50 text-red-700 border-red-200",
  "P.P.D.": "bg-teal-50 text-teal-700 border-teal-200",
};

export const monthName = (m: number) =>
  ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];

export const tierColors: Record<string, string> = {
  Platinum: "bg-slate-200 text-slate-800 border-slate-300",
  Gold: "bg-amber-100 text-amber-800 border-amber-200",
  Silver: "bg-gray-100 text-gray-700 border-gray-200",
  Bronze: "bg-orange-100 text-orange-800 border-orange-200",
  New: "bg-sky-100 text-sky-800 border-sky-200",
};

export const invoiceStatusColors: Record<string, string> = {
  Open: "bg-sky-100 text-sky-800 border-sky-200",
  "Partially Paid": "bg-violet-100 text-violet-800 border-violet-200",
  Paid: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Overdue: "bg-red-100 text-red-700 border-red-200",
  Disputed: "bg-amber-100 text-amber-800 border-amber-200",
};

export const onHoldStatusColors: Record<string, string> = {
  "Under Review": "bg-sky-100 text-sky-800 border-sky-200",
  "Eligible for On Hold": "bg-amber-100 text-amber-800 border-amber-200",
  "On Hold": "bg-orange-100 text-orange-800 border-orange-200",
  Legal: "bg-red-100 text-red-700 border-red-200",
  Rejected: "bg-gray-100 text-gray-600 border-gray-200",
  Resolved: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Active: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export const taskStatusColors: Record<string, string> = {
  Pending: "bg-sky-100 text-sky-800 border-sky-200",
  "In Progress": "bg-violet-100 text-violet-800 border-violet-200",
  Completed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Cancelled: "bg-gray-100 text-gray-600 border-gray-200",
};

export const taskTypeColors: Record<string, string> = {
  "Follow-up +2": "bg-sky-100 text-sky-800 border-sky-200",
  "Follow-up +15": "bg-violet-100 text-violet-800 border-violet-200",
  "Follow-up +20 SOA": "bg-amber-100 text-amber-800 border-amber-200",
  "Escalation +30": "bg-red-100 text-red-700 border-red-200",
  "Contract Expiry": "bg-orange-100 text-orange-800 border-orange-200",
  Manual: "bg-gray-100 text-gray-700 border-gray-200",
};

export function downloadBase64(filename: string, mimeType: string, base64: string) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

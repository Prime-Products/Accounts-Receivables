/** Shared formatting helpers. */
export const fmtEur = (n: number | string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(n));

export const fmtEurFull = (n: number | string) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(Number(n));

export const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

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

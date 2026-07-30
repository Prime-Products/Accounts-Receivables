/**
 * Statement of Account (SOA) builder — matches the Prime Products sample layout
 * (seaworldstatement.pdf): one statement per customer company, with a
 * TOTAL AMOUNTS table across all Prime branches and an ANALYSIS section per
 * branch, followed by that branch's bank details.
 */
import { isOpenInvoice, outstandingOriginal, daysOverdue } from "./arLogic";

/** Registry of Prime branches, in the fixed order used on the sample. */
export interface BranchInfo {
  /** Exact `invoices.company` value in the DB. */
  key: string;
  /** Display name on the statement. */
  displayName: string;
  /** City heading used in the ANALYSIS section. */
  city: string;
  currency: string;
  currencySymbol: string;
  /** Bank details lines printed under the branch's analysis table. */
  bankDetails: string[];
}

export const BRANCHES: BranchInfo[] = [
  {
    key: "Prime Products LTD",
    displayName: "PRIME PRODUCTS LTD (REPRESENTATION DISTRIBUTION OF INDUSTRIAL SAFETY PRODUCTS)",
    city: "PIRAEUS",
    currency: "EUR",
    currencySymbol: "€",
    bankDetails: [
      "BENEFICIARY NAME: PRIME PRODUCTS LTD - ALPHABANK (EURO) IBAN No: GR9801401250125002320007334 BIC: CRBAGRAAXXX EUROBANK (EURO)",
      "IBAN No: GR4202604320000250200292033 - BIC: ERBKGRAAXXX - PIRAEUS (EURO) IBAN: GR9601715660006566108676995 BIC: PIRBGRAAXXX",
    ],
  },
  {
    key: "Prime Products Distribution(s) PTE LTD",
    displayName: "PRIME PRODUCTS DISTRIBUTION(S) PTE LTD",
    city: "SINGAPORE",
    currency: "SGD",
    currencySymbol: "$",
    bankDetails: [
      "BENEFICIARY NAME: PRIME PRODUCTS DISTRIBUTION (S) PTE LTD - HSBC Bank Swift Code: HSBCSGSG ACCOUNT NUMBER: 260-718002-178 (USD)",
      "ACCOUNT NUMBER: 260-718002-179 (EUR) - ACCOUNT NUMBER: 152-713871-001 (SGD)",
    ],
  },
  {
    key: "Prime Products Distribution FZC LTD",
    displayName: "PRIME PRODUCTS DISTRIBUTION LTD FZC",
    city: "FUJAIRAH",
    currency: "AED",
    currencySymbol: "AED",
    bankDetails: [
      "BENEFICIARY NAME: PRIME PRODUCTS DISTRIBUTION FZC LTD - ABU DHABI COMMERCIAL BANK (ADCB) SWIFT CODE: ADCBAEAA",
      "ACCOUNT NUMBER - IBAN: AE190030000965577386001 (AED) - ACCOUNT NUMBER - IBAN: AE820030000965577387001 (USD)",
      "For USD transfers the payment has to be routed through Bank of America [Swift Code - BOFAUS3N] for onward credit to ADCB [Swift Code - ADCBAEAA]",
    ],
  },
  {
    key: "Prime Products Distribution B.V",
    displayName: "PRIME PRODUCTS DISTRIBUTION B.V.",
    city: "ROTTERDAM",
    currency: "EUR",
    currencySymbol: "€",
    bankDetails: [
      "BENEFICIARY NAME: PRIME PRODUCTS DISTRIBUTION BV - ABN AMRO BANK IBAN No: NL16ABNA0412428946 BIC: ABNANL2A",
    ],
  },
  {
    key: "P.P.D. Prime Products Distribution Ltd",
    displayName: "P.P.D. PRIME PRODUCTS DISTRIBUTION LTD",
    city: "LIMASSOL",
    currency: "EUR",
    currencySymbol: "€",
    bankDetails: ["BENEFICIARY NAME: P.P.D. PRIME PRODUCTS DISTRIBUTION LTD"],
  },
  {
    key: "Prime Products Distribution USA LLC",
    displayName: "PRIME PRODUCTS DISTRIBUTION USA LLC",
    city: "HOUSTON",
    currency: "USD",
    currencySymbol: "$",
    bankDetails: [
      "BENEFICIARY NAME: PRIME PRODUCTS DISTRIBUTION USA LLC - EAST WEST BANK Routing No: 322070381 SWIFT Code: EWBKUS66XXX Account No: 8674002079",
    ],
  },
];

export function branchByKey(key: string | null | undefined): BranchInfo | undefined {
  if (!key) return undefined;
  return BRANCHES.find(b => b.key.toLowerCase() === key.toLowerCase());
}

// ---------------------------------------------------------------------------

export interface StatementInvoiceLike {
  id: number;
  customerId: number;
  invoiceNumber: string;
  company: string | null;
  currency: string | null;
  issueDate: number;
  dueDate: number;
  amount: string | number;
  paidAmount: string | number;
  status: string;
  vesselId: number | null;
  notes: string | null;
}

export interface AnalysisRow {
  docDate: number;
  document: string;
  docAmount: number;
  openAmount: number;
  overdueDays: number;
  vessel: string;
  comments: string;
}

export interface BranchAnalysis {
  branch: BranchInfo;
  rows: AnalysisRow[];
  totalDocAmount: number;
  totalOpenAmount: number;
}

export interface TotalsRow {
  branch: BranchInfo;
  balance: number;
  unpaid: number;
  overdue: number;
  upcomingWithinMonth: number;
  upcomingNextMonth: number;
}

export interface CompanyStatement {
  companyName: string;
  paymentTermsDays: number;
  totals: TotalsRow[]; // zero-balance branches omitted
  analyses: BranchAnalysis[];
}

export interface GroupStatement {
  groupName: string;
  date: number;
  companies: CompanyStatement[];
}

/** dd/mm/yyyy */
export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}/${d.getUTCFullYear()}`;
}

/** European number format: 4.620,60 */
export function fmtAmount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const [int, dec] = abs.toFixed(2).split(".");
  const withThousands = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${withThousands},${dec}`;
}

/**
 * Build the statement model for a set of customers (a group or single company).
 * `vesselNames` maps vesselId → name.
 */
export function buildGroupStatement(opts: {
  groupName: string;
  now: number;
  customers: { id: number; name: string; paymentTermsDays: number }[];
  invoices: StatementInvoiceLike[];
  vesselNames: Map<number, string>;
  minDaysOverdue?: number;
}): GroupStatement {
  const { groupName, now, customers, invoices, vesselNames, minDaysOverdue } = opts;
  const byCustomer = new Map<number, StatementInvoiceLike[]>();
  for (const inv of invoices) {
    if (!isOpenInvoice(inv as any)) continue;
    if (minDaysOverdue !== undefined && daysOverdue(inv.dueDate, now) < minDaysOverdue) continue;
    const list = byCustomer.get(inv.customerId) ?? [];
    list.push(inv);
    byCustomer.set(inv.customerId, list);
  }

  const monthEnd = endOfMonth(now);
  const nextMonthEnd = endOfMonth(addMonths(now, 1));

  const companies: CompanyStatement[] = [];
  const sorted = [...customers].sort((a, b) => a.name.localeCompare(b.name));
  for (const cust of sorted) {
    const open = byCustomer.get(cust.id) ?? [];
    if (open.length === 0) continue; // skip companies with no open documents

    // group by branch, keeping the fixed BRANCHES order
    const totals: TotalsRow[] = [];
    const analyses: BranchAnalysis[] = [];
    for (const branch of BRANCHES) {
      const docs = open.filter(i => (i.company ?? "").toLowerCase() === branch.key.toLowerCase());
      if (docs.length === 0) continue;
      let unpaid = 0;
      let overdue = 0;
      let upWithin = 0;
      let upNext = 0;
      const rows: AnalysisRow[] = [];
      let totalDoc = 0;
      for (const inv of docs.sort((a, b) => a.issueDate - b.issueDate)) {
        const out = outstandingOriginal(inv as any);
        const d = daysOverdue(inv.dueDate, now);
        unpaid += out;
        if (d > 0) overdue += out;
        else if (inv.dueDate <= monthEnd) upWithin += out;
        else if (inv.dueDate <= nextMonthEnd) upNext += out;
        totalDoc += Number(inv.amount);
        rows.push({
          docDate: inv.issueDate,
          document: inv.invoiceNumber,
          docAmount: Number(inv.amount),
          openAmount: out,
          overdueDays: d,
          vessel: inv.vesselId ? (vesselNames.get(inv.vesselId) ?? "") : "",
          comments: (inv.notes ?? "").slice(0, 120),
        });
      }
      totals.push({ branch, balance: unpaid, unpaid, overdue, upcomingWithinMonth: upWithin, upcomingNextMonth: upNext });
      analyses.push({ branch, rows, totalDocAmount: totalDoc, totalOpenAmount: unpaid });
    }
    if (totals.length === 0) continue;
    companies.push({ companyName: cust.name, paymentTermsDays: cust.paymentTermsDays, totals, analyses });
  }
  return { groupName, date: now, companies };
}

function endOfMonth(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59);
}
function addMonths(ts: number, m: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, 15);
}

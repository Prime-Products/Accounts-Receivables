/**
 * Editable email templates.
 *
 * Every template's subject/body is plain text with {{placeholders}} that are
 * substituted with the customer's live figures when the Send Email dialog is
 * opened. Defaults live here in code; when the user edits a template in
 * Settings the override is stored in the `email_templates` table and takes
 * precedence over the default.
 */

export const EDITABLE_TEMPLATES = [
  "SOA",
  "Payment Reminder",
  "Overdue Notice",
  "Friendly Reminder",
  "Final Notice",
  "Statement",
] as const;

export type EditableTemplate = (typeof EDITABLE_TEMPLATES)[number];

/** Placeholder catalogue shown in the Settings editor as a reference. */
export const TEMPLATE_PLACEHOLDERS: { key: string; label: string; example: string }[] = [
  { key: "customer", label: "Company name", example: "MSC SHIPMANAGEMENT LTD" },
  { key: "contact", label: "Contact person (falls back to Sir/Madam)", example: "Mr. Papadopoulos" },
  { key: "group", label: "Customer group name", example: "MSC" },
  { key: "balance", label: "Total outstanding (EUR)", example: "€615,600.00" },
  { key: "overdue", label: "Overdue amount (EUR)", example: "€357,200.00" },
  { key: "openCount", label: "Number of open invoices", example: "373" },
  { key: "overdueCount", label: "Number of overdue invoices", example: "128" },
  { key: "oldestDays", label: "Days overdue of the oldest invoice", example: "142" },
  { key: "invoiceList", label: "List of the most overdue invoices (multi-line)", example: "  - INV-1001 · due 12/06/2026 · €12,500.00" },
  { key: "date", label: "Today's date", example: "31/07/2026" },
  { key: "sender", label: "Your name (logged-in user)", example: "Kostas Vanos" },
];

export const DEFAULT_TEMPLATES: Record<EditableTemplate, { subject: string; body: string }> = {
  SOA: {
    subject: "Statement of Account — {{customer}} — {{date}}",
    body: `Dear {{contact}},

Please find attached your Statement of Account as of {{date}}.

Summary:
  - Open invoices: {{openCount}}
  - Total outstanding: {{balance}}
  - Of which overdue: {{overdue}} ({{overdueCount}} invoices)

Kindly review and confirm the balance, and let us know the expected payment date for the overdue items.

Should you identify any discrepancy, please contact us so we can resolve it promptly.

Best regards
{{sender}}`,
  },
  "Payment Reminder": {
    subject: "Payment Reminder — {{customer}} — outstanding {{overdue}}",
    body: `Dear {{contact}},

This is a friendly reminder that the following invoices are currently outstanding:

{{invoiceList}}

Total overdue: {{overdue}}.

Please arrange payment at your earliest convenience, or let us know the expected payment date. If payment has already been made, kindly disregard this message and share the remittance details.

Best regards
{{sender}}`,
  },
  "Overdue Notice": {
    subject: "Overdue Notice — {{customer}} — {{overdue}} overdue",
    body: `Dear {{contact}},

Despite our previous reminders, the following invoices remain unpaid (oldest {{oldestDays}} days overdue):

{{invoiceList}}

Total overdue: {{overdue}}.

We kindly ask you to settle the above amount immediately. If payment is not received, we may have to review the terms of our cooperation, including placing the account on hold.

If there is any issue preventing payment, please contact us directly so we can find a solution together.

Best regards
{{sender}}`,
  },
  "Friendly Reminder": {
    subject: "Payment Reminder — {{customer}}",
    body: `Dear {{contact}},

We hope this message finds you well. We noticed that your account currently shows an outstanding balance of {{balance}}.

Please arrange payment at your earliest convenience. If you have already processed this payment, please disregard this message and share the remittance details.

Should you have any questions, please do not hesitate to contact us.

Best regards
{{sender}}`,
  },
  "Final Notice": {
    subject: "Final Notice — Urgent Payment Required — {{customer}}",
    body: `Dear {{contact}},

This is a final notice regarding your overdue balance of {{overdue}}. Immediate payment is required to avoid further action.

{{invoiceList}}

Please remit payment immediately. If payment has already been made, kindly provide proof of payment.

For urgent matters, please contact our accounting department directly.

Best regards
{{sender}}`,
  },
  Statement: {
    subject: "Account Statement — {{customer}} — {{date}}",
    body: `Dear {{contact}},

Please find attached your account statement as of {{date}}. The total outstanding balance is {{balance}}, of which {{overdue}} is overdue.

If you have any questions regarding the items listed, please contact us promptly.

Thank you for your business.

Best regards
{{sender}}`,
  },
};

/** Values used to fill {{placeholders}} in a template. */
export type TemplateVars = Record<string, string | number | null | undefined>;

/**
 * Replace every {{placeholder}} with its value. Unknown placeholders are left
 * untouched so a typo stays visible instead of silently deleting text.
 */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null) return match;
    return String(v);
  });
}

/** Merge stored overrides over the built-in defaults. */
export function mergeTemplates(
  stored: { templateType: string; subject: string; body: string; updatedAt?: Date | null }[],
) {
  return EDITABLE_TEMPLATES.map(t => {
    const row = stored.find(s => s.templateType === t);
    return {
      templateType: t,
      subject: row?.subject ?? DEFAULT_TEMPLATES[t].subject,
      body: row?.body ?? DEFAULT_TEMPLATES[t].body,
      isCustom: !!row,
      updatedAt: row?.updatedAt ?? null,
      defaultSubject: DEFAULT_TEMPLATES[t].subject,
      defaultBody: DEFAULT_TEMPLATES[t].body,
    };
  });
}

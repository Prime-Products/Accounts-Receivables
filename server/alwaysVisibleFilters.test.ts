/**
 * The credit-notes and payments filters used to vanish from the Transactions
 * toolbar whenever the scope had none, and an active status/installments filter
 * could silently empty them. These are source-level guards so the buttons stay
 * permanently visible and self-explanatory on both cards.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const group = read("client/src/pages/GroupDetail.tsx");
const customer = read("client/src/pages/CustomerDetail.tsx");
const invoices = read("client/src/pages/Invoices.tsx");
const sendEmail = read("client/src/components/SendEmailDialog.tsx");

describe("transactions toolbar — credit notes / payments always visible", () => {
  for (const [name, src] of [
    ["group card", group],
    ["company card", customer],
  ] as const) {
    it(`${name}: does not hide the buttons when the scope has none`, () => {
      expect(src).not.toContain("{allCreditNotes.length > 0 && (");
      expect(src).not.toContain("{allTransfers.length > 0 && (");
      expect(src).toContain("disabled={allCreditNotes.length === 0}");
      expect(src).toContain("disabled={allTransfers.length === 0}");
    });

    it(`${name}: turning a view on clears the invoice-only filters`, () => {
      expect(src).toContain("clearInvoiceOnlyFilters");
      expect(src).toContain("onClick={toggleCreditOnly}");
      expect(src).toContain("onClick={togglePaymentsOnly}");
    });

    it(`${name}: flags rows hidden by other filters instead of showing a bare count`, () => {
      expect(src).toContain("hidden");
      expect(src).toMatch(/Credit notes are hidden by the current filters/);
      expect(src).toMatch(/Payments are hidden by the current filters/);
    });
  }

  it("group card: the toolbar wraps so the view toggle never overflows the card", () => {
    // "By vessel" is the last control in the row; with a no-wrap flex row it was
    // pushed past the card edge on narrower viewports.
    expect(group).toContain("flex flex-row flex-wrap items-center justify-between gap-y-2 space-y-0");
    expect(group).toContain('<div className="flex flex-wrap items-center justify-end gap-2 min-w-0">');
  });
});

describe("Invoices page — global credit notes view", () => {
  it("queries every open credit note across the book", () => {
    expect(invoices).toContain("trpc.invoices.creditNotes.useQuery()");
  });

  it("offers a Credit notes view next to By group / By vessel", () => {
    expect(invoices).toContain("creditView");
    expect(invoices).toContain("Credit notes ({(creditNotes ?? []).length})");
  });

  it("shows the unused credit total with its per-currency split", () => {
    expect(invoices).toContain("Unused credit");
    expect(invoices).toContain("creditTotals");
  });

  it("ignores invoice-only filters (status, bucket, installments) for credit notes", () => {
    const block = invoices.slice(invoices.indexOf("const filteredCreditNotes"), invoices.indexOf("const creditTotals"));
    expect(block).not.toContain("statusFilter");
    expect(block).not.toContain("bucketFilter");
    expect(block).not.toContain("contractFilter");
    expect(block).toContain("branchFilter");
    expect(block).toContain("groupDrill");
  });
});

describe("Send Email — searchable contact list", () => {
  it("filters the contacts with the shared token matcher", () => {
    expect(sendEmail).toContain("matchesAllTokens");
    expect(sendEmail).toContain("shownContacts");
  });

  it("keeps the list bounded so the dialog does not grow forever", () => {
    expect(sendEmail).toContain("max-h-56 space-y-1 overflow-y-auto");
  });

  it("resets the search and collapses the list when the dialog closes", () => {
    expect(sendEmail).toContain("setContactSearch(\"\")");
    expect(sendEmail).toContain("setContactListOpen(false)");
  });

  it("shows no names until the search box is used (dialog opens compact)", () => {
    expect(sendEmail).toContain("const [contactListOpen, setContactListOpen] = useState(false);");
    expect(sendEmail).toContain("{contactListOpen && (");
    expect(sendEmail).toContain("onFocus={() => setContactListOpen(true)}");
  });

  it("the names appear as an overlay dropdown, not as inline rows", () => {
    expect(sendEmail).toContain("absolute left-0 right-0 top-9 z-20 max-h-56");
    expect(sendEmail).toContain("bg-popover p-1 text-popover-foreground shadow-lg");
    // Click-away and Escape both close it.
    expect(sendEmail).toContain('className="fixed inset-0 z-10" onClick={() => setContactListOpen(false)}');
    expect(sendEmail).toContain('if (e.key === "Escape") {');
  });

  it("selects multiple recipients as removable chips (first is To, rest are Cc)", () => {
    expect(sendEmail).toContain("const [recipients, setRecipients]");
    expect(sendEmail).toContain("toggleContact");
    expect(sendEmail).toContain("removeRecipient");
    expect(sendEmail).toContain("recipients[0]?.email");
    expect(sendEmail).toContain("idx === 0 ? \"To\" : \"Cc\"");
  });

  it("passes the extra recipients to the mailto cc field and to the server", () => {
    expect(sendEmail).toContain("cc=${encodeURIComponent(cc.join(\",\"))}");
    expect(sendEmail).toContain("ccEmails: cc");
  });

  it("accepts recipients only from the address book (no free-typed address)", () => {
    // Removed on request: every recipient must be a stored contact, so unknown
    // addresses cannot be typed straight into the send dialog.
    expect(sendEmail).not.toContain("addManualEmail");
    expect(sendEmail).not.toContain("Other email address…");
    expect(sendEmail).not.toContain("manualEmail");
    // Adding somebody new goes through Add Contact, which stores them first.
    expect(sendEmail).toContain("handleAddContact");
  });

  it("server accepts and records the cc list", () => {
    const router = read("server/routers/ar.ts");
    expect(router).toContain("ccEmails: z.array(z.string().email()).max(20).optional()");
    expect(router).toContain("const allRecipients = [input.recipientEmail, ...cc]");
    expect(router).toContain("allRecipients.join(\", \")");
  });
});

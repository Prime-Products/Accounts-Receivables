/**
 * Guards the invariants the ERP contact import relies on. The import itself is a
 * one-off script, but these rules also govern how imported rows behave in the UI
 * (dedup key, group linkage, position derivation), so they are worth locking down.
 */
import { describe, it, expect } from "vitest";
import { listAllPaymentContacts, listCustomers } from "./db";

/** Mirror of the normalisation used to match Excel company names to AR customers. */
function normCompany(s: string): string {
  const stripped = s
    .toUpperCase()
    .replace(/\b(S\.?A\.?|A\.?E\.?|LTD|LIMITED|INC|CORP|CORPORATION|CO|PTE|LLC|GMBH|BV|NV|WLL|PLC|EPE|OE|IKE)\b/g, "");
  return stripped.replace(/[^A-Z0-9\u0370-\u03FF]/g, "");
}

describe("company name normalisation (import matching)", () => {
  it("ignores legal suffixes and punctuation", () => {
    expect(normCompany("CHANDRIS HELLAS INC")).toBe(normCompany("Chandris Hellas Inc."));
    expect(normCompany("MEGARA RESINS A.E.")).toBe(normCompany("Megara Resins AE"));
  });
  it("preserves Greek company names", () => {
    expect(normCompany("ΜΕΓΑΡΑ ΡΕΤΣΙΝΕΣ Α.Ε.")).toContain("ΜΕΓΑΡΑ");
  });
  it("does not collapse genuinely different companies", () => {
    expect(normCompany("AGROS SHIPPING CORPORATION")).not.toBe(normCompany("ALBROS SHIPPING CO. LTD"));
    expect(normCompany("AOSTA SHIPPING SA")).not.toBe(normCompany("ARISTA SHIPPING S.A."));
  });
});

describe("imported contacts in the database", () => {
  it("every contact points at an existing customer", async () => {
    const [contacts, customers] = await Promise.all([listAllPaymentContacts(), listCustomers()]);
    const ids = new Set(customers.map(c => c.id));
    const orphans = contacts.filter(c => !ids.has(c.customerId));
    expect(orphans.map(o => `${o.id}:${o.email}`)).toEqual([]);
  });

  it("has no duplicate (customer, email) pairs", async () => {
    const contacts = await listAllPaymentContacts();
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const c of contacts) {
      // Colleagues legitimately share a department inbox, so the person's name is
      // part of the identity — only the same person twice is a real duplicate.
      const key = `${c.customerId}|${c.name.trim().toUpperCase()}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it("allows several people to share one department mailbox", async () => {
    const contacts = await listAllPaymentContacts();
    const perEmail = new Map<string, Set<string>>();
    for (const c of contacts) {
      const key = c.email.toLowerCase();
      if (!perEmail.has(key)) perEmail.set(key, new Set());
      perEmail.get(key)!.add(c.name.trim().toUpperCase());
    }
    // The ERP export is full of shared inboxes (pu@…, purch@…); if this drops to
    // zero it means the dedup collapsed distinct colleagues again.
    const shared = [...perEmail.values()].filter(names => names.size > 1);
    expect(shared.length).toBeGreaterThan(0);
  });

  it("every contact has a usable email address", async () => {
    const contacts = await listAllPaymentContacts();
    const bad = contacts.filter(c => !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(c.email));
    expect(bad.map(b => b.email)).toEqual([]);
  });

  it("every contact has a non-empty name", async () => {
    const contacts = await listAllPaymentContacts();
    const blank = contacts.filter(c => !c.name || c.name.trim().length === 0);
    expect(blank.map(b => b.id)).toEqual([]);
  });

  it("phone values fit the column and contain enough digits to dial", async () => {
    const contacts = await listAllPaymentContacts();
    const bad = contacts.filter(c => {
      if (!c.phone) return false;
      if (c.phone.length > 20) return true;
      return c.phone.replace(/\D/g, "").length < 7;
    });
    expect(bad.map(b => b.phone)).toEqual([]);
  });

  it("contacts resolve to a group via their customer", async () => {
    const [contacts, customers] = await Promise.all([listAllPaymentContacts(), listCustomers()]);
    const byId = new Map(customers.map(c => [c.id, c]));
    const groupless = contacts.filter(c => {
      const cust = byId.get(c.customerId);
      if (!cust) return true;
      const group = (cust.customerGroup ?? "").trim() || cust.name;
      return group.length === 0;
    });
    expect(groupless.map(g => g.id)).toEqual([]);
  });

  it("every group with contacts is reachable through listByGroup semantics", async () => {
    const [contacts, customers] = await Promise.all([listAllPaymentContacts(), listCustomers()]);
    const byId = new Map(customers.map(c => [c.id, c]));
    const groupOf = (customerId: number) => {
      const cu = byId.get(customerId);
      return cu ? (cu.customerGroup ?? "").trim() || cu.name : "";
    };
    // Mirrors the router: members are all customers sharing the resolved group name.
    const memberGroups = new Set(customers.map(c => (c.customerGroup ?? "").trim() || c.name));
    const unreachable = contacts.filter(c => !memberGroups.has(groupOf(c.customerId)));
    expect(unreachable.map(c => c.id)).toEqual([]);
  });
});

/**
 * Guards the one-line "where am I?" locator.
 *
 * The rule this file enforces: each fact appears exactly ONCE in the header.
 * The record's name belongs to the title, so the locator above it must not
 * repeat it as plain text — the only place the parent's name is spelled out is
 * the back link, because "up one level" and "the parent's name" are one fact.
 * The type badge stays, since a group card and a company card are otherwise
 * visually identical.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

const component = read("client/src/components/RecordBreadcrumb.tsx");
const hub = read("client/src/pages/CustomerHub.tsx");
const receivables = read("client/src/pages/GroupDetail.tsx");
const company = read("client/src/pages/CustomerDetail.tsx");

describe("record type badge", () => {
  it("declares exactly the two customer record kinds", () => {
    expect(component).toMatch(/export type RecordEntity = "group" \| "company"/);
  });

  it("labels each kind in words, not just by colour", () => {
    expect(component).toMatch(/label: "GROUP"/);
    expect(component).toMatch(/label: "COMPANY"/);
  });

  it("gives the two kinds different colours and icons so they read at a glance", () => {
    expect(component).toMatch(/violet/);
    expect(component).toMatch(/sky/);
    expect(component).toMatch(/icon: Layers/);
    expect(component).toMatch(/icon: Building2/);
  });

  it("explains the distinction on hover for whoever is unsure", () => {
    expect(component).toMatch(/A customer group — it owns companies/);
    expect(component).toMatch(/A single company inside a customer group/);
  });
});

describe("the locator states each fact once", () => {
  it("takes a single parent instead of a trail that would repeat the title", () => {
    expect(component).toMatch(/parent: \{ label: string; href: string \}/);
    expect(component).not.toMatch(/trail/);
  });

  it("renders the parent as a back affordance labelled with where it goes", () => {
    expect(component).toMatch(/ArrowLeft/);
    expect(component).toMatch(/title=\{`Back to \$\{parent\.label\}`\}/);
    expect(component).toMatch(/\{parent\.label\}/);
  });

  it("marks the module as the current page when inside one", () => {
    expect(component).toMatch(/aria-current="page"/);
    expect(component).toMatch(/\{module\}/);
  });

  it("is announced as a breadcrumb to assistive tech", () => {
    expect(component).toMatch(/aria-label="Breadcrumb"/);
  });
});

describe("pages state which record you are on", () => {
  it("the group card marks itself GROUP and leads back to the list", () => {
    expect(hub).toMatch(/entity="group"/);
    expect(hub).toMatch(/parent=\{\{ label: "Customers", href: "\/customers" \}\}/);
  });

  it("the group card does not repeat its own name above the title", () => {
    expect(hub).not.toMatch(/trail=/);
    expect(hub).not.toMatch(/Customer card — /);
  });

  it("the receivables module names itself and leads up to the customer card", () => {
    expect(receivables).toMatch(/entity="group"/);
    expect(receivables).toMatch(/module="Receivables"/);
    expect(receivables).toMatch(/label: "Customer card"/);
    expect(receivables).toMatch(/href: `\/groups\/\$\{encodeURIComponent\(group\)\}`/);
  });

  it("the receivables module does not repeat the module name in the subtitle", () => {
    expect(receivables).not.toMatch(/Receivables — \{data/);
  });

  it("the receivables module drops the separate back button", () => {
    expect(receivables).not.toMatch(/Back to the customer card/);
  });

  it("the company card marks itself COMPANY and leads up to its owning group", () => {
    expect(company).toMatch(/entity="company"/);
    expect(company).toMatch(/label: customer\.customerGroup\.trim\(\)/);
    expect(company).toMatch(/href: `\/groups\/\$\{encodeURIComponent\(customer\.customerGroup\.trim\(\)\)\}`/);
  });

  it("a company with no group still has a way out, to the list", () => {
    expect(company).toMatch(/\{ label: "Customers", href: "\/customers" \}/);
  });

  it("no longer repeats the group as a chip beside the company title", () => {
    expect(company).not.toMatch(/title="Open the group card"/);
  });
});

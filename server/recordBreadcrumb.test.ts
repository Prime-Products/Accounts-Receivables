/**
 * Guards the "where am I?" strip.
 *
 * A group card and a company card show the same figures, so the ONLY reliable
 * signal of which one you are on is the type badge plus the trail. These tests
 * read the component source and assert that contract stays in place:
 *  - both record kinds are declared with a distinct label, icon and colour;
 *  - every customer-facing page renders the strip with the right entity;
 *  - the owning group is a clickable ancestor on a company card, so the card is
 *    never a dead end;
 *  - the group is not also repeated as a chip next to the title.
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

  it("marks the current page and does not link the last crumb", () => {
    expect(component).toMatch(/aria-current=\{last \? "page" : undefined\}/);
    expect(component).toMatch(/c\.href && !last/);
  });

  it("is announced as a breadcrumb to assistive tech", () => {
    expect(component).toMatch(/aria-label="Breadcrumb"/);
  });
});

describe("pages state which record you are on", () => {
  it("the group card marks itself as a GROUP", () => {
    expect(hub).toMatch(/<RecordBreadcrumb\s+entity="group"/);
  });

  it("the receivables module names the module as the final crumb", () => {
    expect(receivables).toMatch(/entity="group"/);
    expect(receivables).toMatch(/module="Receivables"/);
  });

  it("the receivables module keeps the group itself clickable", () => {
    expect(receivables).toMatch(/href: `\/groups\/\$\{encodeURIComponent\(group\)\}`/);
  });

  it("the company card marks itself as a COMPANY", () => {
    expect(company).toMatch(/entity="company"/);
  });

  it("the company card offers its owning group as a clickable ancestor", () => {
    expect(company).toMatch(/label: customer\.customerGroup\.trim\(\)/);
    expect(company).toMatch(/href: `\/groups\/\$\{encodeURIComponent\(customer\.customerGroup\.trim\(\)\)\}`/);
  });

  it("no longer repeats the group as a chip beside the company title", () => {
    expect(company).not.toMatch(/title="Open the group card"/);
  });
});

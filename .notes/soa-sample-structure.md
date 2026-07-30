# SOA sample (seaworldstatement.pdf, uploaded 31/7) — structure
One page (or more) PER CUSTOMER COMPANY (e.g. DELIAH SHIPPING LIMITED, DIONE MARITIME INC, HAN ZHI LIMITED, MEADOW MARINE INC, OLIA SHIPPING INC — these are group members of SEAWORLD group presumably).

## Header
- PRIME PRODUCTS logo top-right, red title "STATEMENT OF ACCOUNT"
- Row: COMPANY | DATE (17/7/2026) | PAYMENT TERMS ("60 days Credit / Πίστωση 60 ημερών")

## TOTAL AMOUNTS section (red heading)
Table: one row per OUR branch (6 rows always):
 PRIME PRODUCTS LTD (EUR), PRIME PRODUCTS DISTRIBUTION(S) PTE LTD (SGD), PRIME PRODUCTS DISTRIBUTION FZC LTD (AED), PRIME PRODUCTS DISTRIBUTION B.V (EUR), P.P.D. PRIME PRODUCTS DISTRIBUTION LTD (EUR), PRIME PRODUCTS DISTRIBUTION USA LLC (USD)
Columns: Company | Currency | Balance | Unpaid Documents | Overdue Documents | Upcoming Within Month | Upcoming Next Month
(amounts in original currency of branch, comma decimal format e.g. 964,31)

## ANALYSIS section (red heading)
One sub-table PER BRANCH that has documents, headed by branch city (PIRAEUS / HOUSTON) + full branch name + "currency: €/$"
Columns: Doc. Date | Documents | Doc. Amount | Open Doc. Amount | Overdue (days) | Vessel | Comments
- Documents = invoice number (ΤΔΤΧ-113252, ΤΔΜΕΤ01717, INV-000101...)
- Overdue = days overdue (can be negative = not yet due, e.g. -36)
- Vessel = vessel name (SEA GALAXY, RADIANT PRIDE, PINE MEADOW, PINE OLIA)
- Comments = free text/PO refs

## Footer per branch
BANK DETAILS line(s): beneficiary name, bank, IBAN, BIC (per branch; PIRAEUS has Alpha+Eurobank, Houston: EAST WEST BANK routing+SWIFT+account, BV: ABN AMRO IBAN/BIC)

## Key semantics
- Statement is per CUSTOMER (company), combining ALL OUR BRANCHES and currencies
- Dates dd/mm/yyyy, amounts with comma decimals
- "Upcoming Within Month"/"Upcoming Next Month" = not-due amounts due within current month / next month

## Pages 6-9 additional findings
- SEA ADMIRAL MARITIME INC (p6): PTE LTD branch shown with "currency: $" (SGD); bank: HSBC Swift HSBCSGSG, multiple account numbers (USD/EUR/SGD accounts)
- SEAWORLD MANAGEMENT AND TRADING INC (p7-9): big customer, ANALYSIS spans multiple branches sequentially: PIRAEUS (EUR), FUJAIRAH (AED — "PRIME PRODUCTS DISTRIBUTION LTD FZC"), B.V. (EUR), HOUSTON (USD)
- Negative Doc. Amounts exist (credit notes/payments): e.g. EMB0001806 -7.271,65, EMB0000245 -1.882,68, EMB0002547 -1.610,03 with open -198,01 → EMB docs = payments/credits partially allocated, shown with negative amounts. Comments say "SEAWORLD MANAGEMENT AND TRADING INC."
- Overdue can be negative (not yet due) e.g. -17, -31, -48
- Doc types: ΤΔΤΧ, ΤΔΜΕΤ, ΤΠΥ, ΔΑΤ, TIM, EMB (credit/payment), INV, INVEXP, SRI (installments FZC)
- Comments include PO refs, installment descriptions ("1st HALF OF 2nd/5yr INSTALLMENT_EQUAL EURO:1550"), vessel notes
- FUJAIRAH bank details: ADCB IBAN AED + USD; note "For USD transfers the payment has to be routed through Bank of America [Swift BOFAUS3N] for onward credit to ADCB"
- Number format: thousands dot, decimal comma (4.620,60); dates d/m/yyyy
- TOTAL AMOUNTS columns semantics: Balance (total incl. not-due & unallocated credits), Unpaid Documents (open docs total), Overdue Documents (overdue only), Upcoming Within Month, Upcoming Next Month
- Balance can differ from Unpaid Docs (p7: Balance 8.648,94 vs Unpaid 9.524,42 EUR → unallocated credits reduce balance; AED Balance 98.384,10 vs Unpaid 97.048,60?? — actually Balance > Unpaid here, maybe includes non-doc items)
- RULE (user 31/7): TOTAL AMOUNTS table must OMIT branch rows where all amounts are zero
## Agreed readability improvements (user approved 31/7)
1. Hide zero-balance branch rows in TOTAL AMOUNTS
2. TOTAL row at end of each ANALYSIS branch table
3. Zebra striping on analysis rows
4. Overdue days >0 red, negative gray
5. Per-company page numbering
6. Balance = Unpaid Documents (open invoices only)
7. Comments = invoice notes; Vessel from invoice vessel; bank details copied from sample per branch
8. Payment terms: pull real per-customer terms (paymentTermsDays) instead of fixed 60 days

## Implementation state (31/7, phase 2)
- CREATED server/lib/statement.ts: BRANCHES registry (6 branches w/ bank details from sample), buildGroupStatement() → GroupStatement {companies: CompanyStatement {totals(TotalsRow, zero-branches omitted), analyses(BranchAnalysis rows)}}, fmtAmount (EU format), fmtDate (d/m/yyyy)
- CREATED server/lib/statementPdf.ts: buildStatementPdf(GroupStatement) → Buffer; red headings, TOTAL AMOUNTS table, ANALYSIS zebra rows, red overdue, per-branch bank details, per-company page numbers (bufferPages)
- TODO NEXT: wire into reports.export "soa-group"+"soa" pdf format in server/routers/ar.ts (~line 3941 soa-group branch, ~4008 soa single): when format==="pdf", use buildGroupStatement + buildStatementPdf instead of TableSpec/buildPdf. Keep xlsx path as-is.
- reports.export inputs: report enum aging/forecast/soa/soa-group; format xlsx/pdf; customerId, group, branch, minDaysOverdue optional. Returns {filename, mimeType, base64}.
- SendEmailDialog downloads SOA via reports.export soa-group pdf (check exact call in client SendEmailDialog.tsx)
- db helpers: db.listCustomers() (has paymentTermsDays), db.listInvoices(), db.listVessels() (id,name)
- invoice fields: company (branch key), currency, issueDate, dueDate, amount, paidAmount, vesselId, notes
- branch keys in DB exactly: "Prime Products LTD", "Prime Products Distribution(s) PTE LTD", "Prime Products Distribution FZC LTD", "Prime Products Distribution B.V", "P.P.D. Prime Products Distribution Ltd", "Prime Products Distribution USA LLC"

## Visual verification round 1 (/tmp/sample-soa.pdf)
GOOD: layout matches sample (red titles, header row, TOTAL AMOUNTS, ANALYSIS per branch, zebra, red overdue, totals row, bank details, page numbers)
BUGS FOUND:
1. Greek characters garbled (invoice numbers like "9C'·BÓsCp", payment terms Greek text mojibake) — Helvetica (WinAnsi) lacks Greek. FIX: register a Unicode TTF (DejaVu Sans / Noto Sans incl. Greek) via doc.registerFont and use everywhere.
2. TOTAL AMOUNTS table overflows right edge — "Upcoming Next Month" column clipped. FIX: reduce col widths to fit 515pt content width.
3. Payment terms cell shows mojibake for Greek "Πίστωση" — same font fix.

## Visual verification round 2 — PASS
- Greek renders correctly (ΔΑΤ-111747, ΤΔΜΕΤ02039, ΤΠΥ-300214, "Πίστωση 30 ημερών")
- TOTAL AMOUNTS fits page width, all 7 cols visible incl. Upcoming Next Month
- Zebra rows, red overdue, TOTAL rows, bank details all good
- Layout matches sample. Remaining: vitest coverage + checkpoint.
- Fonts bundled at server/assets/NotoSans-{Regular,Bold}.ttf (~500KB each, inside project — OK since not client-side media; server assets deploy with build)

## Bug report 31/7: blank pages in SOA-MINERVA_MARTINOS (14 pages)
Observed: pages 1-7 contain the actual statements (2 companies), pages 8-14 are BLANK except the footer
"MINERVA GAS INC — Page 1 of 1", "MINERVA MARINE INC — Page 1..6 of 6" top-right.
Diagnosis: the footer pass writes per-company page numbers. The page-range bookkeeping
(company -> page indices) is wrong: after rendering all companies we switch pages via
doc.switchToPage in the footer loop, but ranges recorded include pages that were never
created for content OR the footer loop calls doc.addPage/creates new pages when writing
text near the top-right (text() with an explicit y beyond content can trigger new page?).
Actually: pages 8-14 contain ONLY footers => the footer pass added NEW pages. Most likely
cause: in footer pass we call doc.text(...) WITHOUT lineBreak:false, and text at y=20 with
default flow can advance doc.y; OR page ranges wrong because doc.addPage() inside content
render increments count but footer loop uses switchToPage(i) with buffered range offset
mismatch (bufferedPageRange().start not 0-based accounted).
FIX plan: record start/end page indices per company during render via doc.bufferedPageRange();
in footer pass use switchToPage over the ACTUAL buffered range, and write footer with
{ lineBreak: false } to avoid page creation. Also flushPages at end.

## Round 2 diagnosis (fix 1 insufficient)
Regenerated after lineBreak:false + flushPages — STILL 14 pages, 7 content + 7 footer-only.
So the footer pass didn't create the extra pages; they exist BEFORE the footer pass.
=> renderCompany created 7 extra blank pages during content render.
Companies: MINERVA GAS INC (1 content page) + MINERVA MARINE INC (6 content pages) = 7 content pages.
Extra pages = exactly 7 = same count → looks like EVERY content page gets a shadow blank page.
Hypothesis: doc.text() calls with explicit x,y near/below the bottom auto-page-break because
pdfkit's internal flow: when text with explicit y > page height - bottom margin, it adds a page.
Our row loop breaks at ay>780, but hline at ay after last row (row bottoms near 780+rowH?) …
Actually more likely: doc.text(...) without lineBreak:false at fixed y where the TEXT WRAPS
(e.g. comments col) and continues past maxY → pdfkit adds page automatically mid-render, which
our pageIndex counter DOESN'T see (doc.addPage internal), so pageRanges end indexes point
beyond/shifted and switchToPage hits auto-added pages... but those auto pages would contain
overflow text, not be blank.
Better: count doc.bufferedPageRange().count vs our pageIndex to find where extras appear.

## ROOT CAUSE FOUND (debug-pages.mjs)
14 addPage calls: 7 legit content pages (newPage/ensureSpace), then 7 from pdfkit
line_wrapper.wrap → continueOnNewPage — i.e. the FOOTER doc.text() at y=812 triggers
auto page-break because 812 + lineHeight > page height - bottom margin (842-40=802).
lineBreak:false doesn't help: pdfkit still checks the START y against maxY and 812>802,
so it wraps to a new page BEFORE writing. Fix: write footer at y=808 within the
printable area AND set doc.page.margins.bottom=0 during footer pass (standard pdfkit
footer recipe), or just use y <= 802 - lineHeight ≈ 790. Choose: temporarily zero
bottom margin + restore, keep y=812 to match sample position.

## Round 3 verification (after margin fix)
- 7 pages total, footers now ON content pages bottom-right. Blank pages GONE. ✔
- ANALYSIS header height 26 fixed: two-line col headers no longer touch rule. ✔
- Branch displayName no longer collides with table top line (dnH clearance). ✔
Remaining minor overlaps seen:
1. Header row: "30 days Credit / Πίστωση 30 ημερών" wraps to 2nd line and touches the
   bottom rule (hline at y0+36) — need dynamic header height or narrower text/1 line.
2. TOTAL AMOUNTS: "PRIME PRODUCTS DISTRIBUTION(S) PTE LTD" wraps to 2 lines and 2nd line
   overlaps the following row's rule/text (rowH fixed 18) — need dynamic row height.

## Round 4 FINAL verification — ALL PASS
- 7 pages, no blank pages, footer bottom-right on every content page.
- Header: "30 days Credit / Πίστωση 30 ημερών" wraps but rule line moves below it — no overlap.
- TOTAL AMOUNTS: "PRIME PRODUCTS DISTRIBUTION(S) PTE LTD" 2-line row gets taller row height — no overlap.
- ANALYSIS headers (Doc. Amount / Open Doc. Amount 2-line) have clearance; branch name wraps cleanly above table.

# Working notes — Excel import & EUR conversion (2026-07-23)

## Excel file (uploaded by user)
- Path: /home/ubuntu/upload/OPENINVOICESCUSTOMERS21.07.26FORAI.xlsx (sheet "Print")
- Columns: Εταιρεία | Customer Group | Customer | Invoice Document | Invoice Date | Invoice Due Date | Invoice Value | Currency
- 5,424 rows, 811 unique customers, 363 customer groups, 6 companies:
  Prime Products LTD (4323, EUR), Distribution FZC LTD (322, DIRHAM/AED), P.P.D. Ltd (284), PTE LTD Singapore (259, SGD), B.V (162), USA LLC (74, USD)
- Currencies: EURO 4769, DIRHAM 322, SGD 259, USD 74; total mixed value ~6,908,341.63
- Issue dates 2023-06-06 → 2026-07-21; due dates 2023-08-05 → 2026-11-18
- 125 duplicate invoice numbers ACROSS companies (e.g. INV-000299 in SG + NL) → handled by prefixing company tag (SG-/AE-/NL-/US-/PPD-) on collision

## Import status (DONE)
- Script: scripts/import-invoices.mjs — imported 811 customers + 5,424 invoices, 0 skipped
- Customers get code slug + customerGroup; tier=New, terms 30d
- Invoices: company, currency (EURO→EUR, DIRHAM→AED), status Open/Overdue by due date

## Schema changes applied (migrations 0002, 0003 executed)
- customers.customerGroup varchar(255)
- invoices.company varchar(128), invoices.currency varchar(8) default 'EUR', invoices.amountEur decimal(14,2)

## EUR conversion (ευρωποίηση) — user requested
- Backfilled amountEur via SQL: EUR=amount, USD*0.92, AED*0.25, SGD*0.68 (indicative rates)
- arLogic.outstanding() now returns EUR (uses amountEur proportional to unpaid fraction); outstandingOriginal() added
- TODO remaining: show original currency in Invoices table UI; optionally FX rates in Settings; verify dashboard; checkpoint

# Prime247 domain model — from user explanation + 2 source documents (2026-08-04)

## Sources
1. `ΔιαδικασίακαταχώρησηςσυμβολαίωνστοSoft1.pdf` (11 pages, text) → notes/soft1-procedure-raw.txt
2. `CHACHACHA-SPRINGCO22026(1).pdf` (8 pages, SCANNED images, PaperPort 11.0, no text layer)
   → real signed 247 Service Agreement, read via vision.

## User's own summary (Greek, verbatim intent)
"Συμφωνούμε με μια εταιρεία ότι για τα πλοία της, 5-10 πλοία, θα τους δώσουμε τον εξοπλισμό:
γκαζόμετρα, όργανα μέτρησης που έχουν serial number και πιστοποιητικό. Επίσης μπουκάλες για
calibration και αμπούλες. Αυτά τα ανεβάζουμε στη βιβλιοθήκη και τα παρακολουθούμε — πότε λήγουν
τα πιστοποιητικά και διάφορες άλλες πρακτικές."

=> Contract = agreement with a MANAGING COMPANY covering N vessels.
=> Per vessel: a standard SET of equipment (the "library" / contract items).
=> Two natures: (a) instruments with serial number + certificate (tracked individually),
   (b) consumables: calibration cylinders ("μπουκάλες") + detector tubes/ampoules (quota-based).
=> Core value: track certificate expiry + practical follow-ups.

## Real contract example: CHACHACHA / SPRING MARINE MANAGEMENT, CO2 2026
- Parties: PRIME PRODUCTS LTD  ↔  SPRING MARINE MANAGEMENT (the Managing Company)
- Scope: "supply, monitoring and maintenance of critical equipment on board for a period of 3 years"
- Vessels entering the agreement: ONE (01) — listed in Annex 1
- Title pattern matches Soft1 rule: COMPANY | N VESSELS | EQUIPMENT TYPE | YEAR

### Section 1 — SUPPLY OF CRITICAL EQUIPMENT (per vessel!)
Gas detector equipment:
1) 04 pcs PERSONAL RIKEN KEIKI GX-3R  LEL/O2/H2S/CO sensor, rechargeable battery (set: instrument + battery pack)
2) 02 pcs PORTABLE GX-6100 VOL/LEL/O2/H2S/CO sensor, internal pump + rechargeable battery
3) 02 pcs SAMPLING HOSE 30MTR
4) 01 pcs RIKEN KEIKI LEGASIC IrCOMM ADAPTER PRO PLUS with USB cable
5) 01 pcs RIKEN KEIKI SOFTWARE
6) 01 set REGULATOR 0.25 lpm
7) 02 pcs HAND PUMP FOR DETECTOR TUBES
8) 02 pcs SAMPLING LINE 15 MTR for detector tubes
9) 02 pcs TRAP LINE FILTER
10) 04 pcs HAND PUMP WITH SAMPLING LINE 30MTR (for GX-3R)

### Calibration cylinders & detector tubes (ANNUAL quota)
- Forwarding happens ANNUALLY. Communication with ship + managing company starts
  TWO MONTHS prior to expiring date, to find the most convenient port
  (constraint: the closest airport must accept dangerous cargo).
- A. CALIBRATION CYLINDERS (annual supply of):
  * 04 pcs CALIBRATION CYLINDER CO/ISOBUTANE/OX/H2S 34LTR → total 12 pcs for 3 years
  * 02 pcs CALIBRATION CYLINDER 10% VOL ISOBUTANE 34 LTR → total 06 pcs for 3 years
- B. DETECTOR TUBES: total supply of 100 pkt for 3 years
=> CONFIRMS the quotaType Annual vs ContractLife distinction already in ops_contract_library.

### Section 2 — SERVICES PROVIDED
1. 3-years warranty (incl. instruments' sensors)
2. Instruments' monitoring: when a vessel enters 247 service, all gas detectors' data
   (certificates, SERIAL NUMBERS etc.) is entered into Prime's monitoring system → followed & updated
3. Reminding system: automated mail TWO MONTHS prior to certificate expiry
4. Certification: free-of-charge certificates if ships e-mail calibration data through
   approved program "RIKEN SOFTWARE"; Prime monitors the certificates
5. Exchange service: replace equipment on vessel or at closest port; transport free within
   branches: Piraeus, Singapore, Fujairah, Rotterdam, Houston
6. Web platform: users on vessel + office access all gas detector data (certificates, manuals,
   training videos), working condition of all equipment, service history (when/where serviced),
   statistical data per vessel

## Soft1 procedure — the authoritative field list for a contract
Path: Prime247 > Contracts > New Contract
- Contract No (unique ref), Description = "COMPANY | N VESSELS | EQUIPMENT | YEAR"
- Customer (the shipping company), Invoice Company (which Prime group entity bills)
- Contract Type = Customer Contract; Status = Active when fully signed
- Start Date / End Date exactly as signed (NOT always 3 years)
- Contract Sales Amount = amount per vessel for whole duration x number of signed vessels
- Contract Cost Forecast, Margin, Add-on Cost Group 3
- Vessels Signed (count) MUST equal number of rows in Contract Vessels
- Flags after save: Active 247 = Yes, B2B = Yes, Contract Type = Customer Contract
- PPE: only for clothing/PPE contracts; NOT for gas detection & calibration
- Manual First Bill Date: per financial terms, do not change without confirmation
- Calibration Type = Jet Eye when remote calibration via JetEye:
  vessel calibrates before certificates expire → sends results → Technical Dept checks →
  renewed certificates issued
- Items: Item Code, Description, Qty, Group 3.
  *** CRITICAL RULE: Qty is PER VESSEL, not total. 4 vessels x 2 BW FLEX = Qty 2, not 8. ***
- Item Group 3 (Displayed in Inventory): kept on the top list, manually REMOVED from the
  detail lines of the related items (e.g. group 107 for BW ELECTRIC PUMP + SAMPLING LINE)
- Contract Vessels: every vessel one by one, with code and name
- B2B per vessel: must be ticked on EACH vessel card separately (contract-level B2B is not enough)
- Comments tab notifications: Not. Days 1 = 60, Not. Days 2 = 15, Email Type = Both (Customer and Vessel)
- Vessels Activated: NOT the same as Vessels Signed. Incremented gradually per vessel after
  initial supply is completed → that is when the contract instalments (δόσεις) start for that vessel.

## Orders after registration
- Orders are the official operational notification to PRODUCT MANAGERS (order / reserve stock /
  prepare / deliver to vessels).
- Few vessels → separate order per vessel (clean, supply links to the right order).
- Large fleet → manual one-order-per-vessel is slow; a shared Bulk Order is easier to create but
  hurts per-vessel tracking. Documented risks: not obvious which vessel has its own complete order;
  hard to check supply and pending items per vessel; Vessels Activated needs extra manual
  reconciliation; PMs lack per-vessel visibility; unclear which conversion is done vs pending.
- Soft1 wish (central proposal): one command from the contract creates an independent order per
  vessel via separate conversion; one screen shows which vessels have no order, which conversions
  are pending, which completed.

## Final checklist items (Soft1 doc, section Η) — each is OK / Pending
Contract No & Description | Customer & Invoice Company | Start/End Date | Contract Type & Status |
Contract Sales Amount | Cost Forecast, Margin, Add-on Cost Group 3 | Vessels Signed |
Items & Qty (per vessel) | Item Group 3 | Contract Vessels | B2B per vessel |
PPE & Manual First Bill Date | Calibration Type | Notifications (60/15, Both) |
Orders per vessel | Conversions | Product Managers informed | Signed Contract attached |
Vessels Activated updated after supply

## Gap analysis vs current ar_app implementation
Current: ops_contracts (0 rows), ops_contract_library (itemType Service/Asset/Consumable,
quantity, quotaType Annual/ContractLife, quotaLimit), ops_assets (serialNumber, catalogItemId,
vesselId, contractId, status, targetReturnPort), ops_certificates, ops_consumable_orders,
ops_vessel_assignments, ops_vessel_history, ops_asset_catalog, ops_consumable_catalog.

MISSING vs the real process:
- New Asset dialog is unusable (Contract required but no contracts exist; no vessel select).
- No per-vessel generation of the standard equipment set from the contract library
  ("one command → per-vessel order/assets") — this is THE core time saver.
- No Vessels Signed vs Vessels Activated distinction driving instalment start.
- No Invoice Company, Contract No/Description convention, Calibration Type (Jet Eye),
  notification days (60/15), B2B per vessel, PPE flag, Manual First Bill Date.
- Certificate reminder is not tied to the contractual 2-months-prior rule (60/15 days).
- No annual consumable cycle with "start comms 2 months before expiry + port with dangerous
  cargo airport" logic.
- No signed-contract document attachment.

## CHACHACHA contract — pages 5-8 (commercial terms, read via vision)

### Support (part of Services)
- Email & telephone support, immediate assistance from Prime office technicians.
- Contact: Tel +302130113105, +302104819800 / Mob +306958467042, +306944624692
- Mail: servicegr@primeltd.com — PIC: Mr Giannis Doumpiotis, Mr Panagiotis Karpatsis
7. Online training and seminars: online training via 247 web platform, live sessions (mandatory
   for proper use/maintenance). In-person courses free of charge at the Managing Company's
   premises; seminars periodically at Piraeus head office. If abroad, Managing Company covers
   accommodation/travel + 200 EUR/day technician fee. Certificates of completion issued.

### Section 3 — PAYMENT TERMS  *** KEY FOR AR ***
- 16,950 EUR PER VESSEL for complete equipment, over 3 years.
- Paid as THREE equal instalments of 5,650 EUR per vessel, one per year.
- "Activation of service agreement will take place for every vessel separately and when the
  first exchange will be made."  → per-vessel activation trigger.
- First instalment issued with 30 DAYS CREDIT.
- Each instalment payable each year of the contract.
=> Contract Sales Amount for this contract = 16,950 x 1 vessel = 16,950 EUR (Soft1 rule confirmed).
=> Instalment schedule is PER VESSEL and starts at that vessel's activation date, not contract start.

### Section 4 — TERMS OF COOPERATION
- Warranty: 3 years on all instruments' sensors, conditional on correct storage/operation per
  manufacturer instructions.
- Malfunction flow: Master contacts Prime → if shore assistance not enough, instrument returned to
  Prime premises for service → Prime contacts ship master and Managing Company to agree the most
  appropriate port of call. If port stay long enough, instruments fixed and returned to the vessel.
  Otherwise pre-calibrated instruments (same type, new or second hand, depending on availability),
  certified and in perfect working condition, sent to the NEXT port of call (if time and port permit)
  as a replacement. On arrival the master checks operability, informs Prime + Managing Company and
  hands back the inoperable one(s).
- Managing Company's employees must not attempt adjustments/repairs without Prime's service dept
  guidance; prohibited from assigning use of products to third parties without written consent.
- Loss or Damage: if attributed to operator's fault, Prime may request the relative replacement value.
- Contract interruption BEFORE completion of 3 years → two options:
  1. Managing Company transfers instruments to another vessel and continues paying residual fee.
  2. Managing Company pays the residual total value of the agreed fee; after full settlement the
     instruments become Managing Company's property.
- Contract renewal: after the period, Managing Company may renew for another 3 years (notify
  reasonably in advance). *** If NO renewal takes place, all instruments become property of the
  Managing Company without any extra fee. ***

### Section 5 — Disputes / Law
Good-faith amicable resolution; governed by Greek Law; courts of Piraeus.

### VESSELS UNDER AGREEMENT — ANNEX 1
Table with a single vessel: "CHA CHA CHA"
Agreed on July 2, 2026. Signed: SPRING MARINE MANAGEMENT SA (Capt. Kouvakis Nikolaos,
Vetting/HSQE Manager - DPA) and PRIME PRODUCTS LTD (company stamp, Piraeus).
Page 8 is blank.

## Consequences for the data model (confirmed by the real contract)
1. Contract → many vessels (Annex 1). Per-vessel: equipment SET + own activation date +
   own instalment schedule. The transfer-to-another-vessel option means an asset must be able
   to move between vessels while keeping history.
2. Equipment nature is threefold, exactly as ops_contract_library models it:
   - Asset (serial + certificate, individually tracked) e.g. GX-3R, GX-6100
   - Consumable with ANNUAL quota (calibration cylinders 4+2 per year) or CONTRACT-LIFE quota
     (detector tubes 100 pkt / 3 years)
   - Service (warranty, monitoring, certification, exchange, training)
3. Certificate expiry is the operational heartbeat: reminder 2 months (60 days) before, second at
   15 days, to both customer and vessel; annual cylinder shipment planned around the same date,
   to a port whose closest airport accepts dangerous cargo.
4. End-of-contract ownership transfer is a real state that must be recorded (renewed vs
   not renewed → instruments become customer property).

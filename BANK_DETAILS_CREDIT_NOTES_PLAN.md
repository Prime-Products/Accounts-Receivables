# Σχέδιο Υλοποίησης: Τραπεζικές Λεπτομέρειες, Wire Transfers, Πιστοτικά Τιμολόγια & Συμφυρισμός

Ένα πλήρες σχέδιο για να προσθέσουμε τις λειτουργίες που λείπουν: ευάσματα πελατών, wire transfers, πιστοτικά τιμολόγια, και συμφυρισμό τιμολογίων.

---

## 1. Τι Θέλετε να Κάνετε (Σαφοποίηση)

### A. Ευάσματα Πελατών (Bank Details)
Κάθε πελάτης έχει τραπεζικές λεπτομέρειες για να του στέλνετε τιμολόγια και να λαμβάνετε πληρωμές:
- IBAN / Account Number
- Bank Name
- Swift Code
- Beneficiary Name

### B. Wire Transfers (Προχώρητες Πληρωμές)
Πληρωμές που **ο πελάτης σας ενημερώνει ότι έστειλε** (π.χ. "Έστειλα €10.000 στις 25/7"):
- Ημερομηνία αποστολής
- Ποσό
- Bank reference / Transaction ID
- Status: "Pending" (περιμένουμε να εμφανιστεί στον λογαριασμό) → "Received" (ήρθε)

### C. Πιστοτικά Τιμολόγια (Credit Notes)
Όταν πρέπει να επιστρέψετε χρήματα ή να κάνετε έκπτωση:
- Δημιουργία νέου τιμολογίου με **αρνητικό ποσό** (π.χ. -€500)
- Αυτόματα μειώνει το ανοιχτό υπόλοιπο του πελάτη
- Παρακολούθηση: ποιο αρχικό τιμολόγιο αφορά

### D. Συμφυρισμός Τιμολογίων (Netting)
Όταν έχετε πολλά τιμολόγια από τον ίδιο πελάτη, **συνδυάζετε τα ανοιχτά σε ένα**:
- Παράδειγμα: Πελάτης οφείλει €1.000 + €500 + €200 = €1.700
- Δημιουργείτε ένα **νέο τιμολόγιο €1.700** και κλείνετε τα παλιά
- Ή: Δημιουργείτε ένα "Netting Invoice" που δείχνει ότι τα παλιά έχουν συγχωνευθεί

---

## 2. Αρχιτεκτονική Λύσης

### 2.1 Νέοι Πίνακες Βάσης

#### Πίνακας 1: `payment_bank_details`
Τραπεζικές λεπτομέρειες ανά πελάτη:

```sql
CREATE TABLE payment_bank_details (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customerId INT NOT NULL UNIQUE,
  
  -- Κύρια λεπτομέρεια
  iban VARCHAR(34),
  accountNumber VARCHAR(64),
  bankName VARCHAR(255),
  swiftCode VARCHAR(11),
  beneficiaryName VARCHAR(255),
  
  -- Εναλλακτικές λεπτομέρειες (π.χ. διαφορετικό λογαριασμό ανά νόμισμα)
  currency VARCHAR(8) DEFAULT 'EUR',
  isDefault INT DEFAULT 1,
  
  -- Audit trail
  createdBy INT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedBy INT,
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
);
```

**Drizzle Schema:**
```typescript
export const paymentBankDetails = mysqlTable("payment_bank_details", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull().unique(),
  iban: varchar("iban", { length: 34 }),
  accountNumber: varchar("accountNumber", { length: 64 }),
  bankName: varchar("bankName", { length: 255 }),
  swiftCode: varchar("swiftCode", { length: 11 }),
  beneficiaryName: varchar("beneficiaryName", { length: 255 }),
  currency: varchar("currency", { length: 8 }).default("EUR").notNull(),
  isDefault: int("isDefault").default(1).notNull(),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_bank_details_customerId").on(t.customerId),
]);
```

---

#### Πίνακας 2: `wire_transfers`
Προχώρητες πληρωμές που ο πελάτης ενημερώνει:

```sql
CREATE TABLE wire_transfers (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customerId INT NOT NULL,
  
  -- Λεπτομέρειες wire
  amount DECIMAL(14,2) NOT NULL,
  sentDate BIGINT NOT NULL,  -- Ημερομηνία που έστειλε ο πελάτης
  
  -- Status
  status ENUM('Pending', 'Received', 'Cancelled') DEFAULT 'Pending',
  
  -- Reconciliation
  bankReference VARCHAR(255),  -- Transaction ID από τράπεζα
  receivedDate BIGINT,  -- Ημερομηνία που ήρθε στον λογαριασμό
  
  -- Σχέση με receipt (αν ταιριάξει)
  receiptId INT,  -- Όταν ο wire ταιριάξει με receipt, link εδώ
  
  -- Audit
  notes TEXT,
  createdBy INT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
);
```

**Drizzle Schema:**
```typescript
export const wireTransfers = mysqlTable("wire_transfers", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  sentDate: bigint("sentDate", { mode: "number" }).notNull(),
  status: mysqlEnum("status", ["Pending", "Received", "Cancelled"]).default("Pending").notNull(),
  bankReference: varchar("bankReference", { length: 255 }),
  receivedDate: bigint("receivedDate", { mode: "number" }),
  receiptId: int("receiptId"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_wire_customerId").on(t.customerId),
  index("idx_wire_status").on(t.status),
]);
```

---

#### Πίνακας 3: `credit_notes`
Πιστοτικά τιμολόγια (αρνητικά τιμολόγια):

```sql
CREATE TABLE credit_notes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customerId INT NOT NULL,
  
  -- Βασικές λεπτομέρειες
  creditNoteNumber VARCHAR(64) NOT NULL UNIQUE,
  amount DECIMAL(14,2) NOT NULL,  -- Πάντα θετικό (το σύστημα το κάνει αρνητικό)
  issueDate BIGINT NOT NULL,
  
  -- Σχέση με αρχικό τιμολόγιο
  relatedInvoiceId INT,  -- Ποιο τιμολόγιο αφορά
  reason VARCHAR(255),  -- π.χ. "Return", "Discount", "Correction"
  
  -- Status
  status ENUM('Open', 'Applied', 'Cancelled') DEFAULT 'Open',
  appliedToInvoiceId INT,  -- Ποιο τιμολόγιο εφαρμόστηκε
  
  -- Audit
  notes TEXT,
  createdBy INT,
  createdAt TIMESTAMP DEFAULT NOW(),
  updatedAt TIMESTAMP DEFAULT NOW() ON UPDATE NOW()
);
```

**Drizzle Schema:**
```typescript
export const creditNotes = mysqlTable("credit_notes", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  creditNoteNumber: varchar("creditNoteNumber", { length: 64 }).notNull().unique(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  issueDate: bigint("issueDate", { mode: "number" }).notNull(),
  relatedInvoiceId: int("relatedInvoiceId"),
  reason: varchar("reason", { length: 255 }),
  status: mysqlEnum("status", ["Open", "Applied", "Cancelled"]).default("Open").notNull(),
  appliedToInvoiceId: int("appliedToInvoiceId"),
  notes: text("notes"),
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, t => [
  index("idx_credit_notes_customerId").on(t.customerId),
  index("idx_credit_notes_status").on(t.status),
]);
```

---

#### Πίνακας 4: `netting_invoices`
Συμφυρισμένα τιμολόγια (προαιρετικό — μπορεί να αποθηκευτεί ως σχόλιο):

```sql
CREATE TABLE netting_invoices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  customerId INT NOT NULL,
  
  -- Νέο τιμολόγιο
  nettingInvoiceId INT NOT NULL,  -- Link στο νέο τιμολόγιο
  
  -- Παλιά τιμολόγια που συγχωνεύθηκαν
  sourceInvoiceIds JSON,  -- [1001, 1002, 1003]
  
  -- Audit
  createdBy INT,
  createdAt TIMESTAMP DEFAULT NOW()
);
```

**Drizzle Schema:**
```typescript
export const nettingInvoices = mysqlTable("netting_invoices", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),
  nettingInvoiceId: int("nettingInvoiceId").notNull(),
  sourceInvoiceIds: text("sourceInvoiceIds").notNull(), // JSON string
  createdBy: int("createdBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, t => [
  index("idx_netting_customerId").on(t.customerId),
]);
```

---

### 2.2 Αλλαγές σε Υπάρχοντες Πίνακες

#### `invoices` table — Προσθέστε πεδία

```typescript
export const invoices = mysqlTable("invoices", {
  // ... υπάρχοντα πεδία
  
  // Νέα πεδία
  invoiceType: mysqlEnum("invoiceType", ["Standard", "Credit Note", "Netting"]).default("Standard").notNull(),
  relatedCreditNoteId: int("relatedCreditNoteId"),  // Αν είναι credit note
  isNettingInvoice: int("isNettingInvoice").default(0).notNull(),  // Αν είναι netting
  
  // ... υπόλοιπα πεδία
}, t => [
  // ... υπάρχοντα indexes
  index("idx_invoices_type").on(t.invoiceType),
]);
```

---

## 3. Ροή Εργασίας

### Σενάριο 1: Καταχώρηση Ευασμάτων Πελάτη

**Πού:** Customer 360 card → "Bank Details" tab

```
┌─────────────────────────────────────────┐
│ 💳 Τραπεζικές Λεπτομέρειες              │
├─────────────────────────────────────────┤
│ IBAN: GR1234567890...                   │
│ Bank: Eurobank                          │
│ Swift: ERBKGRAA                         │
│ Beneficiary: ACME Inc                  │
│                                         │
│ [Edit] [Add Alternative]                │
└─────────────────────────────────────────┘
```

**Backend:**
- Procedure: `customers.updateBankDetails`
- Αποθηκεύει στον πίνακα `payment_bank_details`
- Audit log: "Bank details updated for customer X"

---

### Σενάριο 2: Καταχώρηση Wire Transfer

**Πού:** Customers page → Customer card → "Wire Transfers" tab

```
┌─────────────────────────────────────────┐
│ 📤 Προχώρητες Πληρωμές (Wire Transfers) │
├─────────────────────────────────────────┤
│ Ημερομηνία αποστολής: 25/7/2026         │
│ Ποσό: €10.000                           │
│ Bank Reference: TXN-123456              │
│ Status: Pending                         │
│ Σημειώσεις: Sent from their account...  │
│                                         │
│ [Save] [Cancel]                         │
└─────────────────────────────────────────┘
```

**Backend:**
- Procedure: `customers.addWireTransfer`
- Αποθηκεύει στον πίνακα `wire_transfers` με status "Pending"
- Activity log: "Wire transfer €10.000 recorded (Pending)"

**Reconciliation (αργότερα):**
- Όταν ήρθε η πληρωμή στον λογαριασμό:
  - Procedure: `customers.markWireTransferReceived`
  - Status → "Received"
  - Προαιρετικά: Auto-link με receipt αν το ποσό ταιριάζει

---

### Σενάριο 3: Δημιουργία Πιστοτικού Τιμολογίου

**Πού:** Invoices page → "New Credit Note" button

```
┌─────────────────────────────────────────┐
│ 📋 Δημιουργία Πιστοτικού Τιμολογίου     │
├─────────────────────────────────────────┤
│ Πελάτης: ACME Inc                       │
│ Ποσό: €500                              │
│ Λόγος: [Return ▼]                       │
│ Σχετικό τιμολόγιο: INV-001 (προαιρ.)   │
│ Ημερομηνία: 26/7/2026                   │
│ Σημειώσεις: Returned goods              │
│                                         │
│ [Create] [Cancel]                       │
└─────────────────────────────────────────┘
```

**Backend:**
- Procedure: `invoices.createCreditNote`
- Δημιουργεί νέο record στον πίνακα `credit_notes`
- Δημιουργεί αντίστοιχο invoice με `invoiceType = "Credit Note"` και `amount = -€500`
- Activity log: "Credit note CN-001 created for €500"

**Εμφάνιση:**
- Στο Invoices list: εμφανίζεται με κόκκινο χρώμα (αρνητικό ποσό)
- Στο Aging report: **αφαιρείται** από το ανοιχτό υπόλοιπο

---

### Σενάριο 4: Συμφυρισμός Τιμολογίων

**Πού:** Customer card → "Actions" → "Net Invoices"

```
┌─────────────────────────────────────────┐
│ 🔗 Συμφυρισμός Τιμολογίων               │
├─────────────────────────────────────────┤
│ Πελάτης: ACME Inc                       │
│ Ανοιχτά τιμολόγια:                      │
│ ☑ INV-001: €1.000 (due 30/6)           │
│ ☑ INV-002: €500 (due 15/7)             │
│ ☑ INV-003: €200 (due 25/7)             │
│                                         │
│ Σύνολο: €1.700                          │
│                                         │
│ Δημιουργία νέου τιμολογίου €1.700       │
│ και κλείσιμο των παλιών                 │
│                                         │
│ [Confirm] [Cancel]                      │
└─────────────────────────────────────────┘
```

**Backend:**
- Procedure: `invoices.netInvoices`
- Δημιουργεί νέο invoice με `isNettingInvoice = 1` και ποσό = άθροισμα
- Κλείνει τα παλιά τιμολόγια με status "Paid" (ή "Netting")
- Αποθηκεύει τη σχέση στον πίνακα `netting_invoices`
- Activity log: "Invoices INV-001, INV-002, INV-003 netted into NET-001 (€1.700)"

---

## 4. UI/UX Αλλαγές

### 4.1 Customer 360 Card — Νέες Καρτέλες

```
[Overview] [Invoices] [Bank Details] [Wire Transfers] [Credit Notes] [History]
```

### 4.2 Invoices List — Νέες Στήλες

| Invoice # | Customer | Amount | Type | Status | Due Date |
|---|---|---|---|---|---|
| INV-001 | ACME | €1.000 | Standard | Open | 30/6 |
| CN-001 | ACME | -€500 | Credit Note | Open | 26/7 |
| NET-001 | ACME | €1.700 | Netting | Open | 27/7 |

**Χρώματα:**
- Standard: Μαύρο
- Credit Note: Κόκκινο (αρνητικό)
- Netting: Μπλε (ειδικό)

### 4.3 Dashboard — Νέα KPI

Προσθέστε:
- **Pending Wire Transfers:** €X (ποσό που περιμένουμε)
- **Open Credit Notes:** €X (ποσό που θα αφαιρεθεί)

---

## 5. Λογική Υπολογισμών

### Ανοιχτό Υπόλοιπο (Open Balance)

```
Open Balance = SUM(invoices.amount WHERE status IN ['Open', 'Partially Paid'])
             - SUM(credit_notes.amount WHERE status IN ['Open', 'Applied'])
             - SUM(wire_transfers.amount WHERE status = 'Received')
```

### Aging Report

```
Overdue = SUM(invoices.amount WHERE dueDate < TODAY AND status NOT IN ['Paid'])
        - SUM(credit_notes.amount WHERE status = 'Open')
        - SUM(wire_transfers.amount WHERE status = 'Pending' AND sentDate < TODAY)
```

### Forecast Expected Collection

```
Expected = Open Balance
         - SUM(wire_transfers.amount WHERE status = 'Pending')  // Αφαιρούμε τα pending
         + SUM(wire_transfers.amount WHERE status = 'Received')  // Προσθέτουμε τα received
```

---

## 6. Reconciliation Workflow

### Αυτόματη Σύνδεση Wire Transfer ↔ Receipt

```
1. Χρήστης καταχωρεί wire transfer: €10.000 (25/7)
2. Χρήστης καταχωρεί receipt: €10.000 (27/7)
3. Σύστημα ελέγχει: Amount match + Customer match
4. Αν ταιριάζει: Auto-link wire.receiptId = receipt.id
5. Wire status → "Received"
6. Activity log: "Wire transfer matched with receipt"
```

---

## 7. Reports & Exports

### Νέα Reports

1. **Wire Transfer Reconciliation Report**
   - Pending wire transfers (ημερομηνία αποστολής > 5 ημέρες)
   - Received wire transfers (ταιριάζουν με receipts)
   - Unmatched wire transfers (δεν βρέθηκε receipt)

2. **Credit Notes Report**
   - Open credit notes (δεν εφαρμόστηκαν ακόμα)
   - Applied credit notes (εφαρμόστηκαν σε τιμολόγιο)
   - Total credit notes per customer

3. **Netting History**
   - Ποιες ημερομηνίες έγιναν netting
   - Ποια τιμολόγια συγχωνεύθηκαν
   - Ποιος το έκανε

---

## 8. Audit Trail & Compliance

Όλες οι ενέργειες καταγράφονται:

```
Activity Log:
- "Bank details updated for ACME Inc" (user: John, date: 26/7 10:30)
- "Wire transfer €10.000 recorded" (user: John, date: 26/7 11:00)
- "Wire transfer marked as received" (user: Jane, date: 27/7 09:15)
- "Credit note CN-001 created for €500" (user: John, date: 26/7 14:00)
- "Invoices INV-001, INV-002 netted" (user: Jane, date: 27/7 10:00)
```

---

## 9. Implementation Phases

### Phase 1: Bank Details (1 ώρα)
- [ ] Δημιουργία πίνακα `payment_bank_details`
- [ ] UI: Customer card → "Bank Details" tab
- [ ] Procedure: `customers.updateBankDetails`

### Phase 2: Wire Transfers (2 ώρες)
- [ ] Δημιουργία πίνακα `wire_transfers`
- [ ] UI: "Wire Transfers" tab
- [ ] Procedure: `customers.addWireTransfer`, `markWireTransferReceived`
- [ ] Auto-reconciliation logic

### Phase 3: Credit Notes (2 ώρες)
- [ ] Δημιουργία πίνακα `credit_notes`
- [ ] Αλλαγές στον πίνακα `invoices` (invoiceType, relatedCreditNoteId)
- [ ] UI: "New Credit Note" button
- [ ] Procedure: `invoices.createCreditNote`
- [ ] Ενημέρωση aging/balance calculations

### Phase 4: Netting (2 ώρες)
- [ ] Δημιουργία πίνακα `netting_invoices`
- [ ] UI: "Net Invoices" action
- [ ] Procedure: `invoices.netInvoices`
- [ ] Ενημέρωση activity log

### Phase 5: Reports & Dashboard (2 ώρες)
- [ ] Wire Transfer Reconciliation Report
- [ ] Credit Notes Report
- [ ] Dashboard KPI updates
- [ ] Netting History

---

## 10. Ερωτήσεις για Διευκρίνηση

Πριν ξεκινήσουμε, ερωτήσεις:

1. **Wire Transfers:** Όταν ο πελάτης λέει "έστειλα €10.000", θέλετε να δημιουργηθεί αυτόματα ένα receipt ή να περιμένει να το επιβεβαιώσετε;

2. **Credit Notes:** Όταν δημιουργείτε πιστωτικό τιμολόγιο, θέλετε να εφαρμοστεί αυτόματα στο αρχικό τιμολόγιο ή να επιλέξετε χειροκίνητα;

3. **Netting:** Πόσο συχνά κάνετε netting; Θέλετε αυτόματη πρόταση ή χειροκίνητη ενέργεια;

4. **Softone Sync:** Πρέπει αυτά τα δεδομένα να συγχρονίζονται με το Softone ή να παραμένουν μόνο στο AR Pro;

---

## Συμπέρασμα

Αυτό το σχέδιο καλύπτει:
- ✅ Αποθήκευση ευασμάτων πελατών
- ✅ Παρακολούθηση wire transfers (pending → received)
- ✅ Δημιουργία πιστοτικών τιμολογίων
- ✅ Συμφυρισμός τιμολογίων
- ✅ Ενημέρωση όλων των υπολογισμών (balance, aging, forecast)
- ✅ Audit trail για compliance

**Συνολικός χρόνος υλοποίησης:** 8-10 ώρες (σε 5 phases)

Πείτε μου αν θέλετε να ξεκινήσουμε με κάποια phase ή αν έχετε ερωτήσεις.

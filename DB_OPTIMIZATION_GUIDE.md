# Βέλτιστες Πρακτικές Βελτιστοποίησης Βάσης Δεδομένων — AR Pro

Ένα πρακτικό guide για τη βελτιστοποίηση της απόδοσης της βάσης δεδομένων, προσαρμοσμένο στη δική σας εφαρμογή.

---

## 1. Indexes — Το πρώτο και πιο σημαντικό βήμα

### Τι να indexάρετε

Προσθέστε indexes στις στήλες που **συχνά χρησιμοποιούνται σε WHERE, JOIN, ORDER BY**:

| Πίνακας | Στήλες | Λόγος |
|---|---|---|
| `invoices` | `customerId`, `dueDate`, `status` | Φίλτρα, aging, λίστες |
| `tasks` | `customerId`, `dueDate`, `status` | Εκκρεμά tasks, follow-ups |
| `promises_to_pay` | `customerId`, `status`, `promisedDate` | Ανοιχτές υποσχέσεις ανά ομάδα |
| `receipts` | `customerId`, `receiptDate` | Ιστορικό πληρωμών |
| `activity_log` | `groupName`, `customerId` | Φίλτρα δραστηριότητας |
| `forecast_entries` | `year`, `month`, `customerId` | Αναζήτηση forecast |

### Σύνθετα indexes (composite indexes)

Για ερωτήματα που φιλτράρουν σε πολλές στήλες, δημιουργήστε σύνθετα indexes:

```sql
-- Παράδειγμα: Invoices με status Open και dueDate πριν από σήμερα
CREATE INDEX idx_invoices_status_dueDate ON invoices(status, dueDate);

-- Forecast: ψάχνουμε συχνά ανά (year, month)
CREATE INDEX idx_forecast_year_month ON forecast_entries(year, month);
```

### Πώς να τα εφαρμόσετε

1. Ενημερώστε το `drizzle/schema.ts` με τις δηλώσεις indexes
2. Τρέξτε `pnpm drizzle-kit generate`
3. Εφαρμόστε το migration SQL μέσω `webdev_execute_sql`

---

## 2. Query Optimization — Γράψτε έξυπνα ερωτήματα

### ❌ Αντιπαραδείγματα (κακό)

```typescript
// Κακό: N+1 queries — ένα ερώτημα ανά πελάτη
const customers = await db.listCustomers();
for (const c of customers) {
  const invoices = await db.query.invoices.findMany({ where: eq(invoices.customerId, c.id) });
  // ...
}

// Κακό: Φέρνει όλες τις στήλες, ακόμα κι αν χρειάζεστε 2
const allInvoices = await db.select().from(invoices);
const totals = allInvoices.map(i => i.amount).reduce((a, b) => a + b, 0);
```

### ✅ Σωστά παραδείγματα (καλό)

```typescript
// Καλό: Ένα JOIN ερώτημα αντί για N+1
const invoicesWithCustomers = await db
  .select({ invoiceId: invoices.id, customerName: customers.name, amount: invoices.amount })
  .from(invoices)
  .innerJoin(customers, eq(invoices.customerId, customers.id))
  .where(eq(invoices.status, "Open"));

// Καλό: Υπολογισμός στη βάση, όχι στον κώδικα
const totals = await db
  .select({ total: sql`SUM(amount)` })
  .from(invoices)
  .where(eq(invoices.status, "Open"));
```

### Κανόνες

- **Φέρνετε μόνο τις στήλες που χρειάζεστε** — χρησιμοποιήστε `.select({ col1, col2 })` αντί για `select()`
- **Υπολογίστε στη βάση, όχι στον κώδικα** — `SUM()`, `COUNT()`, `GROUP BY` είναι πολύ πιο γρήγορα
- **Αποφύγετε N+1 queries** — χρησιμοποιήστε JOINs ή batch queries
- **Χρησιμοποιήστε LIMIT όταν ψάχνετε λίστες** — μην φέρνετε 5.000 γραμμές αν χρειάζεστε 20

---

## 3. Denormalization — Αποθηκεύστε υπολογισμένα πεδία

Για ερωτήματα που τρέχουν **πολύ συχνά** και είναι **ακριβά**, αποθηκεύστε το αποτέλεσμα:

| Περίπτωση | Λύση |
|---|---|
| Το Dashboard υπολογίζει DSO (Days Sales Outstanding) κάθε φορά | Αποθηκεύστε το DSO στη στήλη `customers.dso` και ενημερώστε το μηνιαίως |
| Το Forecast χρειάζεται το άθροισμα ανοιχτών τιμολογίων ανά ομάδα | Αποθηκεύστε το `forecastEntries.dueAmount` αντί να το υπολογίζετε κάθε φορά |
| Η κάρτα πελάτη δείχνει το credit rating — υπολογίζεται από πολλές στήλες | Αποθηκεύστε το rating στη `customers.creditRating` |

**Προσοχή:** Η denormalization δημιουργεί πολυπλοκότητα — χρησιμοποιήστε την μόνο όταν το κέρδος είναι σαφές.

---

## 4. Partitioning — Χωρίστε τα δεδομένα

Για πίνακες που μεγαλώνουν πολύ (π.χ. `activity_log`, `audit_logs`), χωρίστε τα δεδομένα κατά μήνα:

```sql
-- Δημιουργήστε ξεχωριστούς πίνακες ανά μήνα (ή χρησιμοποιήστε MySQL partitioning)
CREATE TABLE activity_log_2026_07 LIKE activity_log;
CREATE TABLE activity_log_2026_08 LIKE activity_log;

-- Τα παλιά δεδομένα μπορούν να αρχειοθετηθούν ή να διαγραφούν
```

**Πότε:** Όταν ο πίνακας ξεπεράσει τα 1-2 εκατομμύρια γραμμές.

---

## 5. Connection Pooling — Διαχείριση συνδέσεων

Η εφαρμογή σας χρησιμοποιεί ήδη connection pooling (Drizzle + MySQL driver). Βεβαιωθείτε ότι:

- Το `maxConnections` είναι κατάλληλο για το φορτίο σας (default: 10, συνήθως αρκεί)
- Κλείνετε τις συνδέσεις σωστά (το Drizzle το κάνει αυτόματα)

---

## 6. Caching — Αποθηκεύστε αποτελέσματα ερωτημάτων

### Πότε να χρησιμοποιήσετε caching

| Δεδομένα | TTL | Λόγος |
|---|---|---|
| Dashboard KPIs | 5 λεπτά | Υπολογίζονται ακριβά, δεν χρειάζονται real-time |
| Λίστα πελατών (για dropdowns) | 1 ώρα | Σπάνια αλλάζουν |
| Forecast entries | 10 λεπτά | Ο χρήστης μπορεί να τα προσαρμόσει, αλλά ανάγνωση συχνή |
| Activity log | Χωρίς cache | Πρέπει να είναι πάντα φρέσκα |

### Υλοποίηση (απλή)

```typescript
// Χρησιμοποιήστε in-memory cache (π.χ., Node.js Map ή Redis)
const kpiCache = new Map<string, { data: any; expiresAt: number }>();

function getCachedKPIs(key: string) {
  const cached = kpiCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data; // Επιστρέψτε cached
  }
  return null; // Cache miss
}

function setCachedKPIs(key: string, data: any, ttlMs: number) {
  kpiCache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// Στο router:
dashboard: protectedProcedure.query(async () => {
  const cached = getCachedKPIs("dashboard-kpis");
  if (cached) return cached;

  const kpis = await computeKPIs(); // Ακριβό ερώτημα
  setCachedKPIs("dashboard-kpis", kpis, 5 * 60 * 1000); // 5 λεπτά
  return kpis;
}),
```

---

## 7. Monitoring — Ανιχνεύστε αργά ερωτήματα

### Ενεργοποιήστε slow query log

```sql
-- Ρυθμίστε το MySQL να καταγράφει ερωτήματα που διαρκούν > 1 δευτερόλεπτο
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;
```

### Χρησιμοποιήστε EXPLAIN

```sql
-- Δείτε πώς ο MySQL εκτελεί ένα ερώτημα
EXPLAIN SELECT * FROM invoices WHERE customerId = 5 AND status = 'Open';

-- Αν δεν χρησιμοποιεί index, προσθέστε ένα
```

---

## 8. Archiving — Καθαρίστε παλιά δεδομένα

Τα δεδομένα που δεν χρειάζεστε συχνά (π.χ. activity log από 6 μήνες πριν) μπορούν να αρχειοθετηθούν:

```sql
-- Μηνιαία: μετακινήστε τα παλιά activity logs σε archive table
INSERT INTO activity_log_archive SELECT * FROM activity_log WHERE createdAt < DATE_SUB(NOW(), INTERVAL 6 MONTH);
DELETE FROM activity_log WHERE createdAt < DATE_SUB(NOW(), INTERVAL 6 MONTH);
```

---

## 9. Normalization vs Denormalization — Το ισοζύγιο

| Κανόνας | Εφαρμογή σας |
|---|---|
| **Αποφύγετε περιττές στήλες** | ✅ Το schema σας είναι καθαρό |
| **Αποφύγετε N+1 queries** | ⚠️ Προσοχή στο activity log — χρησιμοποιήστε JOINs |
| **Denormalize μόνο αν χρειάζεται** | ✅ Αποθηκεύστε `invoice.amountEur` για να αποφύγετε FX υπολογισμούς κάθε φορά |

---

## 10. Backup & Recovery — Δεν είναι optimization, αλλά είναι κρίσιμο

Βεβαιωθείτε ότι:

- Τα backups τρέχουν αυτόματα (Manus το κάνει)
- Έχετε δοκιμάσει restore (σημαντικό!)
- Ο audit trail σας είναι πλήρης (έχετε ήδη `audit_logs`)

---

## Checklist για τη δική σας εφαρμογή

- [ ] Προσθέστε indexes στα `invoices`, `tasks`, `promises_to_pay` (customerId, dueDate, status)
- [ ] Ελέγξτε τα ερωτήματα στο `server/db.ts` για N+1 patterns
- [ ] Αν το Dashboard αρχίσει να αργεί, προσθέστε 5-λεπτο cache στα KPIs
- [ ] Δημιουργήστε ένα μηνιαίο job που αρχειοθετεί παλιά activity logs (αν ξεπεράσουν τα 1M rows)
- [ ] Τρέξτε `EXPLAIN` σε τα πιο συχνά ερωτήματα και βεβαιωθείτε ότι χρησιμοποιούν indexes

---

## Ποια είναι η προτεραιότητα για εσάς τώρα;

1. **Indexes** — Προσθέστε τα τώρα (5 λεπτά, χωρίς κίνδυνο)
2. **Query optimization** — Ελέγξτε τα ερωτήματα (1 ώρα, καμία αλλαγή στη βάση)
3. **Caching** — Μόνο αν το Dashboard αργεί (δεν αργεί τώρα)
4. **Partitioning/Archiving** — Σε 6+ μήνες όταν τα δεδομένα μεγαλώσουν

Αν θέλετε, ξεκινάμε με τα indexes αμέσως.

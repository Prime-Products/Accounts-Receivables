# Accounts Receivables Hub — Deployment & SoftOne Runbook

Τελευταία ενημέρωση: 31 Ιουλίου 2026

Το παρόν αρχείο καταγράφει την εγκατάσταση του Accounts Receivables Hub, τη
διαδικασία deployment και τον ασφαλή, read-only συγχρονισμό με το SoftOne.
Δεν περιέχει πραγματικούς κωδικούς, connection strings ή άλλα production
secrets.

## 1. Υποδομή

- Production URL: `https://hub.primeproducts.gr`
- Plesk application directory:
  `/var/www/vhosts/primeproducts.gr/hub.primeproducts.gr`
- Plesk document root: `/hub.primeproducts.gr/dist/public`
- Plesk application root: `/hub.primeproducts.gr`
- Startup file: `dist/index.js`
- Node.js: έκδοση 22
- Package manager του project: `pnpm 10.4.1`
- Application database: MariaDB (`hub_prime`)
- Git repository που χρησιμοποιεί το Plesk:
  `https://github.com/Prime-Products/Accounts-Receivables.git`
- Production branch: `main`
- Αρχικό/upstream repository:
  `https://github.com/hovangr22/Accounts-Receivables.git`

Το repository της Prime Products είναι fork. Οι αλλαγές του αρχικού δημιουργού
εισάγονται ελεγχόμενα στο fork και δεν κάνουμε deploy απευθείας από το upstream.

## 2. Αρχιτεκτονική και ασφάλεια

- Η εφαρμογή διαβάζει δεδομένα SoftOne μέσω SQL Server και τα αντιγράφει στη
  MariaDB της εφαρμογής.
- Η σύνδεση προς SoftOne είναι read-only. Ο κώδικας δεν κάνει `INSERT`,
  `UPDATE` ή `DELETE` στη βάση SoftOne.
- Η εφαρμογή δεν εξυπηρετεί SQL από τον browser.
- Το login του Manus έχει απενεργοποιηθεί με `AUTH_DISABLED=true`.
- Η εξωτερική πρόσβαση προστατεύεται από Plesk Password-Protected Directory.
- Υπάρχει MariaDB advisory lock με όνομα
  `ar_pro:softone:read_only_sync`, ώστε να μην μπορούν δύο χρήστες ή scheduled
  jobs να τρέξουν συγχρονισμό ταυτόχρονα.
- Ποτέ δεν γράφουμε production credentials σε Git, screenshots ή σε αυτό το
  αρχείο.

## 3. Μεταβλητές περιβάλλοντος

Οι πραγματικές τιμές βρίσκονται στο Plesk Node.js configuration και/ή στο
production `.env`. Το ασφαλές template είναι το `.env.example`.

Απαραίτητες μεταβλητές:

```dotenv
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/hub_prime
AUTH_DISABLED=true

SOFTONE_SQL_SYNC_ENABLED=false
SOFTONE_SQL_INVOICE_SYNC_ENABLED=false
SOFTONE_SQL_SERVER=
SOFTONE_SQL_PORT=1433
SOFTONE_SQL_DATABASE=
SOFTONE_SQL_USER=
SOFTONE_SQL_PASSWORD=
SOFTONE_SQL_ENCRYPT=false
SOFTONE_SQL_TRUST_SERVER_CERTIFICATE=false
```

Οι δύο μεταβλητές `SOFTONE_*_ENABLED` μπορούν να παραμείνουν `false` μόνιμα
και να ενεργοποιούνται μόνο για τη συγκεκριμένη CLI εντολή με `dotenv -v`.
Το κουμπί χειροκίνητου συγχρονισμού στις Settings χρειάζεται να είναι
ενεργοποιημένες server-side και οι δύο δυνατότητες.

Προαιρετικές μεταβλητές:

```dotenv
SOFTONE_SQL_WATCHDOG_MS=45000
SOFTONE_SYNC_CHILD_IDLE_TIMEOUT_MS=90000
```

## 4. Πρώτη εγκατάσταση ή εγκατάσταση dependencies

Από το Plesk, στην καρτέλα **Run Node.js commands**:

```bash
npm exec --yes --package=pnpm@10.4.1 -- pnpm install --frozen-lockfile
```

Το native dependency `msnodesqlv8` μπορεί να χρειάζεται rebuild:

```bash
npm rebuild msnodesqlv8 --foreground-scripts
```

Το μήνυμα `Ignored build scripts: msnodesqlv8` δεν αγνοείται όταν το native
module δεν φορτώνει. Τότε εκτελούμε το παραπάνω rebuild.

## 5. Κανονική διαδικασία deployment

Όταν υπάρχει νέο, ελεγμένο commit στο δικό μας `main`:

1. Plesk → Git → **Pull now**
2. Plesk → Git → **Deploy now**
3. Εγκατάσταση dependencies, αν άλλαξε `package.json` ή `pnpm-lock.yaml`:

```bash
npm exec --yes --package=pnpm@10.4.1 -- pnpm install --frozen-lockfile
```

4. Migration μόνο όταν άλλαξε το database schema:

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -- pnpm run db:push
```

5. Production build:

```bash
npm exec --yes --package=pnpm@10.4.1 -- pnpm run build
```

6. Plesk Node.js → **Restart App**

Δεν εκτελούμε `db:push` σε κάθε deployment χωρίς λόγο. Πριν από σημαντική
migration ή cleanup παίρνουμε export/dump της `hub_prime`.

## 6. Έλεγχος σύνδεσης SoftOne

```bash
npm exec --yes --package=pnpm@10.4.1 -- pnpm run test:softone-sql
```

Αναμενόμενο αποτέλεσμα:

```text
SoftOne SQL connection succeeded.
```

Αυτό επιβεβαιώνει τη σύνδεση, όχι ότι όλα τα reporting queries ολοκληρώνονται.

## 7. Συγχρονισμός customers και groups

Χειροκίνητη CLI εντολή:

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_SQL_SYNC_ENABLED=true -- pnpm run sync:softone-customers
```

Ο συγχρονισμός φέρνει:

- πραγματικούς customers: `COMPANY=1`, `SODTYPE=13`, `ISACTIVE=1`
- μόνο customers που έχουν group
- group code και group name από `TRDGROUP`
- στοιχεία εταιρείας και customer-group membership
- επιλεγμένα customer financial στοιχεία
- εξαιρεί το internal group `TRDGROUP=473` (Prime Products)

Δεν πρέπει να ξεκινήσει δεύτερος συγχρονισμός όσο εκτελείται ο πρώτος.
Το σωστό μήνυμα σε δεύτερη προσπάθεια είναι:

```text
SoftOne synchronization is already running.
```

### Τρέχουσα αντιμετώπιση unixODBC

Στην production υποδομή εμφανίστηκε επανειλημμένα:

```text
[unixODBC][Driver Manager]Function sequence error
```

Παρατηρήθηκε ότι μία σύνδεση μπορεί να εκτελέσει επιτυχώς ένα result set και
να αποτύχει στο αμέσως επόμενο query. Για αυτό:

- ο customer sync τρέχει σε απομονωμένο child process,
- ο parent κρατά το advisory lock,
- υπάρχει idle watchdog,
- εμφανίζεται progress ανά customer page,
- κάθε SoftOne query χρησιμοποιεί νέα ODBC σύνδεση.

Η τελευταία αλλαγή βρίσκεται στο PR #49:
`fix: use fresh SoftOne connection per query`.
Μετά το merge/deploy του PR #49 ο συγχρονισμός θα είναι πιο αργός, αλλά δεν θα
επαναχρησιμοποιεί προβληματική ODBC session.

## 8. Συγχρονισμός open/unpaid invoices

Προαιρετικό diagnostic:

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -- pnpm run inspect:softone-invoices
```

Πραγματικός συγχρονισμός:

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_SQL_INVOICE_SYNC_ENABLED=true -- pnpm run sync:softone-invoices
```

Ο invoice sync πρέπει να εκτελείται αφού υπάρχουν οι αντίστοιχοι customers.
Τα open invoices προέρχονται από τα SoftOne reporting δεδομένα και
κανονικοποιούνται ανά `FINDOC`/`TRDR`. Οι aging buckets είναι:

- Current (not due)
- 0–30 days overdue
- 31–60 days overdue
- 61–90 days overdue
- 91–119 days overdue
- 120+ days overdue, δηλαδή περιλαμβάνει και ακριβώς 120 ημέρες

## 9. Πλήρης χειροκίνητος συγχρονισμός από την εφαρμογή

Στην εφαρμογή:

1. **Settings**
2. **SoftOne ERP Integration (Read-only SQL)**
3. Κουμπί χειροκίνητου συγχρονισμού

Το κουμπί συγχρονίζει πρώτα customers και μετά invoices. Αν άλλος χρήστης ή
scheduled task έχει ήδη ξεκινήσει συγχρονισμό, εμφανίζεται ενημέρωση και δεν
ξεκινά δεύτερη εκτέλεση.

## 10. Αυτόματος συγχρονισμός

Η εφαρμογή έχει ασφαλή χειροκίνητη λειτουργία, αλλά δεν πρέπει να θεωρείται ότι
υπάρχει αυτόματο schedule αν δεν είναι ορατό και ενεργό στο:

**Plesk → Scheduled Tasks**

Προτεινόμενη σειρά για scheduled jobs:

1. customers/groups
2. invoices, αφού ολοκληρωθούν οι customers

Δεν προγραμματίζουμε τις δύο εντολές την ίδια ώρα. Το advisory lock αποτρέπει
την παράλληλη εκτέλεση, αλλά η σωστή χρονική απόσταση παραμένει απαραίτητη.

## 11. Diagnostics για groups

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -- pnpm run inspect:softone-groups
```

Το diagnostic χρησιμοποιήθηκε για να ελεγχθεί η αντιστοίχιση customer και
group μέσω `TRDR`, `MASTERTRDR` και `TRDGROUP`.

## 12. Cleanup εργαλεία — μόνο με backup

Αυτές οι εντολές μεταβάλλουν τη MariaDB της εφαρμογής, όχι το SoftOne.
Εκτελούνται μόνο με πρόσφατο database dump.

### Αφαίρεση internal Prime Products group 473

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_INTERNAL_GROUP_CLEANUP_ENABLED=473 -- pnpm run cleanup:softone-internal-group
```

Το script σταματά χωρίς αλλαγές αν βρει operational dependencies, όπως tasks,
promises ή activity logs. Πρώτα διαχειριζόμαστε συνειδητά αυτές τις εγγραφές·
δεν παρακάμπτουμε αυθαίρετα την προστασία.

### Αφαίρεση μη επιλέξιμων SoftOne customers

```bash
npm exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_INVALID_CUSTOMER_CLEANUP_ENABLED=true -- pnpm run cleanup:softone-ineligible-customers
```

Αφαιρεί από την τοπική MariaDB SoftOne customers που δεν ανήκουν πλέον στο
εγκεκριμένο customer dataset. Σταματά αν υπάρχουν operational dependencies ή
μη-SoftOne invoices.

## 13. Έλεγχος advisory lock

Στο phpMyAdmin της `hub_prime`:

```sql
SELECT IS_USED_LOCK('ar_pro:softone:read_only_sync') AS lock_connection_id;
```

- `NULL`: δεν υπάρχει ενεργό MariaDB lock.
- αριθμός: υπάρχει σύνδεση που κρατά το lock.

Δεν εκτελούμε `RELEASE_LOCK()` τυφλά. Πρώτα ελέγχουμε αν υπάρχει πραγματικό
worker process και αν συνεχίζει να γράφει progress.

Σε Linux shell, η εντολή είναι case-sensitive:

```bash
ps -ef | grep -E 'sync-softone-customers|tsx|pnpm' | grep -v grep
```

Αν δεν υπάρχει process αλλά το UI επιμένει ότι τρέχει sync, ελέγχουμε το
advisory lock και κάνουμε restart την εφαρμογή. Δεν σκοτώνουμε PID χωρίς να
επιβεβαιώσουμε ποια διεργασία είναι.

## 14. Συνήθη προβλήματα

### `DATABASE_URL is required`

Οι Plesk custom environment variables δεν φορτώνονται απαραίτητα στις εντολές
του command runner. Χρησιμοποιούμε `dotenv -e .env` όπως στα παραδείγματα.

### `Missing script`

Το deployed code δεν περιλαμβάνει ακόμη το commit που πρόσθεσε το script:

1. Pull now
2. Deploy now
3. `pnpm install --frozen-lockfile`
4. επιβεβαίωση του `package.json`

### `Function sequence error`

Είναι πρόβλημα state του unixODBC/msnodesqlv8 result-set lifecycle. Καταγράφουμε
ακριβώς το τελευταίο:

```text
[SoftOne] Starting ...
[SoftOne] Completed ...
```

και το όνομα του query/page όπου απέτυχε. Από το PR #49 και μετά κάθε query
πρέπει να χρησιμοποιεί φρέσκια σύνδεση.

### Exit code `139`

Συνήθως σημαίνει native crash του ODBC driver. Δεν ξανατρέχουμε αμέσως πολλές
φορές. Κάνουμε restart, επιβεβαιώνουμε ότι δεν έμεινε worker/lock και
επανεκτελούμε μία φορά.

### Η εφαρμογή δείχνει παλιά δεδομένα μετά από επιτυχημένο sync

1. Hard refresh στον browser (`Ctrl+F5`)
2. Restart App στο Plesk
3. Έλεγχος ότι η εφαρμογή και η CLI εντολή χρησιμοποιούν το ίδιο
   `DATABASE_URL`
4. Έλεγχος των counts απευθείας στη `hub_prime`

## 15. Ελεγχόμενη εισαγωγή αλλαγών από upstream

Δεν πατάμε απλώς **Sync fork** και μετά deploy όταν το fork έχει δικές μας
αλλαγές. Η ασφαλής διαδικασία είναι:

1. Fetch του upstream.
2. Δημιουργία προσωρινού integration branch.
3. Merge των νέων upstream commits.
4. Επίλυση conflicts χωρίς να χαθούν:
   - Plesk authentication mode
   - MariaDB integration
   - SoftOne sync
   - exclusions/cleanup protections
   - manual sync lock
5. Build και tests.
6. Pull request προς το δικό μας `main`.
7. Merge μόνο μετά τον έλεγχο.
8. Plesk Pull/Deploy.

## 16. Γρήγορο checklist καθημερινής λειτουργίας

```text
[ ] Υπάρχει πρόσφατο backup πριν από migration/cleanup
[ ] Έγινε merge μόνο ελεγμένου PR στο Prime-Products fork
[ ] Plesk Pull now
[ ] Plesk Deploy now
[ ] pnpm install μόνο αν άλλαξαν dependencies
[ ] db:push μόνο αν άλλαξε schema
[ ] pnpm run build
[ ] Restart App
[ ] Έλεγχος SoftOne SQL connection
[ ] Customer sync
[ ] Invoice sync
[ ] Έλεγχος counts και ενός γνωστού group/invoice
```

## 17. Τρέχουσα εκκρεμότητα

Κατά την τελευταία production δοκιμή πριν το PR #49:

- customer pages 1–6 ολοκληρώθηκαν,
- η page 7 απέτυχε στο `active customer membership`,
- το σφάλμα ήταν unixODBC `Function sequence error`.

Το PR #49 αλλάζει τη στρατηγική σε μία φρέσκια ODBC σύνδεση ανά query. Μετά το
merge και deploy πρέπει να επαναληφθεί ο customer sync και να καταγραφεί το
τελικό αποτέλεσμα.


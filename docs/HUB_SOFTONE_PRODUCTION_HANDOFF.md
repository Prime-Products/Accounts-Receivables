# Accounts Receivables Hub — Production handoff και κανόνες υλοποίησης

Τελευταία ενημέρωση: 31 Ιουλίου 2026  
Production: `https://hub.primeproducts.gr`  
Manus reference: `https://ar-accounts-evjqbcnz.manus.space/`

Το παρόν είναι το βασικό handoff για το production Hub. Καταγράφει τις
αποφάσεις, τη λογική της ενσωμάτωσης SoftOne, τις αλλαγές που έχουν ήδη γίνει,
τη διαδικασία deployment και το συμφωνημένο UI/UX contract.

Δεν περιέχει κωδικούς, connection strings ή άλλα production secrets.

## 1. Βασικός στόχος

Το Hub πρέπει να συνδυάζει δύο πράγματα:

1. **Ίδια εφαρμογή με το Manus σε εμφάνιση και λειτουργία.**
2. **Πραγματικά production δεδομένα από το SoftOne**, αντί για τα ενδεικτικά
   Excel/import δεδομένα που χρησιμοποιούνται στο Manus.

Η διαφορά στα δεδομένα μεταξύ Manus και Hub είναι αναμενόμενη. Διαφορά στη
δομή της οθόνης, στα dialogs, στα κουμπιά, στα ενδιάμεσα βήματα ενός workflow ή
στη συμπεριφορά τους δεν είναι επιθυμητή.

## 2. Source of truth και repositories

- Upstream/Manus repository:
  `https://github.com/hovangr22/Accounts-Receivables.git`
- Production fork:
  `https://github.com/Prime-Products/Accounts-Receivables.git`
- Production branch: `main`
- Plesk application directory:
  `/var/www/vhosts/primeproducts.gr/hub.primeproducts.gr`
- Startup file: `dist/index.js`
- Node.js: 22
- Package manager: `pnpm 10.4.1`
- Application database: MariaDB

Το Manus repository είναι source of truth για UI/UX και business workflows.
Το production fork είναι source of truth για deployment και για τους adapters
SoftOne/MariaDB.

Οι upstream αλλαγές δεν γίνονται deploy απευθείας. Εισάγονται σε integration
branch, ελέγχονται ώστε να μη χαθεί η production προσαρμογή και περνούν με PR
στο `Prime-Products/Accounts-Receivables:main`.

## 3. UI/UX contract: 100% parity με Manus

Για κάθε νέα upstream αλλαγή πρέπει να διατηρούνται ίδια:

- layout, spacing, typography, χρώματα και responsive συμπεριφορά,
- labels, badges, icons, tooltips και empty/loading/error states,
- σειρά και ορατότητα πεδίων,
- drawers, dialogs, popups και το μέγεθος/scroll τους,
- click targets και navigation/filter query parameters,
- όλα τα ενδιάμεσα βήματα ενός workflow,
- validation, confirmations και success/error feedback,
- generated PDF/Excel structure και filenames.

Δεν αρκεί να καταλήγει ένα workflow στο ίδιο τελικό status. Πρέπει να έχει και
την ίδια διαδρομή. Παράδειγμα: σε Promise-to-Pay task, το **Broken** δεν πρέπει
να αλλάζει αμέσως το status αν στο Manus πρώτα εμφανίζει επιλογές
`Reschedule Promise`, `Pending Follow-up` και `Escalate`.

### Επιτρεπτές αποκλίσεις

Επιτρέπονται μόνο αποκλίσεις που απαιτούνται από το production περιβάλλον:

- authentication/Plesk hosting,
- MariaDB persistence,
- read-only SoftOne data adapters,
- production safety flags, locks και diagnostics,
- διαφορετικά counts/ποσά, επειδή προέρχονται από πραγματικό SoftOne.

Οι αποκλίσεις αυτές δεν πρέπει να αλλάζουν το ορατό workflow του χρήστη.

### Έλεγχος parity μετά από upstream merge

Ελέγχονται side-by-side τουλάχιστον:

1. Dashboard και όλα τα clickable KPI/action cards.
2. Customers Groups/Companies, sorting και filters.
3. Group/Customer card και confirmation/task dialogs.
4. Log Call, Promise-to-Pay, Broken, Reschedule, Escalate και comments.
5. Invoices, Vessels, Contracts, Tasks, Contacts και Wire Transfers.
6. SOA PDF/Excel και filenames.

## 4. Branding και SOA PDF

Εταιρικά χρώματα:

- μπλε: `#1e2f46`
- κόκκινο: `#d52f39`

Το SOA PDF έχει προσαρμοστεί ώστε να ακολουθεί τη δομή του Manus:

- company και statement header,
- date/payment terms,
- total amounts summary,
- analysis ανά Prime branch,
- σωστές στήλες και ευθυγραμμίσεις,
- Unicode fonts,
- αποφυγή σύγκρουσης γραμμών και wrapped company names,
- filename ανά εταιρεία/group, αντί για γενικό `soa-group-...`.

Οι αλλαγές έγιναν στα PR #56–#61. Μελλοντικές upstream αλλαγές στο SOA πρέπει
να συγκρίνονται οπτικά με το Manus χωρίς να χαθεί η production Unicode και
branding υποστήριξη.

## 5. Αρχιτεκτονική δεδομένων και ασφάλεια SoftOne

Η ροή είναι μονόδρομη:

```text
SoftOne SQL Server (read-only)
        ↓
server-side sync/normalization
        ↓
Hub MariaDB
        ↓
Hub API και UI
```

- Δεν εκτελούνται `INSERT`, `UPDATE`, `DELETE`, `DROP` ή stored procedures που
  γράφουν στο SoftOne.
- Ο browser δεν υποβάλλει SQL.
- Cleanup ή upsert αλλάζει μόνο τη MariaDB του Hub.
- Τα operational δεδομένα του Hub (tasks, comments, promises, assignments,
  forecasts κ.λπ.) παραμένουν στη MariaDB.
- Τα πραγματικά secrets υπάρχουν μόνο στο production `.env`/Plesk.
- Feature flags παραμένουν συνήθως `false` και ενεργοποιούνται ανά CLI run.

## 6. Κανόνας επιλέξιμων customers

Μετά από επιβεβαίωση από SoftOne:

- `SODTYPE=13`: πελάτες,
- `SODTYPE=12`: προμηθευτές.

Στο Collections/Customers dataset εισάγονται μόνο:

- `COMPANY=1`,
- `SODTYPE=13`,
- `ISACTIVE=1`,
- πελάτες με έγκυρο `TRDGROUP`,
- εκτός του internal Prime Products group `TRDGROUP=473`.

Οι suppliers (`SODTYPE=12`) και η ίδια η Prime Products δεν εμφανίζονται ως
customers. Το cleanup εκτελείται μόνο στη Hub MariaDB και προστατεύεται από
dependencies.

Το production cleanup αφαίρεσε:

- 272 μη επιλέξιμους customers,
- 4.818 invoices,
- dependencies επιβεβαιωμένων suppliers:
  `promises_to_pay: 2`, `activity_log: 9`, `forecast_entries: 227`, `tasks: 3`.

Πριν από μελλοντικό cleanup γίνεται preview και database backup.

## 7. Customers, invoices και οικονομικοί υπολογισμοί

Τα open invoices διαβάζονται από τα SoftOne reporting δεδομένα και
κανονικοποιούνται ανά `FINDOC`/customer. Οι displayed totals πρέπει να
υπολογίζονται από τα ίδια invoice records τόσο στη γενική λίστα όσο και στην
εσωτερική group/customer card.

Ειδικά το `Overdue EOM` πρέπει να χρησιμοποιεί κοινή business function και
ίδιο scope παντού. Δεν επιτρέπεται η γενική Customers λίστα να εμφανίζει άλλο
ποσό από την αντίστοιχη group card για το ίδιο group και φίλτρα.

Τα settled invoices κρύβονται από τα operational totals/lists εκτός αν ο
χρήστης ενεργοποιήσει ρητά `Show paid`. Το stored settlement status και το
derived overdue status είναι διαφορετικές έννοιες.

Aging buckets:

- Current (not due)
- 0–30
- 31–60
- 61–90
- 91–119
- 120+ (περιλαμβάνει ακριβώς 120 ημέρες)

Ο τελευταίος πλήρης production sync ολοκληρώθηκε επιτυχώς με **5.622 open
invoice records**.

## 8. Vessels

Στη σελίδα Vessels πρέπει να εμφανίζονται όλα τα ενεργά πλοία του εγκεκριμένου
SoftOne registry, ακόμη και όσα δεν έχουν invoices.

Η production διάγνωση βρήκε:

- 19.470 ενεργά vessels,
- 3.397 vessels με active contract reference.

Κάθε vessel συνδέεται με owner/customer. Αν owner του vessel δεν υπάρχει στο
Hub, το bulk vessel sync σταματά και αναφέρει τα ακριβή `TRDR` αντί να
δημιουργήσει σιωπηρά λάθος customer.

Για την εγκεκριμένη εξαίρεση `TRDR 40022` προστέθηκε guarded, one-customer
command. Επιβεβαιώθηκε ως ενεργός `SODTYPE=13` customer
`AHINOS MARITIME INC.` και συγχρονίστηκε πριν επαναληφθεί το vessel registry.

## 9. Contracts και installments

Η πηγή contract installments είναι η `dbo.CCCINSTALMENTS`. Η σχέση περιλαμβάνει
customer, vessel, installment date/value και invoice `FINDOC`.

Production diagnostic:

- 289 active installment rows,
- 288 distinct invoice documents,
- 279 open installments,
- 6 overdue installments,
- open amount: 1.157.951,83,
- overdue amount: 26.625,20.

Υπάρχει πραγματική περίπτωση ενός invoice με δύο vessels (`SRI0000728`,
`ISTIA MARITIME CO`, `NAVA ULYSSES`, `NAVA DIONYSSOS`). Για αυτό η σωστή δομή
δεν είναι μία μόνο `vesselId` στο invoice. Προστέθηκε junction table
`invoice_vessel_allocations`, ώστε ένα invoice να μπορεί να συνδέεται με πολλά
vessels και τα vessel totals να κατανέμονται χωρίς διπλομέτρηση.

Το Dashboard card **Overdue contract installments** πρέπει:

- να μετρά μόνο ανοικτές ληξιπρόθεσμες δόσεις,
- να εμφανίζει count και amount,
- με click να ανοίγει `/invoices?contract=overdue`,
- να εμφανίζει τον σωστό customer και όλα τα σχετικά vessels.

## 10. ODBC σταθερότητα

Στο production ο unixODBC/msnodesqlv8 driver εμφάνιζε:

```text
[unixODBC][Driver Manager]Function sequence error
```

Η τελική σταθερή λύση είναι:

- κάθε SoftOne query εκτελείται σε ξεχωριστό short-lived Node/tsx worker,
- η ODBC/native κατάσταση δεν επαναχρησιμοποιείται μεταξύ queries,
- τα errors επιστρέφονται sanitized,
- τα invoice pages είναι cursor-based με `FINDOC`,
- κάθε page περιλαμβάνει 25 FINDOCs ώστε βαριά `FINPAYTERMS` result sets να
  μην προκαλούν HY010.

Η μικρότερη σελιδοποίηση δεν παραλείπει δεδομένα· αυξάνει μόνο τον αριθμό των
read-only queries. Ο επιτυχημένος production run ολοκλήρωσε 264 invoice pages.

Σχετικά PR: #74–#78, με τελική λειτουργική λύση στα #77 και #78.

## 11. Feature flags

Το `.env.example` είναι το ασφαλές template. Οι πραγματικές τιμές δεν
καταγράφονται στο Git.

```dotenv
AUTH_DISABLED=false
SOFTONE_SQL_SYNC_ENABLED=false
SOFTONE_SQL_INVOICE_SYNC_ENABLED=false
SOFTONE_SQL_VESSEL_SYNC_ENABLED=false
SOFTONE_SQL_VESSEL_OWNER_SYNC_ENABLED=false
SOFTONE_SQL_CONTRACT_INSTALLMENT_SYNC_ENABLED=false
```

## 12. Plesk command runner

Στην οθόνη **Run Node.js commands** είναι επιλεγμένο το `npm`. Το Plesk
προσθέτει μόνο του `npm` στην αρχή, άρα στο input γράφουμε `exec ...`, όχι
`npm exec ...`.

### Dependencies

```text
exec --yes --package=pnpm@10.4.1 -- pnpm install --frozen-lockfile
```

### Migrations

Μόνο όταν έχουν προστεθεί migrations/schema changes:

```text
exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -- pnpm run db:push
```

### Build

```text
exec --yes --package=pnpm@10.4.1 -- pnpm run build
```

### SoftOne connection test

```text
exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -- pnpm run test:softone-sql
```

### Customer sync

```text
exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_SQL_SYNC_ENABLED=true -- pnpm run sync:softone-customers
```

### Vessel sync

```text
exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_SQL_VESSEL_SYNC_ENABLED=true -- pnpm run sync:softone-vessels
```

### Full invoice/vessel/installment sync

```text
exec --yes --package=dotenv-cli@8.0.0 -- dotenv -e .env -v SOFTONE_SQL_INVOICE_SYNC_ENABLED=true -v SOFTONE_SQL_VESSEL_SYNC_ENABLED=true -v SOFTONE_SQL_CONTRACT_INSTALLMENT_SYNC_ENABLED=true -- pnpm run sync:softone-invoices
```

Ο πλήρης sync είναι αργός. Δεν κάνουμε refresh ή Restart App όσο εκτελείται.

## 13. Κανονικό deployment checklist

1. Ελεγχόμενο PR στο production fork.
2. Merge στο `main`.
3. Plesk Git → **Pull now**.
4. Plesk Git → **Deploy now**.
5. `pnpm install --frozen-lockfile` μόνο αν άλλαξαν dependencies/lockfile.
6. `db:push` μόνο αν άλλαξε schema και υπάρχει backup.
7. `pnpm run build`.
8. Plesk Node.js → **Restart App**.
9. Browser hard refresh (`Ctrl+F5`).
10. Smoke test Dashboard, Customers, ένα group, Invoices, Vessels, Tasks και
    SOA export.

Μετά από data sync, επιβεβαιώνονται counts και ένα γνωστό customer/vessel/
contract case. Δεν θεωρούμε επιτυχία μόνο το exit code αν το τελικό summary δεν
έχει εμφανιστεί.

## 14. Upstream integration checklist

1. Fetch upstream και production fork.
2. Δημιουργία integration branch από το τρέχον production `main`.
3. Καταγραφή των νέων upstream commits και affected UI/workflows.
4. Merge upstream χωρίς αντικατάσταση των production adapters.
5. Επίλυση conflicts με κανόνα:
   - UI/workflow από Manus,
   - production data access/safety από Hub.
6. Tests/build.
7. Side-by-side Manus/Hub parity check.
8. PR προς production `main`.
9. Deployment checklist της προηγούμενης ενότητας.

## 15. Απαγορευμένες συντομεύσεις

- Δεν κάνουμε deploy απευθείας από upstream.
- Δεν αντικαθιστούμε production SoftOne data με Excel sample data.
- Δεν αλλάζουμε workflow επειδή είναι ευκολότερο να υλοποιηθεί διαφορετικά.
- Δεν γράφουμε στο SoftOne.
- Δεν τρέχουμε δύο syncs παράλληλα.
- Δεν εκτελούμε cleanup ή migration χωρίς preview/backup.
- Δεν κάνουμε `db:push` σε κάθε deploy χωρίς schema change.
- Δεν αγνοούμε missing customer/vessel relations ή τα μετατρέπουμε σιωπηρά σε
  null.

## 16. Ιστορικό βασικών production αλλαγών

- PR #49: fresh SoftOne connection ανά query (πρώτη ODBC αντιμετώπιση).
- PR #50–#52: preview/verification/cleanup μη επιλέξιμων customers.
- PR #54–#55: integration upstream και migrations.
- PR #56–#61: δομημένο, branded SOA PDF και filenames.
- PR #62: κοινή λογική Overdue EOM στη Customers λίστα.
- PR #64–#66: upstream workflow/UI integration.
- PR #68: vessel registry sync.
- PR #69–#70: vessel contract/installment diagnostics.
- PR #71: contract installment vessel allocations.
- PR #72–#73: missing vessel-owner protection και guarded owner sync.
- PR #74–#78: ODBC diagnostics, isolation και μικρό invoice page size.

Αυτό το αρχείο πρέπει να ενημερώνεται μετά από κάθε σημαντική αλλαγή στη
λογική SoftOne, στο deployment ή στο UI/UX contract.

# AR Pro — Εγχειρίδιο Χρήσης

**Εφαρμογή Διαχείρισης Εισπρακτέων Λογαριασμών (Accounts Receivable)**

---

## 1. Εισαγωγή

Το AR Pro είναι μια εφαρμογή διαχείρισης εισπρακτέων λογαριασμών σχεδιασμένη για ομάδες credit control. Επιτρέπει την παρακολούθηση ανοικτών τιμολογίων, τη διαχείριση επικοινωνίας με πελάτες, την πρόβλεψη εισπράξεων (forecast), και τον συντονισμό εργασιών μεταξύ μελών της ομάδας. Η εφαρμογή οργανώνει τους πελάτες σε **Groups** (ομίλους εταιρειών) και παρέχει ολοκληρωμένη εικόνα ανά group.

---

## 2. Σύνδεση & Πλοήγηση

Η σύνδεση γίνεται μέσω Manus OAuth. Μετά τη σύνδεση, ο χρήστης βλέπει το **Dashboard** ως αρχική σελίδα. Η πλοήγηση γίνεται μέσω του πλαϊνού μενού (sidebar) που περιέχει τις ακόλουθες ενότητες:

| Ενότητα | Περιγραφή |
|---------|-----------|
| Dashboard | Κεντρικός πίνακας ελέγχου με KPIs και γραφήματα |
| Customers | Λίστα groups & εταιρειών — κεντρικό σημείο εργασίας |
| Contacts | Διαχείριση επαφών πληρωμών (payment contacts) |
| Invoices | Αναλυτική λίστα τιμολογίων με aging buckets |
| Vessels | Πλοία συνδεδεμένα με τιμολόγια |
| Contracts | Συμβόλαια και δόσεις (installments) |
| Tasks | Εργασίες και follow-ups |
| Wire Transfers | Εμβάσματα και κατανομή σε τιμολόγια (allocation) |
| Reports | Εξαγωγές (Aging, Forecast, SOA, Collections History) |
| Team | Διαχείριση μελών ομάδας |
| Settings | Ρυθμίσεις (FX rates, Softone σύνδεση) |

Στο πάνω μέρος υπάρχει **Global Search** (Ctrl+K) που αναζητά σε groups, εταιρείες, τιμολόγια, σημειώσεις, tasks και εμβάσματα.

---

## 3. Dashboard

Το Dashboard εμφανίζει τη συνολική εικόνα του τρέχοντος μήνα:

**Κύριες κάρτες KPI (πάνω σειρά):**

- **Monthly Collection Target** — ο στόχος είσπραξης (προέρχεται αυτόματα από το Forecast)
- **Collected vs Target** — πόσα εισπράχθηκαν μέχρι σήμερα (ποσοστό επί του στόχου)
- **Outstanding Overdue** — συνολικό ληξιπρόθεσμο υπόλοιπο (σε EUR + ανάλυση ανά νόμισμα)
- **DSO (Days Sales Outstanding)** — μέσος αριθμός ημερών είσπραξης (βάσει τελευταίων 90 ημερών)

**Κάρτες δράσης (δεύτερη σειρά):**

- **Εκκρεμεί επικοινωνία** — groups με forecast > 0 που δεν έχει γίνει ακόμα επικοινωνία (Not Contacted). Κλικ → ανοίγει τη λίστα Customers φιλτραρισμένη σε "Not Contacted"
- **Pending follow-up tasks** — ανοικτά tasks που απαιτούν ενέργεια
- **Problematic groups** — groups με status Problematic
- **On Hold / Legal groups** — groups σε κατάσταση On Hold ή Legal
- **Overdue contract installments** — ληξιπρόθεσμες δόσεις συμβολαίων

**Γραφήματα:**

- **Cash Flow Forecast (6 μήνες)** — πρόβλεψη εισπράξεων ανά μήνα (από τιμολόγια + συμβόλαια)
- **Aging Buckets** — ανάλυση ληξιπρόθεσμων ανά ηλικία (0-30, 31-60, 61-90, 91-120, 120+ ημέρες)

---

## 4. Customers (Πελάτες)

Η σελίδα Customers είναι το **κεντρικό σημείο εργασίας** του collector. Εμφανίζει δύο views:

### 4.1 Groups View (προεπιλογή)

Κάθε γραμμή αντιπροσωπεύει έναν **όμιλο εταιρειών** (group). Οι στήλες περιλαμβάνουν:

| Στήλη | Τι δείχνει |
|-------|-----------|
| Group | Όνομα ομίλου (κλικ → ανοίγει Group Card) |
| Confirmation | Κατάσταση επικοινωνίας (Not Contacted, Promise to Pay, Pending Follow-up, Broken, Kept) |
| Promised | Ποσό υπόσχεσης πληρωμής |
| Open Balance | Συνολικό ανοικτό υπόλοιπο (EUR) |
| Overdue | Ληξιπρόθεσμο υπόλοιπο |
| Overdue EOM | Ληξιπρόθεσμο μέχρι τέλος μήνα |
| Forecast | Πρόβλεψη είσπραξης τρέχοντος μήνα (editable — κλικ για αλλαγή) |
| Collected | Εισπραχθέν ποσό τρέχοντος μήνα |
| Remaining | Υπόλοιπο προς είσπραξη (Forecast − Collected) |

**Φίλτρα:**

- Account Manager / Collector (ανά υπεύθυνο)
- Confirmation status (Not Contacted, Promise to Pay, Pending Follow-up, Broken, Kept)
- Account Status (Normal, Problematic, Critical, On Hold, Legal)
- Credit Rating (A-E)
- Search (αναζήτηση ονόματος group)

**Ενέργειες:**

- **Refresh Forecast** — επαναδημιουργεί το Smart Forecast για τον τρέχοντα μήνα
- **Κλικ στο Confirmation badge** — ανοίγει το Log Call dialog για γρήγορη ενημέρωση
- **Κλικ στο Forecast ποσό** — inline editing (αλλαγή πρόβλεψης)

### 4.2 Companies View

Εμφανίζει κάθε εταιρεία ξεχωριστά (αντί για group). Κλικ σε εταιρεία → ανοίγει Customer 360 card.

---

## 5. Group Card (Κάρτα Ομίλου)

Η Group Card είναι η **κύρια σελίδα εργασίας** για κάθε πελάτη. Ανοίγει κάνοντας κλικ σε ένα group στη λίστα Customers.

### 5.1 Header

Στο header εμφανίζονται:

- Όνομα group + αριθμός εταιρειών
- **Credit Rating** badge (A-E) με tooltip ανάλυσης
- **Account Status** dropdown (Normal / Problematic / Critical / On Hold / Legal)
- **Confirmation Status** badge (κλικ → ανοίγει linked task ή Log Call)
- **Account Manager** & **Collector** assignments (editable)
- "Carried over" ένδειξη αν η κατάσταση μεταφέρθηκε από προηγούμενο μήνα

### 5.2 Ενέργειες (Action Buttons)

| Κουμπί | Λειτουργία |
|--------|-----------|
| Log Call | Καταγραφή κλήσης + ενημέρωση confirmation status |
| Actions → New Task | Δημιουργία νέου task (με assignee) |
| Actions → Add Note | Προσθήκη σημείωσης |
| Actions → Send Email | Αποστολή email (4 templates: Friendly Reminder, Final Notice, Statement, Custom) |
| AI Summary | Αυτόματη σύνοψη (AI) με ενέργειες μήνα |
| SOA (PDF/Excel) | Εξαγωγή Statement of Account |

### 5.3 KPI Cards

Έξι κάρτες δεικτών:

1. **Open Balance** — συνολικό ανοικτό υπόλοιπο (+ ανάλυση νομισμάτων)
2. **Overdue** — ληξιπρόθεσμο + EOM (End of Month projection)
3. **Forecast (this month)** — πρόβλεψη (editable) + Expected to Collect + variance
4. **Paid (this month)** — εισπραχθέν ποσό
5. **Remain to Collect** — υπόλοιπο vs forecast
6. **Turnover** — τζίρος YTD vs πέρυσι (% σύγκριση)

### 5.4 Aging Buckets

Clickable κάρτες ανά ηλικία (0-30, 31-60, 61-90, 91-120, 120+ ημέρες). Κλικ σε bucket → φιλτράρει τα τιμολόγια κάτω.

### 5.5 Τιμολόγια

Πίνακας τιμολογίων με:
- Φίλτρα: Status (Open/Overdue/Paid/Disputed), Aging bucket, Installment toggle
- Στήλες: Invoice #, Customer, Vessel, Branch, Doc. Date, Due Date, Status, Amount, Paid, Outstanding, Days Overdue
- **Resizable columns** (drag τα headers)
- **Sortable** (κλικ σε header)
- **Checkboxes** → "Send to colleague" (δημιουργεί task με attached invoices)
- **By Branch** toggle — ομαδοποίηση ανά branch/office
- **Status dropdown** ανά τιμολόγιο (Mark as Disputed / Clear dispute)

### 5.6 Companies (μέλη ομίλου)

Collapsible section κάτω από τα τιμολόγια. Δείχνει τις εταιρείες-μέλη του group με τα υπόλοιπά τους. Κλικ → Customer 360.

### 5.7 Activity Log

Χρονολογικό ημερολόγιο ΟΛΩΝ των ενεργειών: σημειώσεις, tasks, promises, emails, κλήσεις. Κάθε ενέργεια καταγράφεται αυτόματα.

### 5.8 Tabs (Payment History, Contracts, Tasks, Emails)

- **Payment History** — ιστορικό πληρωμών
- **Contracts** — ενεργά συμβόλαια + δόσεις
- **Tasks** — tasks που αφορούν αυτό το group
- **Emails** — ιστορικό αποσταλμένων emails

---

## 6. Ροή Εργασίας Collector (Καθημερινή Χρήση)

### 6.1 Βήμα 1: Έλεγχος Dashboard

Κάθε πρωί ο collector ελέγχει:
- Πόσα groups εκκρεμούν (κάρτα "Εκκρεμεί επικοινωνία")
- Pending follow-up tasks
- Problematic groups

### 6.2 Βήμα 2: Επικοινωνία με πελάτες

Από τη λίστα Customers (φίλτρο "Not Contacted"):

1. Κλικ στο group → ανοίγει η Group Card
2. Ελέγξτε τα KPIs (overdue, forecast, aging)
3. Πατήστε **"Log Call"**
4. Επιλέξτε contact, outcome (Reached / No Answer), και **Customer Response**:

| Response | Τι συμβαίνει |
|----------|-------------|
| **Promise to Pay** | Καταγράφεται υπόσχεση πληρωμής (ποσό + ημερομηνία υποχρεωτικά). Δημιουργείται αυτόματα task follow-up. |
| **Pending Follow-up** | Ορίζεται ημερομηνία follow-up. Δημιουργείται task. |
| **Broken** | Σημειώνεται ότι ο πελάτης δεν τήρησε υπόσχεση. |

### 6.3 Βήμα 3: Παρακολούθηση Tasks

Στη σελίδα Tasks:
- Φιλτράρετε "Assigned" για tasks που σας ανατέθηκαν
- Overdue tasks εμφανίζονται με κόκκινο
- Κλικ σε task → detail dialog:
  - Για Promise tasks: κουμπιά **"Kept"** ή **"Not Confirmed"**
  - Αν "Not Confirmed" → ανοίγει Next Action dialog (Follow-up / New promise / Escalate)

### 6.4 Βήμα 4: Ενημέρωση Forecast

Ο forecast (πρόβλεψη) αντιπροσωπεύει το **συντηρητικό ποσό που περιμένουμε να εισπράξουμε** αυτόν τον μήνα.

- **Refresh Forecast** (κουμπί στη σελίδα Customers) → AI + heuristic υπολογισμός ανά group
- **Inline editing** → κλικ στο ποσό forecast στη λίστα ή στο group card για χειροκίνητη αλλαγή
- Αν ένα group δεν έχει forecast → θεωρείται αυτόματα **Problematic**

### 6.5 Βήμα 5: Εμβάσματα & Κατανομή

Όταν ληφθεί πληρωμή:
1. Πηγαίνετε στο **Wire Transfers**
2. Πατήστε **"New Wire Transfer"** (ποσό, νόμισμα, branch, ημερομηνία, reference)
3. Στη λίστα, πατήστε **"Allocate"** (Συμψηφισμός)
4. Επιλέξτε τιμολόγια και κατανείμετε ποσά
5. Τα τιμολόγια ενημερώνονται αυτόματα (Open → Partially Paid → Paid)

---

## 7. Confirmation Status (Κατάσταση Επικοινωνίας)

Κάθε group έχει μία κατάσταση επικοινωνίας για τον τρέχοντα μήνα:

| Status | Σημασία | Χρώμα |
|--------|---------|-------|
| Not Contacted | Δεν έχει γίνει επικοινωνία | Γκρι |
| Promise to Pay | Υπόσχεση πληρωμής (ποσό + ημερομηνία) | Πράσινο |
| Pending Follow-up | Αναμονή follow-up (ημερομηνία) | Πορτοκαλί |
| Broken | Δεν τήρησε υπόσχεση | Κόκκινο |
| Kept | Τήρησε υπόσχεση | Πράσινο σκούρο |

**Σημαντικές λεπτομέρειες:**

- Η κατάσταση **μεταφέρεται** στον επόμενο μήνα μόνο αν η ημερομηνία-στόχος (promise date ή follow-up date) δεν έχει περάσει. Αλλιώς, επιστρέφει σε "Not Contacted".
- Αν η ημερομηνία ενός task περάσει χωρίς ολοκλήρωση, εμφανίζεται **κόκκινο badge** (task overdue).
- Κλικ στο badge → ανοίγει το linked task (αν υπάρχει) ή το Log Call dialog.

---

## 8. Account Status (Κατάσταση Λογαριασμού)

Κάθε group έχει μία κατάσταση λογαριασμού:

| Status | Σημασία |
|--------|---------|
| Normal | Κανονική λειτουργία |
| Problematic | Αυτόματο: forecast < 80% overdue EOM, ή χωρίς forecast. Χειροκίνητο: ο χρήστης μπορεί να το θέσει. |
| Critical | Χειροκίνητο ή αυτόματο (30+ ημέρες Problematic) |
| On Hold | Χειροκίνητο — σε αναστολή |
| Legal | Χειροκίνητο — σε νομική διαδικασία |

Η αλλαγή γίνεται από το dropdown στο header του group card ή στη λίστα Customers.

---

## 9. Tasks (Εργασίες)

Τα tasks δημιουργούνται **χειροκίνητα** (δεν υπάρχει αυτόματη μηχανή tasks). Τρόποι δημιουργίας:

1. Από το Group Card → Actions → New Task
2. Από τη σελίδα Tasks → New Task
3. **Αυτόματα** μόνο σε δύο περιπτώσεις:
   - Promise to Pay → δημιουργεί follow-up task στην ημερομηνία υπόσχεσης
   - Pending Follow-up → δημιουργεί task στην ημερομηνία follow-up

**Λειτουργίες Tasks:**

- Ανάθεση σε μέλος ομάδας (assignee)
- Επισύναψη τιμολογίων (από checkboxes στον πίνακα τιμολογίων)
- Σχόλια (comments thread)
- Reschedule (αλλαγή ημερομηνίας — μετρητής ×N)
- Done / Cancel
- Αναζήτηση ανά group name

**Scoping tabs:**
- All — όλα τα tasks
- Created by me — tasks που δημιούργησα
- Assigned — tasks που μου ανατέθηκαν από άλλους

Τα cancelled tasks **δεν εμφανίζονται** εκτός αν επιλεγεί ρητά στο φίλτρο status.

---

## 10. Wire Transfers (Εμβάσματα)

### 10.1 Καταγραφή εμβάσματος

Πατήστε "New Wire Transfer" και συμπληρώστε:
- Customer (αναζήτηση)
- Amount + Currency (EUR, USD, AED, SGD, GBP, NOK, JPY)
- Branch (office)
- Date, Reference, Status (Pending / Received), Notes

### 10.2 Κατανομή σε τιμολόγια (Allocation / Συμψηφισμός)

1. Στη λίστα Wire Transfers, πατήστε **"Allocate"** στο έμβασμα
2. Ανοίγει dialog με τα ανοικτά τιμολόγια του group
3. Εισάγετε ποσό ανά τιμολόγιο (ή "Max" για πλήρη εξόφληση)
4. Αναζήτηση τιμολογίων στο dialog
5. Save → τα τιμολόγια ενημερώνονται (Partially Paid / Paid)

Η κατανομή μπορεί να ακυρωθεί (Cancel allocation) — τα τιμολόγια επιστρέφουν στην προηγούμενη κατάσταση.

### 10.3 Expandable breakdown

Κάθε έμβασμα στη λίστα έχει expandable row που δείχνει ποια τιμολόγια εξοφλήθηκαν, σε ποια εταιρεία, και σε ποιο branch.

---

## 11. Invoices (Τιμολόγια)

Η σελίδα Invoices παρέχει πλήρη εικόνα όλων των τιμολογίων:

**Φίλτρα:** Status, Aging bucket, Branch, Vessel, Contract installments, Search, Group drill-down

**Views:**
- **List** — κλασική λίστα τιμολογίων
- **By Group** — ομαδοποίηση ανά group (κλικ → drill-down στα τιμολόγια)

**Ενέργειες:**
- Mark as Disputed (+ reason) / Clear dispute
- Checkboxes → "Send to colleague" (task με attached invoices)

**Aging cards** (πάνω): clickable, φιλτράρουν τη λίστα

---

## 12. Vessels (Πλοία)

Λίστα πλοίων με ανοικτά υπόλοιπα. Κλικ → modal με:
- Vessel info
- KPIs (open balance, overdue, invoiced, paid)
- Λίστα τιμολογίων του πλοίου

Τα πλοία συνδέονται με τιμολόγια μέσω bulk upload (δεν γίνεται χειροκίνητη ανάθεση).

---

## 13. Contracts (Συμβόλαια)

Διαχείριση συμβολαίων με δόσεις (installments). Τα τιμολόγια που είναι δόσεις συμβολαίων σημειώνονται με badge "Contract" παντού στην εφαρμογή.

Στο Dashboard εμφανίζεται κάρτα με τις **ληξιπρόθεσμες δόσεις** (overdue contract installments).

---

## 14. Contacts (Επαφές)

Κεντρική λίστα payment contacts. Κάθε contact συνδέεται με εταιρεία και περιέχει:
- Όνομα, Email, Τηλέφωνο, Τίτλο/Ρόλο

Οι contacts εμφανίζονται στο Log Call dialog (dropdown) και στο Send Email dialog. Μπορείτε να προσθέσετε νέο contact inline (μέσα στα dialogs).

---

## 15. Reports (Αναφορές)

| Αναφορά | Μορφή | Περιγραφή |
|---------|-------|-----------|
| Aging Report | Excel / PDF | Ανάλυση ληξιπρόθεσμων ανά bucket |
| Forecast Plan | Excel / PDF | Πρόβλεψη εισπράξεων τρέχοντος μήνα |
| SOA (Statement of Account) | PDF / Excel | Κατάσταση λογαριασμού ανά πελάτη/group |
| Collections History | Πίνακας | Ιστορικό εισπράξεων τελευταίων 12 μηνών |

Η SOA μπορεί να εξαχθεί και από το Group Card (κουμπιά SOA PDF/Excel).

---

## 16. Team (Ομάδα)

Διαχείριση μελών ομάδας:
- Προσθήκη / Επεξεργασία / Απενεργοποίηση μελών
- Ρόλοι: Account Manager, Collector
- Στήλη "Collecting" — πόσα groups έχει αναλάβει κάθε μέλος

Η ανάθεση Account Manager και Collector γίνεται:
- Από το Group Card (header)
- Μαζικά ανά group (ανατίθεται σε όλες τις εταιρείες-μέλη)

---

## 17. AI Summary

Το AI Summary (κουμπί στο Group Card) δημιουργεί αυτόματα μια σύνοψη στα ελληνικά (~100 λέξεις):

- **Header:** Open Balance + Overdue + αριθμός τιμολογίων
- **Σώμα:** Κατάσταση μήνα, πληρωτική συμπεριφορά, κύρια τιμολόγια
- **Προτεινόμενη ενέργεια:** Μία πρόταση δράσης

Χρησιμοποιεί δεδομένα forecast, collected, promises, tasks, payment behavior, και aging.

---

## 18. Smart Forecast

Το forecast υπολογίζεται ανά group και αντιπροσωπεύει το **συντηρητικό ποσό που αναμένεται να εισπραχθεί** τον τρέχοντα μήνα.

**Πώς λειτουργεί:**

1. Πατήστε **"Refresh Forecast"** στη σελίδα Customers
2. Το σύστημα αναλύει ανά group: τιμολόγια due/overdue, πληρωτική συμπεριφορά (avg days late, collection rate), ιστορικό promises
3. Για τα top-40 groups (σε exposure): AI suggestion (LLM)
4. Για τα υπόλοιπα: στατιστικό heuristic
5. Ο χρήστης μπορεί να αλλάξει χειροκίνητα (inline edit)

**Αυτόματος κανόνας Problematic:** Αν forecast < 80% του overdue EOM, ή αν δεν υπάρχει forecast → auto-Problematic.

**Initial Forecast:** Αποθηκεύεται η αρχική τιμή — δεν αλλάζει με refresh (μόνο η τρέχουσα expected αλλάζει).

---

## 19. Log Call (Καταγραφή Κλήσης)

Το Log Call είναι η **κύρια ενέργεια** του collector. Ανοίγει από:
- Κουμπί "Log Call" στο Group Card
- Κλικ στο Confirmation badge στη λίστα Customers

**Πεδία:**

1. **Contact** — dropdown με τις επαφές του group (+ "Add new contact")
2. **Outcome** — Reached / No Answer
3. **Customer Response** (αν Reached):
   - **Promise to Pay** → ποσό (υποχρεωτικό) + ημερομηνία πληρωμής (υποχρεωτική)
   - **Pending Follow-up** → ημερομηνία follow-up
   - **Broken** → λόγος
4. **Notes** — ελεύθερο κείμενο

**Αυτοματισμοί μετά το Log Call:**

- Promise to Pay → δημιουργεί Promise record + follow-up task
- Pending Follow-up → δημιουργεί task στην ημερομηνία
- Broken / Not Contacted → ακυρώνει ανοικτά promises + tasks
- Αν υπάρχει ήδη ανοικτή promise → εμφανίζεται επιλογή "Reschedule existing" vs "Create new"
- Αν υπάρχει ήδη follow-up task → μετακινείται στη νέα ημερομηνία (δεν δημιουργεί duplicate)

---

## 20. Email (Αποστολή Email)

Από το Group Card → Actions → Send Email:

**Templates:**
- Friendly Reminder — ήπια υπενθύμιση
- Final Notice — τελική ειδοποίηση
- Statement — κατάσταση λογαριασμού
- Custom — ελεύθερο κείμενο

Επιλέγετε contact (email) από τη λίστα payment contacts. Το email καταγράφεται στο Activity Log.

---

## 21. Credit Rating

Κάθε group λαμβάνει αυτόματα βαθμολογία A-E βάσει:

| Παράγοντας | Βάρος |
|-----------|-------|
| Πληρωτική συμπεριφορά (avg days late) | ~25% |
| Overdue ratio (overdue / open balance) | ~20% |
| Aging concentration (πόσο παλιά τα χρέη) | ~15% |
| Broken promises | ~10% |
| Account status (On Hold, Legal) | ~10% |
| Turnover trend (YTD vs last year) | ~10% |
| Overdue / Turnover exposure | ~10% |

Το rating εμφανίζεται ως badge (A=πράσινο, E=κόκκινο) στη λίστα Customers και στο Group Card. Hover → tooltip με ανάλυση κάθε παράγοντα.

---

## 22. Settings (Ρυθμίσεις)

- **FX Rates** — Ισοτιμίες νομισμάτων (AED, SGD, USD → EUR). Εφαρμόζονται αμέσως.
- **Softone Connection** — Σύνδεση με ERP Softone (S1 Web Services) για αυτόματο pull πελατών/τιμολογίων.

---

## 23. Συμβουλές & Βέλτιστες Πρακτικές

1. **Ξεκινήστε κάθε μέρα από το Dashboard** — ελέγξτε τα εκκρεμή groups και τα overdue tasks.

2. **Χρησιμοποιήστε πάντα το Log Call** — καταγράφει αυτόματα στο activity log, δημιουργεί tasks, ενημερώνει badges.

3. **Κρατήστε το forecast ρεαλιστικό** — αντιπροσωπεύει τι πραγματικά περιμένετε να εισπράξετε, όχι τι θέλετε.

4. **Ελέγξτε τα Problematic groups** — αν ένα group είναι λάθος Problematic, αυξήστε το forecast ή αλλάξτε χειροκίνητα σε Normal.

5. **Χρησιμοποιήστε tasks για συνεργασία** — αναθέστε tasks σε συναδέλφους, επισυνάψτε τιμολόγια, γράψτε comments.

6. **Allocate τα εμβάσματα αμέσως** — ώστε τα Collected/Remaining να ενημερώνονται σωστά.

7. **Global Search (Ctrl+K)** — γρήγορη πρόσβαση σε οτιδήποτε (group, τιμολόγιο, wire transfer).

8. **AI Summary** — χρησιμοποιήστε το πριν καλέσετε τον πελάτη για γρήγορη ενημέρωση.

---

## 24. Συντομεύσεις & Tips

| Ενέργεια | Πώς |
|----------|-----|
| Αναζήτηση | Ctrl+K ή κλικ στο search bar |
| Γρήγορη αλλαγή confirmation | Κλικ στο badge στη λίστα Customers |
| Inline edit forecast | Κλικ στο ποσό forecast στη λίστα |
| Resize στήλες | Drag τα borders στα headers |
| Resize dialogs | Drag τις γωνίες/πλευρές |
| Sort στήλες | Κλικ στο header (3ο κλικ = reset) |
| Drill-down aging | Κλικ σε aging card → φιλτράρει invoices |
| Send invoices to colleague | Checkboxes → floating bar "Send to colleague" |

---

*Τελευταία ενημέρωση: Ιούλιος 2026*

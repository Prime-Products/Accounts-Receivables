# Onboarding & In-App Guidance για νέους χρήστες — AR Pro

Ένα πλήρες σχέδιο για να βοηθήσετε τους νέους υπαλλήλους να μάθουν την εφαρμογή χωρίς εξωτερική εκπαίδευση.

---

## 1. Τι υπάρχει ήδη στην εφαρμογή

- ✅ **Σαφή ονόματα κουμπιών** — "New Invoice", "Record Receipt", "Log Call" (όχι αρκρωνύμια)
- ✅ **Περιγραφικές ετικέτες** — π.χ. "Aging report, status filters and receipt reconciliation"
- ✅ **Empty states** — όταν δεν υπάρχουν δεδομένα, δείχνει "No contracts yet. Create the first service agreement."
- ✅ **Tooltips** — κάποια πεδία έχουν επεξήγηση (π.χ. credit rating badges)

**Τι λείπει:** Δεν υπάρχει δομημένο onboarding για πρώτη φορά και καμία "guided tour" ή context-sensitive help.

---

## 2. Τι μπορούμε να προσθέσουμε (σε σειρά προτεραιότητας)

### 🟢 Υψηλή προτεραιότητα (εύκολα + μεγάλη αξία)

#### A. First-Time User Modal (Onboarding Welcome)

Όταν ένας νέος χρήστης ανοίγει την εφαρμογή για πρώτη φορά:

```
┌─────────────────────────────────────────────┐
│  👋 Καλώς ήρθατε στο AR Pro!               │
│                                             │
│  Αυτή είναι η εφαρμογή διαχείρισης        │
│  εισπράξεων. Θα σας δείξουμε τα βασικά    │
│  σε 2 λεπτά.                               │
│                                             │
│  [ Ξεκινήστε τη tour ] [ Παράλειψη ]      │
└─────────────────────────────────────────────┘
```

**Τι θα κάνει:**
- Δείχνει μια σύντομη εισαγωγή (30 δευτερόλεπτα)
- Προτείνει τα 3 πιο σημαντικά κουμπιά: Dashboard → Customers → Invoices
- Αποθηκεύει ότι ο χρήστης έχει δει το onboarding (δεν θα ξαναεμφανιστεί)

**Υλοποίηση:** 
- Προσθέστε στήλη `hasSeenOnboarding` στον πίνακα `users`
- Δείξτε το modal μόνο αν `hasSeenOnboarding = false`

---

#### B. Contextual Tooltips (Hover Help)

Κάθε κουμπί/πεδίο έχει ένα μικρό `?` που όταν το περάσετε το ποντίκι, δείχνει τι κάνει:

```
[New Invoice] ?
              ↓
              "Δημιουργήστε ένα νέο τιμολόγιο
               για έναν πελάτη. Μπορείτε να
               επιλέξετε νόμισμα και ημερομηνία."
```

**Παραδείγματα που χρειάζονται:**
- "New Task" → "Δημιουργήστε ένα follow-up task για έναν πελάτη"
- "Promise to Pay" → "Καταγράψτε μια υπόσχεση πληρωμής από τον πελάτη"
- "Watch Status" → "Σημάνετε αν ο πελάτης είναι προβληματικός ή κανονικός"
- "Credit Rating" → "A=Άριστος, E=Κακός — βασίζεται σε ιστορικό πληρωμών"

**Υλοποίηση:**
- Χρησιμοποιήστε το `Tooltip` component από shadcn/ui (ήδη υπάρχει)
- Δημιουργήστε ένα αρχείο `tooltips.ts` με όλα τα κείμενα

---

#### C. Interactive Tour (Guided First Steps)

Μια σύντομη περιήγηση που δείχνει τη ροή εργασίας:

**Σκηνή 1: Dashboard**
```
"Εδώ είναι η αρχική σελίδα. Δείχνει:
 • Συνολικό ανοιχτό υπόλοιπο
 • Ληξιπρόθεσμα τιμολόγια
 • Τα επόμενα follow-ups που πρέπει να κάνετε"
[Επόμενο]
```

**Σκηνή 2: Customers**
```
"Εδώ βλέπετε όλες τις ομάδες πελατών.
 Κάντε κλικ σε μια ομάδα για να δείτε:
 • Όλα τα τιμολόγια της
 • Τις υποσχέσεις πληρωμής
 • Το ιστορικό επικοινωνίας"
[Επόμενο]
```

**Σκηνή 3: Invoices**
```
"Εδώ είναι όλα τα τιμολόγια.
 Μπορείτε να:
 • Φιλτράρετε ανά status (Open, Paid, Overdue)
 • Καταγράψετε μια πληρωμή
 • Εξάγετε aging report"
[Τέλος]
```

**Υλοποίηση:**
- Χρησιμοποιήστε τη βιβλιοθήκη `driver.js` ή `intro.js` (lightweight, δεν χρειάζεται εξωτερικό backend)
- Αποθηκεύστε ποια σκηνή έχει δει ο χρήστης

---

### 🟡 Μεσαία προτεραιότητα (λίγο πιο πολύπλοκα)

#### D. Contextual Help Panel (Δεξιά πλευρά)

Ένα πάνελ που εμφανίζεται δεξιά και εξηγεί τι κάνετε τώρα:

```
┌─────────────────────────────┐
│ ℹ️ Τι είναι η σελίδα Invoices;│
│                              │
│ Εδώ διαχειρίζεστε όλα τα    │
│ τιμολόγια. Μπορείτε να:      │
│                              │
│ 1. Δείτε ποια είναι ανοιχτά  │
│ 2. Καταγράψετε πληρωμές      │
│ 3. Εξάγετε αναφορές          │
│                              │
│ 💡 Συμβουλή: Χρησιμοποιήστε │
│ τα φίλτρα για να δείτε μόνο  │
│ ληξιπρόθεσμα τιμολόγια       │
└─────────────────────────────┘
```

**Πότε εμφανίζεται:**
- Όταν ο χρήστης πρώτη φορά επισκέπτεται μια σελίδα
- Όταν κάνει κλικ σε ένα κουμπί που δεν έχει χρησιμοποιήσει ποτέ

---

#### E. Checklists & Quick Start

Για κάθε ρόλο, μια λίστα "πρώτα βήματα":

```
📋 Ξεκινήστε εδώ (Credit Controller)

☐ Δείτε το Dashboard (2 λεπτά)
☐ Ανοίξτε μια ομάδα πελατών (3 λεπτά)
☐ Καταγράψτε ένα follow-up call (5 λεπτά)
☐ Δημιουργήστε ένα task (2 λεπτά)
☐ Εξάγετε ένα aging report (2 λεπτά)

✅ Έχετε ολοκληρώσει 5/5 — Συγχαρητήρια!
```

---

### 🔴 Χαμηλή προτεραιότητα (πιο προχωρημένα)

#### F. AI-Powered Chatbot (Future)

Ένα μικρό chatbot που απαντάει ερωτήσεις:

```
Χρήστης: "Πώς καταγράφω μια πληρωμή;"
Bot: "Πάτε Invoices → επιλέξτε τιμολόγιο → 
      κάντε κλικ 'Record Receipt' → συμπληρώστε 
      το ποσό και την ημερομηνία."
```

---

## 3. Υλοποίηση — Βήμα προς βήμα

### Φάση 1: First-Time Modal (1 ώρα)

```typescript
// 1. Ενημερώστε το schema
export const users = mysqlTable("users", {
  // ... υπάρχοντα πεδία
  hasSeenOnboarding: int("hasSeenOnboarding").default(0).notNull(),
});

// 2. Δημιουργήστε το modal component
// client/src/components/OnboardingModal.tsx
export function OnboardingModal({ onComplete }: { onComplete: () => void }) {
  return (
    <Dialog open={true} onOpenChange={onComplete}>
      <DialogContent>
        <h2>Καλώς ήρθατε στο AR Pro!</h2>
        <p>Αυτή είναι η εφαρμογή διαχείρισης εισπράξεων...</p>
        <Button onClick={onComplete}>Ξεκινήστε τη tour</Button>
        <Button variant="ghost" onClick={onComplete}>Παράλειψη</Button>
      </DialogContent>
    </Dialog>
  );
}

// 3. Δείξτε το στο App.tsx
function App() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(!user?.hasSeenOnboarding);

  const handleOnboardingComplete = async () => {
    await trpc.users.markOnboardingComplete.useMutation();
    setShowOnboarding(false);
  };

  return (
    <>
      {showOnboarding && <OnboardingModal onComplete={handleOnboardingComplete} />}
      {/* ... υπόλοιπη εφαρμογή */}
    </>
  );
}

// 4. Backend procedure
users: {
  markOnboardingComplete: protectedProcedure.mutation(async ({ ctx }) => {
    await db.update(users).set({ hasSeenOnboarding: 1 }).where(eq(users.id, ctx.user.id));
  }),
}
```

### Φάση 2: Tooltips (30 λεπτά)

```typescript
// client/src/lib/tooltips.ts
export const tooltips = {
  newInvoice: "Δημιουργήστε ένα νέο τιμολόγιο για έναν πελάτη",
  recordReceipt: "Καταγράψτε μια πληρωμή που έλαβε ο πελάτης",
  promiseToPay: "Καταγράψτε μια υπόσχεση πληρωμής από τον πελάτη",
  watchStatus: "Σημάνετε αν ο πελάτης είναι προβληματικός",
  creditRating: "A=Άριστος, E=Κακός — βασίζεται σε ιστορικό πληρωμών",
};

// Χρήση στο component
<Tooltip content={tooltips.newInvoice}>
  <Button>New Invoice</Button>
</Tooltip>
```

### Φάση 3: Interactive Tour (1-2 ώρες)

Χρησιμοποιήστε `driver.js`:

```typescript
// client/src/lib/tour.ts
import { driver } from "driver.js";

export function startTour() {
  const driverObj = driver({
    showProgress: true,
    steps: [
      {
        element: "#dashboard-kpis",
        popover: {
          title: "Dashboard",
          description: "Εδώ βλέπετε τα κύρια νούμερα: ανοιχτό υπόλοιπο, ληξιπρόθεσμα, DSO",
        },
      },
      {
        element: "#customers-link",
        popover: {
          title: "Customers",
          description: "Κάντε κλικ εδώ για να δείτε όλες τις ομάδες πελατών",
        },
      },
      {
        element: "#invoices-link",
        popover: {
          title: "Invoices",
          description: "Εδώ διαχειρίζεστε όλα τα τιμολόγια",
        },
      },
    ],
  });

  driverObj.drive();
}
```

---

## 4. Ρόλο-Βασισμένο Onboarding

Διαφορετικοί χρήστες χρειάζονται διαφορετική εκπαίδευση:

| Ρόλος | Πρώτα βήματα | Κύρια εργαλεία |
|---|---|---|
| **Credit Controller** | Dashboard → Customers → Log Call | Call List, Forecast, Tasks |
| **Accounting** | Invoices → Receipts → Reports | Receipt Recording, Aging Report |
| **Management** | Dashboard → Reports → Forecast | KPIs, Collections History, Trends |

**Υλοποίηση:**
```typescript
const onboardingByRole = {
  "Credit Controller": {
    tour: ["dashboard", "customers", "logCall"],
    checklist: ["View Dashboard", "Open Customer", "Log Call"],
  },
  "Accounting": {
    tour: ["invoices", "receipts", "reports"],
    checklist: ["View Invoices", "Record Receipt", "Export Report"],
  },
};
```

---

## 5. Video Tutorials (Bonus)

Δημιουργήστε 3-5 σύντομα βίντεο (2-3 λεπτά το καθένα):

1. **"Πώς να καταγράψετε μια πληρωμή"** — Invoices → Record Receipt
2. **"Πώς να κάνετε ένα follow-up call"** — Customers → Log Call
3. **"Πώς να δείτε το aging report"** — Invoices → Aging (Excel/PDF)
4. **"Πώς να δημιουργήσετε ένα task"** — Tasks → New Task

Αποθηκεύστε τα σε ένα YouTube playlist και δημοσιοποιήστε το link στο Help menu.

---

## 6. Help Menu (Πάντα διαθέσιμο)

Προσθέστε ένα `?` κουμπί στη γωνία που ανοίγει ένα menu:

```
┌─────────────────────────────┐
│ ❓ Βοήθεια                   │
├─────────────────────────────┤
│ 📖 Ξεκινήστε τη tour        │
│ 📚 Διαβάστε τα docs         │
│ 🎥 Δείτε βίντεο             │
│ 💬 Επικοινωνήστε με support │
│ ⚙️ Ρυθμίσεις onboarding     │
└─────────────────────────────┘
```

---

## 7. Checklist Υλοποίησης

- [ ] **Φάση 1:** First-time modal + `hasSeenOnboarding` flag (1 ώρα)
- [ ] **Φάση 2:** Tooltips σε όλα τα κύρια κουμπιά (30 λεπτά)
- [ ] **Φάση 3:** Interactive tour με driver.js (1-2 ώρες)
- [ ] **Φάση 4:** Ρόλο-βασισμένα checklists (30 λεπτά)
- [ ] **Φάση 5:** Help menu (30 λεπτά)
- [ ] **Bonus:** Video tutorials (2-3 ώρες, αργότερα)

---

## 8. Μέτρηση Επιτυχίας

Παρακολουθήστε:

- Πόσοι χρήστες ολοκληρώνουν το onboarding
- Ποια κουμπιά χρησιμοποιούν περισσότερο
- Πόσο γρήγορα μαθαίνουν να κάνουν τις βασικές εργασίες

---

## Συμπέρασμα

Με αυτά τα 5 βήματα, ένας νέος χρήστης θα μπορεί να:
- ✅ Ανοίξει το Dashboard και να καταλάβει τα KPIs
- ✅ Βρει ένα πελάτη και να δει τα τιμολόγιά του
- ✅ Καταγράψει μια πληρωμή ή ένα follow-up call
- ✅ Δημιουργήσει ένα task
- ✅ Ξέρει πού να ψάξει για βοήθεια

**Όλα αυτά σε 10-15 λεπτά, χωρίς εξωτερική εκπαίδευση.**

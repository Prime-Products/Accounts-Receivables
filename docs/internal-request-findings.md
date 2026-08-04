# Ερώτημα σε άλλο τμήμα (π.χ. Contracts: "παραδόθηκε;") — τι υπάρχει σήμερα

## Σενάριο

Ο collector βλέπει τιμολόγιο σε dispute / πελάτη που λέει "δεν παραλάβαμε".
Θέλει να ρωτήσει το **τμήμα συμβολαίων** αν η παράδοση ολοκληρώθηκε, και να πάρει
απάντηση πίσω στην καρτέλα του πελάτη.

## Τι υπάρχει στη βάση αλλά ΔΕΝ είναι συνδεδεμένο

Στο `drizzle/schema.ts` υπάρχουν έτοιμοι πίνακες, και οι πίνακες υπάρχουν και στη
βάση (`requests`, `request_responses`, `request_notifications`), αλλά **κανένα
procedure και κανένα UI δεν τα χρησιμοποιεί** (grep: 0 usages στο server/ και client/).

- `requests`: customerId, groupName, createdBy, `requestedDepartment`
  (Contracts / Logistics / Operations / Finance / Legal / Sales / Other),
  question, status (Open / Answered / Closed / Cancelled), createdAt, updatedAt
- `request_responses`: requestId, respondedBy, response, respondedAt
- `request_notifications`: requestId, userId, isRead

Δηλαδή η δομή για "ρώτα ένα τμήμα και πάρε απάντηση" σχεδιάστηκε αλλά έμεινε ημιτελής.

## Τι μπορεί να κάνει ο χρήστης σήμερα (workarounds)

1. **@mention σε note** (`GroupNotesDialog`, `CollectionNotesBox`, `LogCallDialog`):
   γράφει `@Όνομα παραδόθηκε η παραγγελία;`. Ο παραλήπτης το βλέπει στο Mentions
   inbox. Περιορισμός: το mention δείχνει σε **πρόσωπο** (`team_members`), όχι σε
   τμήμα, και δεν έχει status — δεν ξέρεις αν απαντήθηκε.
2. **New Task με assignee** (`NewTaskDialog`, από Tasks / group card / customer card):
   task τύπου Manual με "Assigned to". Αυτό όμως ξαναφέρνει tasks στη ροή, που ο
   χρήστης δεν θέλει για την καθημερινή είσπραξη.

## Ποιοι είναι στο team σήμερα

| id | Όνομα | Τίτλος | Συνδεδεμένος χρήστης |
|---|---|---|---|
| 30001 | Kostas Vanos | Credid Controller (typo στη βάση) | ναι |
| 30002 | Faye Vanou | Credit Controller | ναι |
| 1770001 | Theofilos Makris | Account Manager | όχι |

**Δεν υπάρχει κανένα μέλος από τμήμα συμβολαίων.** Άρα ακόμη και με @mention,
σήμερα δεν υπάρχει σε ποιον να σταλεί το ερώτημα.

## Επιπλέον παρατήρηση

Το `team_members` έχει μόνο `title` (ελεύθερο κείμενο), όχι `department`. Αν θέλουμε
"ρώτα το τμήμα συμβολαίων" χωρίς να ξέρουμε ποιο πρόσωπο, χρειάζεται είτε πεδίο
department στα μέλη, είτε χρήση του `requestedDepartment` του `requests`.

Στο Address Book υπάρχει ήδη η έννοια "departmental / shared mailbox" για **εξωτερικές**
επαφές (πελάτες), όχι για εσωτερικά τμήματα.

## "Send to colleague" — τι είναι στην πραγματικότητα

Στη σελίδα **Invoices** (και όπου εμφανίζεται το `InvoicesTable` με selection),
επιλέγοντας γραμμές εμφανίζεται floating bar με κουμπί **Send to colleague**.

Ροή (`InvoicesTable.tsx` γρ. 758-772):

1. Ανοίγει το **ίδιο** `NewTaskDialog`, με προσυμπληρωμένα:
   - Title: `Help needed: review N invoice(s)`
   - Description: λίστα των επιλεγμένων τιμολογίων (αριθμός, πελάτης, ποσό)
   - `attachInvoices`: τα τιμολόγια συνδέονται στο task (`task_invoices`)
2. Ο χρήστης διαλέγει **Assigned to** (TeamMemberSelect) και ημερομηνία.
3. `tasks.create` (`server/routers/ar.ts` γρ. 2995) δημιουργεί **task τύπου Manual**
   με `assigneeId`, `customerGroup`, και τα συνδεδεμένα τιμολόγια.
4. Ο δημιουργός γίνεται αυτόματα **watcher** ώστε να δει την απάντηση.
5. Η συζήτηση γίνεται στο **TaskCommentsThread** μέσα στο task.

**Άρα: το "Send to colleague" ΕΙΝΑΙ ο μηχανισμός εσωτερικού ερωτήματος — και είναι task.**

### Συνέπεια για την απόφαση

Ο χρήστης είπε "δεν δουλεύουμε με tasks". Στην πραγματικότητα εννοεί:
**τα tasks δεν παράγονται αυτόματα από την είσπραξη** (log call, promise, follow-up).
Τα **χειροκίνητα** tasks προς συνάδελφο παραμένουν χρήσιμα — αυτό ακριβώς είναι το
Send to colleague, και η σελίδα Tasks το λέει ρητά: "Manual tasks, promise
follow-ups and internal assignments between colleagues".

Επομένως το ερώτημα προς το τμήμα συμβολαίων **δεν χρειάζεται νέο μηχανισμό** —
χρειάζεται το Send to colleague να είναι:
- διαθέσιμο και από την **καρτέλα του group** (όχι μόνο από λίστα τιμολογίων),
- με παραλήπτη **τμήμα** (Contracts) και όχι μόνο πρόσωπο,
- και η απάντηση να φαίνεται στο **Activity Log του πελάτη**, όχι μόνο μέσα στο task.

Οι πίνακες `requests` γίνονται περιττοί αν επεκταθεί το task — ή αντίστροφα.
Αποφασίζει ο χρήστης.

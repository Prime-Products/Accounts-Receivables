# Παράδοση υπόθεσης στη διεύθυνση (πρώην "Escalation")

Ο ξεχωριστός μηχανισμός escalation **αφαιρέθηκε**. Ήταν χτισμένος πάνω στα tasks
(κάθε escalation γέννησε νέο task σε άλλο μέλος) και, αφού η καθημερινή είσπραξη
δεν δουλεύει πλέον με tasks, ο μηχανισμός δεν είχε νόημα.

## Πώς παραδίδεται τώρα μια υπόθεση

Ο collector αλλάζει το **Account Status** του group. Είναι η μόνη ενέργεια που
χρειάζεται και γίνεται από την καρτέλα του group (dropdown στο header).

| Status | Τι σημαίνει |
|---|---|
| Normal | Κανονική παρακολούθηση από τον collector |
| Problematic | Υπάρχει θέμα, αλλά ο collector συνεχίζει |
| **Critical** | Ο collector δεν προχωράει άλλο — το αναλαμβάνει η διεύθυνση |
| On Hold | Σταματούν οι παροχές / νέες παραδόσεις |
| Legal | Πάει σε νομικό έλεγχο |

Η τυπική ροή είναι `Problematic → Critical → On Hold → Legal`. Το **Critical** είναι
το σημείο παράδοσης: όταν ο collector δεν ξέρει τι άλλο να κάνει, βάζει Critical.

## Πώς το βλέπει η διεύθυνση

- Στο **Dashboard** υπάρχει μετρητής για Critical / On Hold λογαριασμούς.
- Στο **Collections Desk** το φίλτρο `All statuses` επιτρέπει προβολή μόνο των Critical.
- Στην καρτέλα του group, το **Activity Log** δείχνει ποιος άλλαξε το status και πότε.

## Πώς ενημερώνεται ένα συγκεκριμένο άτομο

Με **@mention** σε note του group, π.χ. `@Γιώργος 3 κλήσεις, 2 broken promises,
προτείνω stop services`. Το mention εμφανίζεται στο **Mentions inbox** του παραλήπτη.
Αυτός είναι ο τρόπος ανάθεσης — δεν δημιουργείται task.

## Τι άλλαξε στον κώδικα

- Αφαιρέθηκαν οι procedures `tasks.escalate`, `tasks.escalationDecide`, `tasks.escalationStory`.
- Αφαιρέθηκε το `EscalationPanel`, τα κουμπιά Escalate από το task dialog και το layout του escalated task.
- Αφαιρέθηκε το collection status `Escalated` από φίλτρα, χρώματα και labels του UI.
- Το Suggested Next Action προτείνει τώρα `Set Account Status to Critical` αντί για `Escalate to Account Manager`.

Η τιμή `Escalated` παραμένει στο enum της βάσης ώστε να μην χαθεί παλιό ιστορικό,
αλλά κανένα σημείο της εφαρμογής δεν την παράγει πλέον.

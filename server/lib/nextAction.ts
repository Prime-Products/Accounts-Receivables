/**
 * Suggested Next Action — deterministic rule engine.
 *
 * After every Log Call the collector sees a suggested next step based on the
 * group's data (overdue, aging, promises history, account status, recent
 * activity). Rules are evaluated top-down; the first match wins.
 */

export type NextActionKey =
  | "legal_review"
  | "mark_critical"
  | "request_payment_plan"
  | "send_soa"
  | "friendly_reminder"
  | "schedule_follow_up"
  | "monitor";

export interface NextActionSuggestion {
  action: NextActionKey;
  label: string;
  reason: string;
  /** Visual urgency for the UI badge. */
  severity: "info" | "warning" | "critical";
}

export interface NextActionInput {
  /** Effective account status of the group (watch status). */
  watchStatus: string | null; // "Problematic" | "Critical" | "On Hold" | "Legal" | null (Normal)
  /** Confirmation status recorded right now (after this call). */
  confirmationStatus: string | null; // "Not Contacted" | "Confirmed" | "Pending Follow-up" | "Broken" | "Kept"
  /** Outcome of the call that was just logged. */
  outcome: "Reached" | "No Answer";
  /** Total open (unpaid) balance in EUR. */
  openBalance: number;
  /** Overdue portion of the open balance in EUR. */
  overdueBalance: number;
  /** Overdue amount older than 90 days in EUR. */
  overdue90Plus: number;
  /** Broken promises count (all time). */
  promisesBroken: number;
  /** Kept promises count (all time). */
  promisesKept: number;
  /** Consecutive unanswered calls, counting this one (calls since last "Reached"). */
  consecutiveNoAnswer: number;
  /** Days since the last SOA / statement email was sent (null = never). */
  daysSinceLastStatement: number | null;
  /** Average days late from payment behavior (null = unknown). */
  avgDaysLate: number | null;
}

const LABELS: Record<NextActionKey, string> = {
  legal_review: "Legal review",
  mark_critical: "Set Account Status to Critical",
  request_payment_plan: "Request payment plan",
  send_soa: "Send SOA",
  friendly_reminder: "Friendly reminder",
  schedule_follow_up: "Schedule follow-up call",
  monitor: "Monitor — no action needed",
};

function make(action: NextActionKey, reason: string, severity: NextActionSuggestion["severity"]): NextActionSuggestion {
  return { action, label: LABELS[action], reason, severity };
}

export function suggestNextAction(d: NextActionInput): NextActionSuggestion {
  const overdueShare = d.openBalance > 0 ? d.overdueBalance / d.openBalance : 0;

  // 1. Already in legal — keep it there.
  if (d.watchStatus === "Legal") {
    return make("legal_review", "Ο λογαριασμός βρίσκεται ήδη σε Legal status — συνέχισε με τη νομική διαδικασία.", "critical");
  }

  // 2. Legal review: heavy 90+ overdue AND repeated broken promises.
  if (d.overdue90Plus > 0 && d.promisesBroken >= 3 && d.overdue90Plus >= 0.5 * Math.max(d.overdueBalance, 1)) {
    return make(
      "legal_review",
      `€${Math.round(d.overdue90Plus).toLocaleString()} είναι 90+ ημέρες ληξιπρόθεσμα και υπάρχουν ${d.promisesBroken} αθετημένες υποσχέσεις — αξιολόγησε νομική ενέργεια.`,
      "critical",
    );
  }

  // 3. Broken promise just recorded (or repeatedly) → hand the case to management by
  //    raising the account status; there is no separate escalation mechanism.
  if (d.confirmationStatus === "Broken" || d.promisesBroken >= 2) {
    return make(
      "mark_critical",
      d.confirmationStatus === "Broken"
        ? "Η υπόσχεση πληρωμής αθετήθηκε — βάλε τον λογαριασμό σε Critical για να το αναλάβει η διεύθυνση."
        : `${d.promisesBroken} αθετημένες υποσχέσεις στο ιστορικό — βάλε τον λογαριασμό σε Critical.`,
      "critical",
    );
  }

  // 4. Unreachable repeatedly → raise the status (someone else may have a contact).
  if (d.outcome === "No Answer" && d.consecutiveNoAnswer >= 3) {
    return make(
      "mark_critical",
      `${d.consecutiveNoAnswer} συνεχόμενες κλήσεις χωρίς απάντηση — βάλε τον λογαριασμό σε Critical ώστε να το δει η διεύθυνση.`,
      "warning",
    );
  }

  // 5. Problematic / Critical / On Hold with big old overdue → payment plan.
  if (
    (d.watchStatus === "Problematic" || d.watchStatus === "Critical" || d.watchStatus === "On Hold") &&
    d.overdue90Plus > 0 &&
    d.overdueBalance > 0
  ) {
    return make(
      "request_payment_plan",
      `Λογαριασμός ${d.watchStatus} με €${Math.round(d.overdue90Plus).toLocaleString()} σε 90+ ημέρες — πρότεινε διακανονισμό (payment plan).`,
      "warning",
    );
  }

  // 6. Chronic late payer with large overdue share → payment plan.
  if (overdueShare >= 0.7 && (d.avgDaysLate ?? 0) >= 60 && d.overdueBalance > 0) {
    return make(
      "request_payment_plan",
      `Το ${Math.round(overdueShare * 100)}% του υπολοίπου είναι ληξιπρόθεσμο και ο μέσος όρος καθυστέρησης είναι ${Math.round(d.avgDaysLate ?? 0)} ημέρες — πρότεινε διακανονισμό.`,
      "warning",
    );
  }

  // 7. No Answer (but not yet chronic) → SOA if stale, otherwise follow-up call.
  if (d.outcome === "No Answer") {
    if (d.overdueBalance > 0 && (d.daysSinceLastStatement === null || d.daysSinceLastStatement > 30)) {
      return make(
        "send_soa",
        d.daysSinceLastStatement === null
          ? "Δεν απάντησαν και δεν έχει σταλεί ποτέ SOA — στείλε statement of account."
          : `Δεν απάντησαν και το τελευταίο SOA στάλθηκε πριν ${d.daysSinceLastStatement} ημέρες — στείλε ενημερωμένο statement.`,
        "info",
      );
    }
    return make("schedule_follow_up", "Δεν απάντησαν — προγραμμάτισε νέα κλήση τις επόμενες 1–2 ημέρες.", "info");
  }

  // 8. Reached + Promise to Pay recorded → nothing else needed now.
  if (d.confirmationStatus === "Confirmed") {
    return make("monitor", "Καταγράφηκε Promise to Pay — παρακολούθησε την ημερομηνία πληρωμής (υπάρχει αυτόματο task).", "info");
  }

  // 9. Reached + Pending Follow-up → the follow-up task exists; optionally send SOA if stale.
  if (d.confirmationStatus === "Pending Follow-up") {
    if (d.overdueBalance > 0 && (d.daysSinceLastStatement === null || d.daysSinceLastStatement > 30)) {
      return make("send_soa", "Μέχρι το follow-up, στείλε ενημερωμένο SOA ώστε ο πελάτης να έχει πλήρη εικόνα.", "info");
    }
    return make("monitor", "Το follow-up είναι προγραμματισμένο — καμία επιπλέον ενέργεια προς το παρόν.", "info");
  }

  // 10. Reached, overdue exists, but no commitment → friendly reminder (email) to lock it in writing.
  if (d.overdueBalance > 0) {
    if (d.daysSinceLastStatement === null || d.daysSinceLastStatement > 30) {
      return make(
        "send_soa",
        "Έγινε επικοινωνία χωρίς δέσμευση πληρωμής — στείλε SOA για πλήρη εικόνα των ανοιχτών τιμολογίων.",
        "info",
      );
    }
    return make(
      "friendly_reminder",
      "Έγινε επικοινωνία χωρίς δέσμευση — στείλε friendly reminder email για γραπτή επιβεβαίωση.",
      "info",
    );
  }

  // 11. Nothing overdue.
  return make("monitor", "Δεν υπάρχει ληξιπρόθεσμο υπόλοιπο — καμία ενέργεια δεν απαιτείται.", "info");
}

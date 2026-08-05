/**
 * Certificate expiry reminder engine (Prime 247).
 *
 * Instrument calibration certificates lapse annually. The service agreement
 * requires the customer to be warned twice before that happens — 60 days out to
 * plan the swap around the vessel's itinerary, and 15 days out as a last call.
 * Rather than inventing a second inbox, each reminder lands as a row in the
 * existing task list, where the collections team already works.
 *
 * Idempotency is the whole game here: the job may run daily, be retried by the
 * platform after a 5xx, or be triggered manually from the UI on the same day.
 * Each reminder therefore carries a deterministic marker
 * `(Cert #<id> @<threshold>d)` in its description, and we refuse to write a
 * second task with the same marker. That makes the marker — not a mutable
 * "reminderSent" flag — the record of what has already been sent, so no
 * migration is needed and a deleted task can legitimately be regenerated.
 */
import * as db from "../db";
import * as opsDb from "../opsDb";
import { CERT_REMINDER_DAYS, daysUntilExpiry, reachedReminderThreshold } from "@shared/certificateExpiry";

/** Deterministic dedupe marker for one (certificate, threshold) pair. */
export function certReminderMarker(certificateId: number, thresholdDays: number): string {
  return `(Cert #${certificateId} @${thresholdDays}d)`;
}

/** Certificate id and threshold carried by a reminder task, or null. */
export function parseCertReminderMarker(description: string | null | undefined): { certificateId: number; thresholdDays: number } | null {
  if (!description) return null;
  const m = description.match(/\(Cert #(\d+) @(\d+)d\)/);
  if (!m) return null;
  return { certificateId: Number(m[1]), thresholdDays: Number(m[2]) };
}

export type CertReminderResult = {
  created: number;
  skipped: number;
  /** Markers written on this run — handy for debugging a cron execution. */
  createdMarkers: string[];
};

/**
 * Create the due certificate reminders.
 *
 * A certificate produces at most one task per threshold. We walk the thresholds
 * from the widest window inward so that a certificate which has already passed
 * 15 days still gets its 60-day task recorded if it was somehow missed — the
 * history then shows both warnings, matching what the contract promises.
 */
export async function runCertificateReminders(now = Date.now()): Promise<CertReminderResult> {
  const certificates = await opsDb.listCertificates();
  if (certificates.length === 0) return { created: 0, skipped: 0, createdMarkers: [] };

  const [assets, contracts, existingTasks] = await Promise.all([
    opsDb.listAssets(),
    opsDb.listOpsContracts(),
    db.listTasks(),
  ]);
  const assetById = new Map(assets.map(a => [a.id, a]));
  const contractById = new Map(contracts.map(c => [c.id, c]));
  const customers = await db.listCustomers();
  const customerById = new Map(customers.map(c => [c.id, c]));

  /** Markers already present in the task list — the source of truth for "sent". */
  const seen = new Set<string>();
  for (const t of existingTasks) {
    const parsed = parseCertReminderMarker(t.description);
    if (parsed) seen.add(certReminderMarker(parsed.certificateId, parsed.thresholdDays));
  }

  let created = 0;
  let skipped = 0;
  const createdMarkers: string[] = [];

  for (const cert of certificates) {
    const reached = reachedReminderThreshold(cert.expiryDate, now);
    if (reached === null) continue; // still more than 60 days of life left

    const asset = assetById.get(cert.assetId);
    if (!asset) { skipped++; continue; } // orphan certificate, nothing to act on

    // The customer comes from the contract the equipment belongs to. Without a
    // contract we cannot file the task against an account, so we skip rather
    // than guess — the equipment page still shows the expiry.
    const contract = asset.contractId ? contractById.get(asset.contractId) : undefined;
    if (!contract) { skipped++; continue; }
    const customer = customerById.get(contract.customerId);

    // Widest window first, so the 60-day record precedes the 15-day one.
    for (const threshold of [...CERT_REMINDER_DAYS].sort((a, b) => b - a)) {
      const days = daysUntilExpiry(cert.expiryDate, now);
      if (days > threshold) continue;

      const marker = certReminderMarker(cert.id, threshold);
      if (seen.has(marker)) { skipped++; continue; }

      const expiryLabel = new Date(cert.expiryDate).toISOString().slice(0, 10);
      const urgency = threshold === 15 ? "FINAL WARNING" : "Advance notice";
      await db.createTask({
        customerId: contract.customerId,
        type: "Certificate Expiry",
        title: `Certificate expiring in ${threshold}d: ${asset.name} (S/N ${asset.serialNumber})`,
        description:
          `${urgency} — certificate ${cert.certificateNumber} for ${asset.name} ` +
          `(S/N ${asset.serialNumber}) expires on ${expiryLabel}. ` +
          `Arrange calibrated replacement under contract ${contract.contractNumber}.\n` +
          marker,
        // Due on the day the threshold is reached, so the task surfaces immediately
        // and ages naturally in the list instead of hiding in the future.
        dueDate: cert.expiryDate - threshold * 24 * 60 * 60 * 1000,
        customerGroup: customer ? (customer.customerGroup ?? "").trim() || customer.name : null,
      } as any);
      seen.add(marker);
      createdMarkers.push(marker);
      created++;
    }
  }

  return { created, skipped, createdMarkers };
}

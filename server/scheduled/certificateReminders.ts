/**
 * Heartbeat callback: daily certificate reminder sweep.
 *
 * The platform POSTs here once a day (see `manus-heartbeat create`, project-level
 * cron in §4a of the periodic-updates reference). All the work lives in
 * `runCertificateReminders`, which is idempotent — reminders are deduped by the
 * marker written into each task's description, so a retried or double-fired run
 * cannot produce duplicate tasks.
 */
import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { runCertificateReminders } from "../lib/certificateReminders";

export async function certificateRemindersHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) {
      return res.status(403).json({ error: "cron-only" });
    }

    const result = await runCertificateReminders();
    console.log(
      `[cron] certificate reminders: created=${result.created} skipped=${result.skipped}` +
        (result.createdMarkers.length ? ` markers=${result.createdMarkers.join(",")}` : ""),
    );
    return res.json({ ok: true, ...result });
  } catch (err: any) {
    // JSON-encode the failure so the platform's Investigate flow shows it verbatim.
    return res.status(500).json({
      error: err?.message ?? String(err),
      stack: err?.stack,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Heartbeat callback: auto-generate the smart per-customer collection
 * forecast at the start of each month. Mounted at /api/scheduled/generateForecast.
 * Created as a project-level Heartbeat cron (see todo.md / deployment notes).
 */
import type { Request, Response } from "express";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import { generateMonthlyForecast } from "./lib/smartForecast";

export async function generateForecastHandler(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!(user as any).isCron) {
      res.status(403).json({ error: "cron-only endpoint" });
      return;
    }
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const result = await generateMonthlyForecast(year, month, { useAi: true });
    await db.addAudit({
      action: "Auto-generate Smart Forecast",
      entityType: "forecast",
      entityId: `${year}-${month}`,
      details: `Scheduled run: ${result.customers} customers (${result.aiCount} AI, ${result.heuristicCount} heuristic)`,
    });
    res.json({ ok: true, year, month, ...result });
  } catch (error) {
    const err = error as Error;
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      context: { url: req.originalUrl },
      timestamp: new Date().toISOString(),
    });
  }
}

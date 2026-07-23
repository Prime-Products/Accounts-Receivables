/**
 * Smart Monthly Collection Forecast engine.
 *
 * At the start of each month (or on demand) it scans all customers with open
 * invoices due within the month (plus already-overdue balances), builds a
 * payment behavior profile per customer, asks the built-in LLM for an
 * expected-collection suggestion (falling back to a statistical heuristic),
 * and upserts one forecast entry per customer. User adjustments are preserved.
 */
import { invokeLLM } from "../_core/llm";
import * as db from "../db";
import {
  aggregateGroupBehavior,
  BehaviorRow,
  buildBehaviorProfile,
  GroupBehavior,
  heuristicWithHistory,
  isOpenInvoice,
  monthRange,
  outstanding,
  PaymentBehaviorProfile,
} from "./arLogic";

const eur = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export interface CustomerForecastInput {
  customerId: number;
  customerName: string;
  dueThisMonth: number;
  overdue: number;
  profile: PaymentBehaviorProfile;
  /** Historical stats from last-year payment allocations (customer level). */
  history?: { avgDaysLate: number; medianDaysLate: number; payments: number } | null;
  /** Group-level behavior (avg/median days late across the customer group). */
  groupBehavior?: GroupBehavior | null;
}

export interface ForecastSuggestion {
  amount: number;
  reasoning: string;
  source: "ai" | "heuristic";
}

/** Ask the built-in LLM for expected collections for a batch of customers. */
async function aiSuggestBatch(inputs: CustomerForecastInput[], year: number, month: number): Promise<Map<number, ForecastSuggestion>> {
  const result = new Map<number, ForecastSuggestion>();
  if (inputs.length === 0) return result;

  const lines = inputs.map(c =>
    JSON.stringify({
      customerId: c.customerId,
      name: c.customerName,
      dueThisMonthEur: Math.round(c.dueThisMonth),
      overdueEur: Math.round(c.overdue),
      avgDelayDays: c.profile.avgDelayDays,
      collectionRatePct: Math.round(c.profile.collectionRate * 100),
      recentPaymentRatio: c.profile.recentPaymentRatio,
      promiseReliabilityPct: c.profile.promiseReliability === null ? null : Math.round(c.profile.promiseReliability * 100),
      paidInvoices: c.profile.paidInvoiceCount,
      openInvoices: c.profile.openInvoiceCount,
      lastYearAvgDaysLate: c.history ? c.history.avgDaysLate : null,
      lastYearMedianDaysLate: c.history ? c.history.medianDaysLate : null,
      lastYearPayments: c.history ? c.history.payments : null,
      groupAvgDaysLate: c.groupBehavior ? c.groupBehavior.avgDaysLate : null,
      groupMedianDaysLate: c.groupBehavior ? c.groupBehavior.medianDaysLate : null,
    }),
  );

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a senior credit controller forecasting monthly cash collections for an accounts receivable department. " +
          "For each customer you receive the amount falling due this month (EUR), the already-overdue balance (EUR), and payment-behavior statistics. " +
          "lastYearMedianDaysLate/lastYearAvgDaysLate come from real payment allocations of the last 12 months (negative = pays before due date); " +
          "groupMedianDaysLate is the behavior of the customer's whole group — prefer these real statistics when present. " +
          "Estimate realistically how much the company will actually collect from each customer during the month. " +
          "Customers with long average delays or low collection rates typically pay only a fraction of what they owe. " +
          "Never exceed dueThisMonthEur + overdueEur for a customer. Reply in JSON only.",
      },
      {
        role: "user",
        content: `Forecast month: ${year}-${String(month).padStart(2, "0")}\nCustomers (one JSON object per line):\n${lines.join("\n")}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "collection_forecast",
        strict: true,
        schema: {
          type: "object",
          properties: {
            forecasts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  customerId: { type: "integer" },
                  expectedEur: { type: "number", description: "Realistic expected collection in EUR for the month" },
                  reasoning: { type: "string", description: "One-sentence justification" },
                },
                required: ["customerId", "expectedEur", "reasoning"],
                additionalProperties: false,
              },
            },
          },
          required: ["forecasts"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : "";
  let parsed: { forecasts: { customerId: number; expectedEur: number; reasoning: string }[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    // Truncated output: salvage complete objects from the array.
    const salvaged: { customerId: number; expectedEur: number; reasoning: string }[] = [];
    const re = /\{[^{}]*"customerId"\s*:\s*(\d+)[^{}]*"expectedEur"\s*:\s*([\d.]+)[^{}]*"reasoning"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      salvaged.push({ customerId: Number(m[1]), expectedEur: Number(m[2]), reasoning: m[3] });
    }
    if (salvaged.length === 0) throw new Error("AI response unparsable and no objects salvageable");
    parsed = { forecasts: salvaged };
  }
  for (const f of parsed.forecasts) {
    const input = inputs.find(i => i.customerId === f.customerId);
    if (!input) continue;
    const cap = input.dueThisMonth + input.overdue;
    const amount = Math.max(0, Math.min(Number(f.expectedEur) || 0, cap));
    result.set(f.customerId, { amount: Math.round(amount * 100) / 100, reasoning: f.reasoning, source: "ai" });
  }
  return result;
}

/** Run AI suggestions in small batches so responses stay within token limits. */
async function aiSuggestChunked(inputs: CustomerForecastInput[], year: number, month: number): Promise<Map<number, ForecastSuggestion>> {
  const out = new Map<number, ForecastSuggestion>();
  const BATCH = 20;
  for (let i = 0; i < inputs.length; i += BATCH) {
    const chunk = inputs.slice(i, i + BATCH);
    try {
      const res = await aiSuggestBatch(chunk, year, month);
      for (const [k, v] of Array.from(res.entries())) out.set(k, v);
    } catch (e) {
      console.warn(`[SmartForecast] AI batch ${i / BATCH + 1} failed, heuristic fallback for ${chunk.length} customers:`, e);
    }
  }
  return out;
}

/**
 * Generate (or refresh) the per-customer forecast for a month.
 * Idempotent: existing user-adjusted amounts are preserved.
 */
export async function generateMonthlyForecast(year: number, month: number, opts?: { useAi?: boolean }) {
  const now = Date.now();
  const { start, end } = monthRange(year, month);
  const [customers, invoices, receipts, promises, behaviorRows] = await Promise.all([
    db.listCustomers(),
    db.listInvoices(),
    db.listReceipts(),
    db.listPromises(),
    db.listPaymentBehaviorWithGroup().catch(() => [] as Awaited<ReturnType<typeof db.listPaymentBehaviorWithGroup>>),
  ]);

  const behaviorByCustomer = new Map(behaviorRows.map(r => [r.customerId, r]));
  const groupStats = aggregateGroupBehavior(behaviorRows as BehaviorRow[]);

  const inputs: CustomerForecastInput[] = [];
  for (const c of customers) {
    const custInvoices = invoices.filter(i => i.customerId === c.id);
    const open = custInvoices.filter(isOpenInvoice);
    if (open.length === 0) continue;
    // Due within the forecast month (not yet overdue at month start) + already overdue before month start.
    const dueThisMonth = open.filter(i => i.dueDate >= start && i.dueDate < end).reduce((s, i) => s + outstanding(i), 0);
    const overdue = open.filter(i => i.dueDate < start).reduce((s, i) => s + outstanding(i), 0);
    if (dueThisMonth + overdue < 0.01) continue;
    const profile = buildBehaviorProfile(
      custInvoices,
      receipts.filter(r => r.customerId === c.id),
      promises.filter(p => p.customerId === c.id),
      now,
    );
    const hist = behaviorByCustomer.get(c.id) ?? null;
    const gb = c.customerGroup ? groupStats.get(c.customerGroup.trim()) ?? null : null;
    inputs.push({
      customerId: c.id,
      customerName: c.name,
      dueThisMonth,
      overdue,
      profile,
      history: hist ? { avgDaysLate: hist.avgDaysLate, medianDaysLate: hist.medianDaysLate, payments: hist.payments } : null,
      groupBehavior: gb,
    });
  }

  // Rank by exposure and use AI for the top customers (cost control); heuristic for the rest.
  inputs.sort((a, b) => b.dueThisMonth + b.overdue - (a.dueThisMonth + a.overdue));
  const AI_LIMIT = 40;
  const aiTargets = opts?.useAi === false ? [] : inputs.slice(0, AI_LIMIT);

  let aiResults = new Map<number, ForecastSuggestion>();
  if (aiTargets.length > 0) {
    aiResults = await aiSuggestChunked(aiTargets, year, month);
  }

  let created = 0;
  for (const input of inputs) {
    const ai = aiResults.get(input.customerId);
    // Fall back to group-level history when the customer has none of its own.
    const effectiveHistory =
      input.history ??
      (input.groupBehavior
        ? { avgDaysLate: input.groupBehavior.avgDaysLate, medianDaysLate: input.groupBehavior.medianDaysLate, payments: input.groupBehavior.payments }
        : null);
    const suggestion: ForecastSuggestion = ai ?? {
      ...heuristicWithHistory(input.dueThisMonth, input.overdue, input.profile, effectiveHistory),
      source: "heuristic" as const,
    };
    await db.upsertForecastEntry({
      year,
      month,
      customerId: input.customerId,
      dueAmount: eur(input.dueThisMonth + input.overdue),
      overdueAmount: eur(input.overdue),
      aiSuggestedAmount: eur(suggestion.amount),
      aiReasoning: `[${suggestion.source}] ${suggestion.reasoning}`,
      expectedAmount: eur(suggestion.amount),
    });
    created += 1;
  }

  return { customers: created, aiCount: aiResults.size, heuristicCount: created - aiResults.size };
}

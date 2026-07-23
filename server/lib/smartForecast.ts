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
  buildBehaviorProfile,
  heuristicExpectedAmount,
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
    }),
  );

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content:
          "You are a senior credit controller forecasting monthly cash collections for an accounts receivable department. " +
          "For each customer you receive the amount falling due this month (EUR), the already-overdue balance (EUR), and payment-behavior statistics. " +
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
  const parsed = JSON.parse(text) as { forecasts: { customerId: number; expectedEur: number; reasoning: string }[] };
  for (const f of parsed.forecasts) {
    const input = inputs.find(i => i.customerId === f.customerId);
    if (!input) continue;
    const cap = input.dueThisMonth + input.overdue;
    const amount = Math.max(0, Math.min(Number(f.expectedEur) || 0, cap));
    result.set(f.customerId, { amount: Math.round(amount * 100) / 100, reasoning: f.reasoning, source: "ai" });
  }
  return result;
}

/**
 * Generate (or refresh) the per-customer forecast for a month.
 * Idempotent: existing user-adjusted amounts are preserved.
 */
export async function generateMonthlyForecast(year: number, month: number, opts?: { useAi?: boolean }) {
  const now = Date.now();
  const { start, end } = monthRange(year, month);
  const [customers, invoices, receipts, promises] = await Promise.all([
    db.listCustomers(),
    db.listInvoices(),
    db.listReceipts(),
    db.listPromises(),
  ]);

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
    inputs.push({ customerId: c.id, customerName: c.name, dueThisMonth, overdue, profile });
  }

  // Rank by exposure and use AI for the top customers (cost control); heuristic for the rest.
  inputs.sort((a, b) => b.dueThisMonth + b.overdue - (a.dueThisMonth + a.overdue));
  const AI_LIMIT = 40;
  const aiTargets = opts?.useAi === false ? [] : inputs.slice(0, AI_LIMIT);

  let aiResults = new Map<number, ForecastSuggestion>();
  if (aiTargets.length > 0) {
    try {
      aiResults = await aiSuggestBatch(aiTargets, year, month);
    } catch (e) {
      console.warn("[SmartForecast] AI suggestion failed, using heuristic for all:", e);
    }
  }

  let created = 0;
  for (const input of inputs) {
    const ai = aiResults.get(input.customerId);
    const suggestion: ForecastSuggestion = ai ?? {
      ...heuristicExpectedAmount(input.dueThisMonth, input.overdue, input.profile),
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

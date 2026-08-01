# AR Pro AI Assistant — implementation notes

## Goal
Floating chat launcher (bottom-right) that answers questions about the user's own AR
data and about how AR Pro works. Greek/English, read-only (no mutations).

## LLM plumbing (from webdev-llm-integration skill)
- `import { invokeLLM } from "../_core/llm"` — server side only.
- Signature: `invokeLLM({ model?, messages, tools?, tool_choice?, response_format?, thinking?/reasoning? })`
- Response text: `response.choices[0].message.content` (string or array of `{type:"text",text}`).
- Existing precedent in project: `server/routers/ar.ts` group AI summary uses
  `model: "gemini-2.5-flash"` with a Greek system prompt + JSON facts as the user message.
  `server/lib/smartForecast.ts` also calls invokeLLM.
- Frontend markdown rendering: `Streamdown` from `streamdown` (already a dependency).
- Pre-built `client/src/components/AIChatBox.tsx` exists: props `{ messages, onSendMessage,
  isLoading, placeholder, className, height }`, message type `{role, content}`.

## Data helpers available (server/db.ts)
listCustomers, listInvoices, listInstallments, listReceipts/listReceiptsInRange,
sumReceiptsInRange, sumInvoicedInRange, listForecastEntries(year,month),
sumForecastExpected, listPaymentBehaviorWithGroup, listPromises, listTasks({statuses}),
listGroupWatchStatuses, listGroupConfirmationStatuses, listVessels, listPaymentContacts,
listWireTransfersByStatus, listReceivedWireTransfersInRange, listActivityLog(group),
listGroupNotes(group), listTeamMembers.

## Business helpers (server/lib/arLogic.ts)
outstanding, outstandingOriginal, isOpenInvoice, toEur, computeAging, daysOverdue,
agingBucket, monthRange, computeDso, buildForecast, buildBehaviorProfile,
computeCreditRating, aggregateGroupBehavior, endOfCurrentMonth (in ar.ts helpers).
Group key convention used everywhere: `(customer.customerGroup ?? "").trim() || customer.name`.

## Design
- New router `server/routers/assistant.ts` with `ask` mutation:
  input `{ question, history }` → builds a compact snapshot of portfolio facts +
  resolves any group/company/vessel mentioned in the question, then calls invokeLLM
  with an app-knowledge system prompt. Returns `{ answer, usedFacts }`.
- App knowledge lives in `server/lib/assistantKnowledge.ts` (what each page does,
  the statuses, the forecast rules, the aging buckets, how allocation works).
- Frontend `client/src/components/AssistantWidget.tsx` mounted once in DashboardLayout:
  floating button bottom-right, sheet/panel with chat, suggested questions.

## Status (implemented)
- `server/lib/assistantKnowledge.ts` — APP_KNOWLEDGE: navigation map + business rules
  (group key, aging buckets, statuses, forecast, DSO, promises) + answering style.
- `server/lib/assistantFacts.ts` — `buildPortfolioSnapshot()` (AR balance, overdue,
  aging, DSO, month target vs collected, workload, status counts, top 10 overdue
  groups), `buildGroupFacts()`, `buildVesselFacts()`, `resolveMentions()` with
  accent-insensitive `norm()` / `mentions()` matching.
- `server/routers/assistant.ts` — `intro` query (suggested questions) and `ask`
  mutation (snapshot + resolved mentions → gemini-2.5-flash, audit logged).
  Registered in `server/routers.ts` as `assistant`.
- `client/src/components/AssistantWidget.tsx` — floating "Ask AR Pro" pill
  bottom-right, Ctrl/Cmd+J toggle, resizable panel (drag top-left grip, size and
  thread persisted in localStorage), Streamdown markdown answers, suggested
  question chips, clear-thread button. Mounted in `DashboardLayout`.
- Verified: launcher visible on Dashboard and Address Book; typecheck clean.

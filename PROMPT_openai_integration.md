# AEGIS — OpenAI integration plan

Written to be handed to a fresh Claude Code session, in the same spirit as
`PROMPT_multi_tenant_modules.md`. Project: `C:\Users\njunj\web\aegis`.

The app already *looks* AI-powered in six places. None of them call a model —
every one is a literal string in `src/lib/data/*.ts`. This plan replaces them,
in an order that puts the surfaces with real data behind them first.

---

## 1. Where AI is faked today

| Surface | Rendered by | Data comes from | Real data behind it? |
|---|---|---|---|
| Dashboard "AI Insights" card | `src/components/dashboard/ai-insights-card.tsx:10` | `insight` string, `src/lib/data/dashboard.ts:105,191,272` | **Yes** — revenue is a live ledger aggregation |
| Mail priority (rail + list + dashboard tile) | `mail-folder-rail.tsx:64`, `message-list.tsx:61` | `MailMessage.priority`, `src/lib/data/mail.ts` | No — fixtures |
| Mail "AI Summary" panel | `message-detail.tsx:136` | `MailMessage.aiSummary` | No — fixtures |
| Mail action items | `message-detail.tsx:138` | `MailMessage.actionItems` | No — fixtures |
| Suggested replies | `message-detail.tsx:243` | `MailMessage.replies` | No — fixtures |
| Compose "AI Assist" drafts | `compose-modal.tsx:219` | `COMPOSE_DRAFT_SUGGESTIONS` | No — fixtures |

Two facts shape everything below:

- **The dashboard is the only surface sitting on real data.** Revenue comes from
  the `transactions` ledger, bookings from `bookings`, and stock from
  `inventoryItems` / `stockMoves`. A generated insight there would be describing
  something true.
- **Mail is entirely fixtures.** `src/lib/data/mail.ts` is 293 lines of sample
  threads with no Mongo collection and no Gmail connection. Generating summaries
  over it produces real API calls describing fake email. That is fine for a demo
  and misleading for anything else — see the decision in §7.

---

## 2. Principles

These follow the conventions the codebase already enforces; don't invent new ones.

1. **The key never leaves the server.** `OPENAI_API_KEY` is read only inside
   modules marked `import "server-only"`, exactly like `src/lib/dal/*`. No
   `NEXT_PUBLIC_` variant, ever, and no client-side fetch to OpenAI.
2. **Every call is tenant-scoped and entitlement-gated.** Generation runs behind
   a server action that calls `requireModule(...)` first, the same boundary
   `createBookingAction` and `recordStockMoveAction` use. A hand-crafted POST
   must not be able to bill the account.
3. **Generated text is stored, not re-derived.** Server components re-render on
   every navigation and every `router.refresh()`. Calling the model from a
   render path bills once per page view. Output goes into a tenant-scoped Mongo
   collection keyed by a hash of its inputs.
4. **Absence of a key is a supported state.** With `OPENAI_API_KEY` unset, every
   surface falls back to the string it shows today. The app must build, run and
   demo with no key configured.
5. **A model failure is never a page failure.** Timeouts, rate limits and refusals
   degrade to the cached or static copy plus a quiet "couldn't refresh" note.

---

## 3. Phase 0 — plumbing

Small, and everything else depends on it.

```
npm install openai
```

Add to `.env.local` and `.env.local.example`:

```
# OpenAI. Leave blank to run every AI surface on its static fallback copy.
OPENAI_API_KEY=
OPENAI_MODEL_FAST=
OPENAI_MODEL_REASONING=
```

Naming the models by env var rather than hard-coding them means swapping model
tiers is a config change. Pick a cheap small model for per-message triage and a
larger one for the narrative insight; check current pricing before committing,
since the tiers move.

New files:

- **`src/lib/ai/client.ts`** — `import "server-only"`. Exports
  `getOpenAI(): OpenAI | null`, returning `null` when the key is unset, and a
  module-level singleton so the client isn't rebuilt per request (same shape as
  `src/lib/db/mongodb.ts`).
- **`src/lib/ai/generate.ts`** — one wrapper every caller goes through. It owns
  the timeout, the retry-once-on-429, the token ceiling, and JSON-schema
  structured output so parsing can't throw on prose. It returns a discriminated
  result (`{ ok: true, data } | { ok: false, reason }`) rather than throwing, so
  call sites are forced to handle the fallback.
- **`src/lib/dal/ai-cache.ts`** — `import "server-only"`, built on `tenantScope`.
  Collection `aiOutputs`, documents `{ businessId, kind, cacheKey, payload,
  model, promptVersion, createdAt }`, unique index on
  `{ businessId, kind, cacheKey }`. `cacheKey` is a hash of the exact inputs;
  `promptVersion` is bumped by hand when a prompt changes so old output is
  ignored rather than served.

Definition of done: `npx tsc --noEmit`, `npx eslint` and `npx next build` clean
with the key both set and unset.

---

## 4. Phase 1 — Dashboard AI Insights (do this first)

The highest-value surface and the only one describing something true.

**Input.** A compact, numbers-only summary assembled server-side for the active
range: revenue total and delta from `buildLedgerRevenue`, booking counts by
status, items below reorder point, and the largest stock movements. No customer
names, no email bodies — a few dozen tokens of figures. Keeping the input this
narrow is what makes the cost trivial and the privacy question in §7 easy.

**Output.** Two or three sentences of commentary, matching the tone of the
strings currently in `src/lib/data/dashboard.ts`.

**Caching.** `cacheKey` = hash of the figures object. Same numbers, same
insight, no second call. The figures only change when the ledger changes, so a
business viewing its dashboard fifty times a day pays for one generation.

**Rendering.** Wrap `<AiInsightsCard />` in `<Suspense>` in
`src/app/(app)/dashboard/page.tsx` and make it an async server component. The
dashboard paints immediately and the card streams in; a cache hit is instant
anyway. Do **not** block the page on the model.

**Fallback.** Cache miss and generation failure both render today's static
string for that range. The user sees a slightly generic insight, not an error.

---

## 5. Phase 2 — Mail triage (priority, summary, action items)

This is where the real work is, and it is gated on a decision (§7).

The model call itself is easy: one message in, `{ priority, summary,
actionItems[] }` out, via structured output against a JSON schema that pins
`priority` to the existing `MailPriority` union. The hard part is that **there
is nowhere to put the result.** Mail has no Mongo collection and no ingest step.

So Phase 2 is really two pieces, in order:

1. **Move mail off fixtures.** A `messages` collection reached through
   `tenantScope`, a `src/lib/dal/mail.ts` mirroring `src/lib/dal/bookings.ts`,
   and a seed path that loads `src/lib/data/mail.ts` the way `seedBookings` loads
   `BOOKING_SEEDS`. This is worth doing regardless of AI.
2. **Enrich on write, never on read.** Triage runs once per message, when it is
   ingested (seeded now, synced from Gmail later), and the result is stored on
   the document. The mail screens keep reading fields off `MailMessage` and don't
   know a model was involved. `aiSummary`, `priority` and `actionItems` become
   nullable, with the UI hiding the panel rather than showing an empty one.

Batching matters here: triage the inbox in one call per batch of messages rather
than one call each, and cap the body text you send.

---

## 6. Phase 3 — Suggested replies and Compose AI Assist

User-triggered, so cost is naturally bounded and no caching layer is needed.

- **Suggested replies** (`message-detail.tsx:243`): today three canned strings.
  Generate three short reply *options* from the thread when the message is
  opened, cached per message id, or on an explicit "suggest replies" click.
- **Compose AI Assist** (`compose-modal.tsx:219`): the header already promises
  "Drafts from your inbox context". Replace `COMPOSE_DRAFT_SUGGESTIONS` with a
  server action taking the recipient plus a one-line intent and streaming a draft
  into the textarea. Stream it — a 3-second frozen modal reads as broken, and the
  compose textarea is already controlled state so appending tokens is easy.

Keep the "Send reply" path exactly as it is: the model drafts, the person sends.

---

## 7. Decisions to make before Phase 2

Both are called out here rather than defaulted silently.

**7.1 — Does tenant email content go to OpenAI, and who says yes?**
Phase 1 sends aggregate numbers, which is uncontroversial. Phase 2 sends customer
correspondence to a third party. The codebase already has the right mechanism
for this: per-business entitlements set by an AEGIS admin. Options:

- Add an `ai` optional module key alongside `bookings`/`inventory`/`crm`/`fleet`,
  so AI is sold and switched on per business and `requireModule("ai")` gates
  every call. Fits the existing model exactly and gives the admin screen a
  natural home for the toggle.
- Or a plain `aiEnabled` boolean on the business document — simpler, but a
  second entitlement concept doing the same job as the first.

I'd take the first. Either way, confirm OpenAI's data-retention and
training terms for API traffic against the current policy before real customer
mail flows through it.

**7.2 — AI over fixtures, or wait for Gmail?**
Running Phase 2 against `src/lib/data/mail.ts` produces real, billed calls that
summarise invented threads. Reasonable as a demo of the pipeline; misleading if
anyone reads the output as insight. If Gmail is close, do the Mongo move
(Phase 2 step 1) now and hold the triage until real mail lands.

---

## 8. Cost and rate control

- **Cap tokens per call** in `generate.ts`, not per call site.
- **Per-business monthly counter** in Mongo, incremented in the wrapper and
  checked before dispatch. Over the cap, calls degrade to fallback copy rather
  than failing — a spending bug should quietly stop spending, not break the app.
- **Log every call**: business, kind, model, token counts, latency, outcome. One
  collection, tenant-scoped. Without this the first surprise invoice is
  unattributable.
- **Structured outputs everywhere** a value feeds logic (priority especially).
  Free-form parsing of an enum will eventually return "Very Urgent".

---

## 9. Suggested order

| Phase | Scope | Blocked by |
|---|---|---|
| 0 | Key, client, wrapper, cache DAL, fallback plumbing | — |
| 1 | Dashboard insight, Suspense-streamed, cached | 0 |
| 2a | Mail into Mongo (`messages` + `dal/mail.ts` + seed) | — (independent, do anytime) |
| 2b | Message triage on ingest | 0, 2a, decision 7.1 |
| 3 | Suggested replies, compose drafting | 0, 2a |
| 4 | *Optional:* inventory commentary — reorder suggestions off real stock and movement data. Not in the Claude Design canvas, so it needs a design pass first. | 0 |

Phase 0 + 1 is the small, self-contained slice that makes the app genuinely
AI-backed on its most visible card, with no privacy question and negligible cost.
Start there.

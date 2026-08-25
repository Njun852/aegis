# AEGIS — session handoff

Context for picking this up in a new window. Project: `C:\Users\njunj\web\aegis`, a Next.js 16 App Router app, imported from a Claude Design canvas ("AEGIS AI Design System" / "Dashboard.dc.html" project) and built out from there.

## What's live and working

- **Dashboard** (`/dashboard`) — KPI row, revenue chart, bookings, email/alerts/ads summaries, AI insight. The date-range picker ("May 01 – May 31, 2026", "Apr 01 – Apr 30, 2026", "Q2 2026") is real — it drives all of these off `DASHBOARD_RANGES` in `src/lib/data/dashboard.ts` via `DashboardRangeProvider`, not just its own label.
- **Mail** (`/mail`) — AI-prioritized inbox (folder rail, priority filter, search), thread detail with working "Send reply" (it actually appends the reply into the visible conversation as its own message card, not just a fake button), and a Compose modal with three "AI Assist" draft suggestions tied to real threads.
- **Auth** — a sign-in gate (`src/components/auth/`) in front of the whole `(app)` route group. Redesigned to match the latest version pulled from Claude Design: single centered card, Username + Password only (no Google SSO button, no remember-me — those were in an earlier design iteration and got removed). **This is fake auth** — `AuthProvider` is in-memory only (`isAuthed` boolean), any non-empty username/password signs in, and refreshing the page logs you out. Test with anything, e.g. `ahmed.ben` / `anything`.

All three: `npx tsc --noEmit`, `npx eslint`, `npx next build` are clean as of the last change.

## What's scaffolding-only, not real

- **MongoDB**: running locally, confirmed reachable (`mongodb://localhost:27017`, `.env.local` has `MONGODB_DB_NAME=aegis`), both connection helpers in `src/lib/db/` (native driver + Mongoose) verified to actually connect. **Zero collections exist and nothing in the app calls either helper.** Every screen still runs on static data in `src/lib/data/*.ts`.
- **Auth persistence, real accounts, real sessions** — none of this exists yet (see above).
- **Gmail integration** — Mail is entirely sample data (`src/lib/data/mail.ts`), not connected to anything real.

## Bugs fixed this session, worth knowing about if you see the pattern elsewhere

- Long unbroken text (a URL, a token, a hash) in mail thread content used to overflow its box and get silently clipped — fixed by adding `overflowWrap: "anywhere"` to the body/subject/summary text in `message-detail.tsx`, `insight-panel.tsx`, and `message-list.tsx`. Any new component that renders free-form user- or AI-generated text should get the same treatment.
- Sidebar collapse-width and dashboard grid track-stretching were both fixed with `minWidth: 0` / `minmax(0, …)` — the general lesson: flex/grid children need explicit `min-width: 0` to actually shrink instead of forcing their container wider.

## Deliverables produced this session (not yet acted on)

- **`aegis-client-report.pptx`** — a 7-slide client progress report (sent to the user directly, not saved in the repo).
- **`PROMPT_multi_tenant_modules.md`** (repo root) — a full spec for the two big pieces of unbuilt architecture: per-business module entitlements (Dashboard/Mail/Ads always on; Bookings/Inventory/CRM/Fleet optional per business) and a real sales/revenue ledger (a normalized `transactions` collection that Dashboard KPIs aggregate over, fed by `Sale` records). Written to be handed to a fresh Claude Code session as a starting prompt.
- **`PROMPT_business_management_ui.md`** (repo root) — a ready-to-paste prompt for claude.ai/design, for the internal admin screen that manages which optional modules each business has. Not yet sent to Claude Design.

## Architecture decisions made (in conversation, not yet built)

- Multi-tenancy: **one shared codebase and server**, tenant resolved from the logged-in account (not subdomains).
- Data isolation: **one MongoDB database per tenant, same server** (leaning on the `dbName` param `mongoose.ts` already takes), over a single DB with a `tenantId` column — safer against a missed-filter data leak.
- Module entitlements: **admin-set**, not self-service (a plan/onboarding decision, not a customer-facing toggle) — at least for now.
- Revenue: **never a stored number** — always an aggregation over a shared ledger, so the dashboard works correctly for any combination of enabled modules without special-casing.

## Explicitly still open — decide these deliberately, don't default silently

1. For a module a business doesn't have: hide it from the sidebar entirely, or show it grayed-out like today's old "Coming Soon" treatment (upsell tease)?
2. Revenue recognized the moment a Sale record is created, or gated until it's marked paid?

Both are called out in `PROMPT_multi_tenant_modules.md` with the reasoning for each side.

## Dev environment

- Dev server: `.claude/launch.json` has an `aegis-dev` entry (`npm --prefix C:\Users\njunj\web\aegis run dev`, port 3000).
- `.env.local` has real values for `MONGODB_URI`/`MONGODB_DB_NAME`; the OAuth/OpenAI/NextAuth vars are still blank placeholders.

## Natural next step

Either paste `PROMPT_multi_tenant_modules.md` into a fresh session to start building real auth + entitlements + the ledger, or take `PROMPT_business_management_ui.md` to claude.ai/design first to get the admin UI designed before wiring it up.

# AEGIS handoff

Written 26 September 2026, replacing a handoff that had gone badly out of date.
Read this first, then `DATABASE_AND_AUTH_doc.md` for the database,
authentication, authorization and integration detail.

**Next work: the Fleet and CRM modules.** Everything below is background for
that; the brief is the last section.

---

## What AEGIS is

A multi-business operations app for AUTOBLITZ (an auto service shop in Davao)
and the other businesses the owner runs. Next.js 16 (App Router, Turbopack),
MongoDB, NextAuth v5, OpenAI. One codebase and one database serve every tenant.

It is built against a **frozen acceptance checklist** in three paid stages:
Stage 1 development progress (passed), Stage 2 integrated v1.0, Stage 3
sixty-day retention. The checklist is at
`C:\Users\njunj\Downloads\AEGIS_Final_Development_Payment_Acceptance_Checklist.pdf`.
New requirements are meant to be agreed by both parties, so say plainly when
something falls outside it.

## Ground rules, learned the hard way

- **Never present invented figures as real.** Sample data is labelled DEMO
  DATA; live data states its source and when it was last read. Numbers that
  cannot be compared (different result types) read "mixed" rather than being
  added together.
- **Read-only toward Meta.** One GET-only client (`src/lib/meta/client.ts`),
  and an ESLint rule fails the build if any other file names the Graph API
  host. AEGIS cannot change an ad, send a Messenger message, or spend money.
- **The AI never commits the business.** It drafts and summarises; a person
  clicks send, confirms a slot, agrees a price.
- **Every action gives visible feedback**, through the toast system.
- **Secrets** are encrypted at rest under `MAIL_CREDENTIAL_KEY` and never
  returned to a browser: status shapes have no field that could carry one.
  Next's server-function logging is switched off because it printed tokens.
- **Tenant isolation** runs through `tenantScope()` (`src/lib/dal/tenant.ts`).
  The one path without a session (the Meta webhook) resolves its business
  explicitly and writes nothing for an unknown Page.
- **Comments explain why, not what.** Match the surrounding prose.

## Where things stand

Working, on real data:

- **Ads.** The company Meta account (`act_1057367675322276`, PHP, Asia/Manila)
  is connected read-only, per business. 138 rows synced: campaigns, ad sets and
  ads with spend, results, cost per result and budgets, over 7 days, 30 days or
  all time. Sync is a button with a two-minute cooldown. The AI commentary
  reads the real figures.
- **Mail.** A company Gmail is connected per business over IMAP and SMTP. 62
  messages, AI triage (priority, category, summary, action required, deadline,
  suggested reply), approval guardrails, and sending only on a person's click.
- **Bookings, inventory, the revenue ledger, dashboard, users, business
  management and system status** all work on stored data.
- **Bookings and ads joined up.** The New Booking form has an **Ad source**
  picker of real campaigns, and the Ads screen shows bookings and cost per
  booking per campaign, counted over the same days as Meta's own figures. No
  booking has been credited yet.
- **Messenger.** The webhook (`src/app/api/meta/webhook/route.ts`) is built and
  proven by `npm run messenger:simulate`: Meta's signature checked, retries
  stored once, ad credit resolved to a campaign and never overwritten later,
  unknown Pages ignored. The Autoblitz Page (`111974377156493`) is connected.
  No real chat has arrived yet.

Not done: the AI step that turns a chat into a booking request; Meta App Review
(which needs business verification, a public privacy page, and a video of that
feature working); production deployment; backups and a restore test; the
dashboard honesty items (DEMO DATA labels, booked value kept apart from actual
revenue).

Local snags worth knowing: Meta reaches this laptop through a temporary
`cloudflared tunnel --url http://localhost:3000`, whose address changes on each
restart and must be re-entered in Meta. The demo accounts `ahmed.ben` and
`rosa.marin` still exist with the seeded password and should be deleted. The
business has no internet domain, which blocks Meta business verification.

## Working conventions

- Run the dev server through the Browser pane's `preview_start` (`aegis-dev` in
  `.claude/launch.json`), never a raw shell.
- Before finishing: `npx tsc --noEmit`, `npx eslint src scripts`,
  `npx next build`, plus `npm run ads:check` and `npm run messenger:simulate`
  when either area is touched.
- Verify in the browser wherever a change is visible. The developer signs in;
  Claude does not type passwords.
- Owner reports are PDFs built with reportlab
  (`C:\Users\njunj\AppData\Local\Python\bin\python.exe`), one page where it
  fits, **bold only, no colour, no em dashes, plain words**.
- The developer commits. Do not commit unless asked. The tree is clean at
  `be25752 meta ads`.

## Map

```
src/app/(app)/…            screens: dashboard, mail, ads, bookings, inventory,
                           account, admin/businesses, admin/users, status, modules/[key]
src/app/actions/…          server actions, one file per area
src/app/api/meta/webhook   the only unauthenticated route; Meta's signature is its auth
src/lib/dal/…              all database access: session, tenant, and per-area modules
src/lib/meta/…             client (GET only), failures, mapping, fetch, sync, ranges, webhook
src/lib/ai/…               client, generate (cache and monthly budget), triage, reply, insights
src/lib/data/…             seed fixtures and static design data
src/components/…           screens by area, plus ui/ design system
scripts/                   seed, reconcile, mail-check, ads-check, messenger-simulate
```

Types live in `src/types/*` and are re-exported from `@/types`.

---

## Next: Fleet and CRM

Both are **optional modules**. They already exist as keys, names, icons and
descriptions in `OPTIONAL_MODULES` (`src/lib/data/businesses.ts`), appear in the
sidebar, and today land on the stub page
(`src/components/modules/module-page.tsx`) that explains a module is not built
yet. Neither business has them switched on: AUTOBLITZ and Northgate both hold
only `bookings` and `inventory`, so granting them in Business Management is step
one.

What to build on:

- `requireModule()` (`src/lib/dal/businesses.ts`) gates server actions; the
  sidebar dims an unentitled module and routes it to the stub.
- **Bookings is the closest complete example**: types, a DAL through
  `tenantScope`, actions, a workspace, a drawer, seed fixtures, and ledger sync
  (`src/lib/dal/bookings.ts`, `src/components/bookings/*`).

Settle with the owner before building:

- **What Fleet means here.** Customer vehicles (plate, model, service history,
  next service due), or the shop's own vehicles? For an auto service shop the
  first is far more useful and ties bookings, inventory and CRM together.
- **What CRM means here.** Most likely customers with their vehicles, contact
  details, booking history and value over time, fed by bookings and, once Meta
  approves it, by Messenger chats.
- **The overlap.** Vehicles belong to customers, so the two modules share a
  spine. Design the customer and vehicle records once and give each module its
  own screens over them, rather than building two parallel stores.

Suggested approach: plan mode, ask the owner the two definition questions above,
agree one shared data model, then build CRM (customers and vehicles) before
Fleet (service schedules and reminders), since Fleet reads what CRM holds.

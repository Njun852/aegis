# AEGIS handoff

Written 26 September 2026, updated 28 September 2026 after Fleet and CRM.
Read this first, then `DATABASE_AND_AUTH_doc.md` for the database,
authentication, authorization and integration detail.

**Latest work: the Fleet and CRM modules.** Their state and what is left is
the last section.

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
- **Messenger.** The webhook (`src/app/api/meta/webhook/route.ts`) is built and
  proven by `npm run messenger:simulate`: Meta's signature checked, retries
  stored once, ad credit resolved to a campaign and never overwritten later,
  unknown Pages ignored. The Autoblitz Page (`111974377156493`) is connected.
  No real chat has arrived yet.

- **Online booking page.** `/book/<link>` lets customers request an
  appointment without an account; see the section below.

**Dropped (30 Sep 2026):** the AI step that turned Messenger chats into booking
requests, and with it the Meta App Review it needed. The owner chose a public
booking page instead. The Messenger webhook stays as built.

**Removed (1 Oct 2026):** the link between bookings and ads, at the owner's
request. The New Booking form no longer has an Ad source picker, bookings no
longer store a `source` campaign, and the Ads screen, the full report and the
Ads AI commentary no longer show bookings or cost per booking. No booking had
ever been credited, so no data was lost. Ads and Bookings are now independent;
the public booking page's "How did you hear about us?" answer is the only
record of where a customer came from.

Not done: production deployment (the booking page needs a real address to be
useful to customers); backups and a restore test; the dashboard honesty items
(DEMO DATA labels, booked value kept apart from actual revenue).

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
- The developer commits. Do not commit unless asked. Fleet is committed at
  `b8ac7a2 fleet`; CRM is uncommitted on top of it.

## Map

```
src/app/(app)/…            screens: dashboard, mail, ads, bookings, inventory, fleet,
                           crm, account, admin/businesses, admin/users, status,
                           modules/[key]
src/app/actions/…          server actions, one file per area
src/app/api/meta/webhook   the only unauthenticated route; Meta's signature is its auth
src/lib/dal/…              all database access: session, tenant, and per-area modules
src/lib/meta/…             client (GET only), failures, mapping, fetch, sync, ranges, webhook
src/lib/ai/…               client, generate (cache and monthly budget), triage, reply, insights
src/lib/data/…             seed fixtures and static design data
src/components/…           screens by area, plus ui/ design system
src/app/book/…             the public booking page, outside the app shell
scripts/                   seed, reconcile, mail-check, ads-check, messenger-simulate,
                           fleet-check, crm-check, booking-page-check, report-check,
                           calendar-check
```

Types live in `src/types/*` and are re-exported from `@/types`.

---

## Fleet and CRM

Both are optional modules, both are **outside the frozen acceptance checklist**
(it has no Fleet or CRM requirement; "fleet" appears only as an email category
in the five-email test), so treat them as agreed extras, not Stage 2 items.
AUTOBLITZ has both switched on; Northgate has neither.

The owner's definitions:

- **Fleet = customer vehicles**, not the shop's own. Plate, make, model, owner,
  service history and next service due by date and by km, whichever first.
  "Reminders" are a due list only (Overdue, Due in 30 days); nothing is sent.
- **CRM = Customer 360.** A customer list and profile: contact details, their
  vehicles, their bookings, booked value over twelve months, and recent emails
  from their address. No follow-up tasks or deals pipeline yet; both were
  offered and deferred.

One shared spine: `customers` (CU-…), owned by `src/lib/dal/customers.ts`.
Fleet creates owners through it; CRM lists and edits them. Vehicles (VH-…)
point at a customer; service records (SR-…) point at a vehicle.

How the pieces join:

- **Bookings carry `vehicleRef` and `customerRef`.** The New Booking form has a
  Vehicle picker (with Fleet) and a Customer record picker (with CRM: not
  linked, a new customer from the typed details, or an existing one). A
  booking for a car always belongs to the car's owner, enforced on the server.
- **History comes from bookings plus a manual log.** Completing a booking for a
  car writes one service line; reopening removes it; rescheduling moves it.
  Staff can log past or walk-in work with a km reading.
- **Old bookings are never matched to customers automatically.** Most of the
  17 on file are seed fixtures or tests; the booking drawer has a Link control.
- **Booked value is labelled as booked value,** not revenue, and leaves
  cancellations out, in line with the dashboard honesty rule.
- **Links:** booking drawer to the customer's profile (`/crm?customer=CU-…`),
  Fleet owner to the same, CRM vehicles to Fleet.

Checks: `npm run fleet:check` and `npm run crm:check` assert the due rules,
the phone/email match keys, monthly value bucketing, and the database
guarantees (one car per plate, one history line per booking), and create the
indexes on an existing database. They cannot reach the session-bound DAL, so
the flows themselves need the browser.

Left to do:

- **Browser verification of both modules has not been done yet.** It needs the
  developer signed in to the Browser pane; the checklist is in the plan
  (add a car, duplicate plate refused, log service, mileage cannot go backwards,
  complete and reopen a linked booking, duplicate customer warning, link an old
  booking, profile contents, Northgate locked).
- Follow-up tasks and a deals pipeline, if the owner wants them later.
- The money format is the house `$` from `formatMoney`, as on Bookings and the
  dashboard, although the shop trades in pesos. That predates these modules.

## Online booking page

Customers request an appointment at `/book/<link>` (for example
`/book/autoblitz`) and check on it at `/book/<link>/status`. The form follows
the design the owner supplied: name, mobile, how they heard about the shop;
make, model, plate, year; service, preferred date and time, notes. This is
outside the frozen acceptance checklist, like Fleet and CRM.

- **Switched on per business** in Business Management ("Online booking page"
  panel): off by default, needs the Bookings module, and asks before opening
  because it publishes a page anyone can reach.
- **Times:** Monday to Saturday, hourly starts 8:00 AM to 4:00 PM, up to 60
  days ahead, two bookings per slot at most, counting bookings staff make in
  the app. Asia/Manila throughout, built with a fixed +08:00 offset. The slot is
  re-counted on submit. Rules in `src/lib/booking-slots.ts`.
- **What arrives:** a Pending booking, "Website form", unassigned, value 0,
  with an **Online** badge and a request block in the booking drawer (mobile,
  how they heard, vehicle as typed, code). Staff set who, value and duration
  with **Edit details** (the pen button; works on any booking), then use the
  request block to link or create the CRM customer and link or add the Fleet
  car. Matches by mobile and plate are offered first so nobody is added twice.
- **The customer's side:** a code like `AB7K-3Q9P` on success; with it and
  their mobile they see status, service, time and vehicle, nothing else.
- **Protections:** see "Two layers of route protection" in
  `DATABASE_AND_AUTH_doc.md` (explicit business resolution, honeypot, per-IP
  limits, same message for every failed lookup). Two submissions in the same
  instant can put one booking over a slot's capacity, since the local Mongo has
  no transactions; staff see and move it when confirming.
- **Check:** `npm run booking:check` (slot rules, codes, indexes, and, with the
  dev server running, that the page is public and the app is not).

Left to do: a public address. On this laptop the page is only reachable
through the cloudflared tunnel, whose address changes on every restart.

## Dashboard: full report

"View Full Report" on the dashboard's AI Insights card opens
`/dashboard/report?range=this-month|last-month|this-quarter`, for the range the
dashboard is showing. Built by `buildReport` (`src/lib/dal/report.ts`) from the
modules' own tenant-scoped reads; rendered by
`src/components/dashboard/report/`.

- **Sections:** financial overview (the four KPI tiles), booked revenue with a
  six-month table, bookings (by status, channel, top services and the count
  from the online booking page), ads, mail, inventory, fleet, customers. A module the
  business lacks has no section; an unconnected ad account or mailbox gets one
  line saying so, never sample rows.
- **DEMO DATA, for now:** Total Balance, Expenses and Net Profit are still the
  sample figures from `DASHBOARD_RANGES` and carry the badge, on screen and in
  print. The owner asked for them to be shown until they have a real source.
  They are **not** given to the AI.
- **Ads cover the last 30 days,** whatever the report's period, because Meta
  reports rolling windows. The section says so and shows the last sync.
- **AI spend:** opening or reloading the report reads caches only. The longer
  summary (`src/lib/ai/report.ts`, kind `dashboard-report`) is written only by
  the "Write AI summary" button, through `generate()`, and cached on a hash of
  the real figures, so it is paid for once per set of numbers. No customer
  names, plates, phone numbers or email content are sent.
- **Print:** "Print or save PDF" uses the browser. Print rules in
  `src/styles/globals.css` drop the sidebar and top bar and let the page flow
  (the shell is otherwise a fixed-height scroll box).
- **Check:** `npm run report:check` (periods, booking sums, AI reply parsing).

The top bar's mail "Stale — last sync" pill was removed at the owner's request
(1 Oct 2026). The report's "Generated …" line and its ads and mail sync notes
are now where the dashboard side shows how current the data is; System Status
and the Ads screen still show their own.

## Bookings: calendar view

Bookings has a **List / Calendar** switch beside the search box
(`src/components/bookings/bookings-calendar.tsx`). The calendar is a month
grid, Sunday first: each day shows its first three bookings by start time with
a status dot (cancelled ones struck through, online requests marked), then
"+N more". Choosing a day lists all of its bookings beside the grid and offers
"New booking on this day", which opens the form on that date. Any booking opens
the same drawer as the list. The status chips and search narrow the calendar
too; the range picker is hidden there, because the month controls replace it,
and the stat tiles count the month shown.

Bookings are placed by `dateKey`, a calendar day the server stamps on each
booking next to its `day` and `time` strings (`dateKeyOf`,
`src/lib/booking-calendar.ts`), and the grid is built from keys alone, so the
server render and the browser agree whatever timezone either is in.
Check: `npm run calendar:check`.

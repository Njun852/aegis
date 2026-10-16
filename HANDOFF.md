# AEGIS handoff

Written 26 September 2026, last updated 15 October 2026 after the quotation
workflow, job orders and owner text alerts. Read this first, then
`DATABASE_AND_AUTH_doc.md` for the database, authentication, authorization and
integration detail.

**Latest work (15 Oct 2026): Quotation & Costing completed against the Final
Completion checklist, job orders, bookings following their job orders, and
owner text alerts.** See the last three sections.

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

The current scope is `C:\Users\njunj\Downloads\AEGIS Final Completion & Demo
Checklist.pdf` (frozen): Meta → Messenger → Booking, Meta performance, the
booking workflow, system status and security, backup and handover, **Quotation
& Costing (required)**, and the final demo sequence: Meta Ad → Messenger →
Booking Request → Staff Confirmation → Confirmed Booking → Quotation →
Customer Approval → Job Order. It says no new features before these are done
unless the owner approves, and that Quotation & Costing must never be left out
of a completion summary.

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

**Reversed (4 Oct 2026):** the 30 Sep drop of Messenger → booking requests and
the 1 Oct removal of the ads ↔ bookings link were both reversed by the owner's
*Meta-to-Bookings Final Acceptance Checklist* (Nicole). Requests are now made by
staff from a Messenger inbox, with no AI; see "Meta to Bookings" at the end.

- **Quotations and job orders.** The full workflow the Final Completion
  checklist asks for: statuses, special pricing approval, customer approval,
  revisions, the customer PDF and conversion to a job order. Checked in the
  browser by the developer on 15 Oct 2026. See "Quotation workflow" below.

Not done (none of it code, all of it on the Final Completion checklist):
production deployment on a company-controlled server and domain (the booking
page and the permanent Meta webhook both need a real address); automatic
backups and an actual restore test; Meta App Review; restart, deploy, restore
and troubleshooting procedures; the end-to-end acceptance demo, which depends
on all of these.

Local snags worth knowing: Meta reaches this laptop through a temporary
`cloudflared tunnel --url http://localhost:3000`, whose address changes on each
restart and must be re-entered in Meta. The demo accounts `ahmed.ben` and
`rosa.marin` still exist with the seeded password and should be deleted. The
business has no internet domain, which blocks Meta business verification.

## Working conventions

- Run the dev server through the Browser pane's `preview_start` (`aegis-dev` in
  `.claude/launch.json`), never a raw shell.
- Before finishing: `npx tsc --noEmit`, `npx eslint src scripts`,
  `npx next build`, plus the check for each area touched: `npm run ads:check`,
  `npm run messenger:simulate`, `npm run quote:check` (quotations, job orders
  and the booking sync), `npm run alerts:check` (owner text alerts).
- A new route under `src/app` needs `npx next typegen` before `tsc` knows its
  `PageProps` type; `next dev` and `next build` regenerate it too.
- Verify in the browser wherever a change is visible. The developer signs in;
  Claude does not type passwords.
- Owner reports are PDFs built with reportlab
  (`C:\Users\njunj\AppData\Local\Python\bin\python.exe`), one page where it
  fits, **bold only, no colour, no em dashes, plain words**.
- The developer commits. Do not commit unless asked. The last commit is
  `f52de24`; the quotation workflow, job orders and owner text alerts were
  uncommitted on top of it as of 15 Oct 2026.

## Map

```
src/app/(app)/…            screens: dashboard, mail, ads, bookings, inventory, fleet,
                           crm, quotations (and quotations/jobs/[ref], the job orders),
                           suppliers, text-blast, account, admin/businesses, admin/users,
                           status, modules/[key]
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
                           calendar-check, text-blast-check, text-blast-run, quote-check,
                           supplier-check, booking-attribution-check, owner-alerts-check
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
- Money shows in pesos everywhere since 4 Oct 2026: `formatMoney` (`src/lib/format.ts`) is the
  house currency, `HOUSE_CURRENCY = "PHP"`. Only the Ads sample rows, which are USD, show `$`.

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
- **No sample figures** since 4 Oct 2026: the report's tiles are the dashboard's
  real ones (see "Dashboard: real figures" at the end).
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

## Text Blast: automatic service reminders by SMS

A new optional module (`sms`, "Text Blast", `/text-blast`), outside the frozen
acceptance checklist like Fleet and CRM. **No SMS provider is connected. Not
one text has been sent to a phone.** The backend and the screen are built; the
provider's API is the remaining step.

What it does: each customer car gets one text when it falls due for service,
which is its last service plus its own interval (six months by default, the
same date Fleet shows). The owner chose **fully automatic** sending, so there
is no review step; the rules below are what keep that safe.

- **Off until switched on**, per business, on the Text Blast screen, with a
  confirmation. It needs Fleet.
- **One text per car per due date** (unique index on vehicle and due date), so
  the sweep can run any number of times.
- **No backlog blast:** only cars due within the last 30 days are texted on
  their own. Older ones show "Overdue, never reminded" with a Send reminder
  button.
- **Daytime only:** 9:00 AM to 6:00 PM, Asia/Manila.
- **Opt-out:** a Reminders on/off switch per customer, on this screen and in the
  CRM drawer. Off means the customer asked not to be texted.
- **Valid Philippine mobile only**; otherwise skipped with the reason shown.
- **Queue expires:** a text not sent within 14 days becomes Expired.

How it runs: `src/instrumentation.ts` starts a timer in the server process
(`src/lib/sms/timer.ts`) that every 15 minutes calls `runReminderSweep` for each
business with the module and the switch on. It logs
`[text-blast] reminder timer started` once at boot. On a host that does not keep
the server running, schedule `npm run sms:run` instead; it does the same pass.
The sweep is addressed by business id and uses no session
(`src/lib/dal/text-blast.ts`); the rules are pure, in `src/lib/text-blast.ts`.

The message is a template with `{name}`, `{vehicle}`, `{plate}`, `{due}`,
`{business}` and `{link}`. `{link}` is the public booking page and needs
`APP_PUBLIC_URL` set, because a timer has no request to read an address from.
The screen shows the character count and how many SMS parts each customer's
text takes, which is what a provider will bill.

**Connecting a provider later.** Only `src/lib/sms/provider.ts` changes:
`getSmsProvider()` returns an adapter with `send(to, body)` that reports
`{ ok: true, id }` only when the provider accepted the text, and
`{ ok: false, error }` otherwise. Credentials go in the environment. Before
switching it on for a real business: run `npm run sms:check` (it refuses to run
with a provider connected, so point it at a test configuration or adapt it),
send one text to the developer's own phone, and confirm with the owner that the
wording and the opt-out meet the local rules for commercial texts. From then on
each text costs money; the one-per-car-per-due-date rule and the segment count
are what bound it.

Not built: blasts to everyone on a fixed cycle, free-form campaigns, delivery
receipts, and replies (a customer texting STOP is not read; staff switch that
customer's Reminders off by hand).

Check: `npm run sms:check` (the rules, then the real sweep against a throwaway
business: off, night, one per car, queued and never sent, manual limits,
expiry).

## Quotations

An optional module (`quotes`, "Quotations", `/quotations`). It began outside
the first checklist; the Final Completion checklist (section 6) now makes it
**required**. It prints the shop's own quotation form as a PDF, emails it, and
drafts one from a photo. Granted to no business by default; an admin switches
it on in Business Management (AUTOBLITZ has it). The approval workflow, the
revisions and the job orders added in October are in "Quotation workflow"
below; this section is the document itself.

- **Data:** `quotations` (QT-…), `quotePriceItems` (the price list),
  `quotePhotos` (QP-…), all tenant-scoped through `src/lib/dal/quotations.ts`.
  The letterhead (logo, address, contact numbers, default notes, footer,
  markup) is `quotation` on the business record, edited from Settings on the
  Quotations screen. Bill To and the vehicle are copies, optionally linked to a
  CRM customer and a Fleet car, so editing a customer never changes a quotation
  already sent.
- **Totals are never stored.** `quoteTotals` (`src/lib/quotations.ts`) works
  them out from the lines everywhere: editor, list, PDF, email.
- **Cost and margin are internal.** Each line has an optional cost; a cost
  with no price is offered at the business's markup (50% by default, the
  ratio in the owner's sample). The PDF component is never given costs, so
  it cannot print them.
- **Price list fills itself.** Saving a quotation upserts each priced line by
  its normalised wording; the description box autocompletes from it. Photo
  lines are remembered only once a person saves the draft.
- **PDF:** `src/lib/quote-pdf.tsx` (`@react-pdf/renderer`, installed with
  `--legacy-peer-deps` because of the existing next-auth/nodemailer peer
  clash). Served by `/api/quotations/[ref]/pdf` for the preview and the
  download, and attached to the email, so all three are the same document.
  Built-in fonts: Latin-1 (Iñigo) prints, the peso sign does not, so amounts
  are plain numbers as on the paper form. A quotation with an unpriced line,
  or special pricing nobody approved, can be previewed but not downloaded or
  emailed. The form's **P.O.** column is a free-text box per line, kept
  because the paper form has it; it is not linked to Suppliers' purchase
  orders. The PDF prints "Rev 2" from the second revision and the Valid Until
  date in the row under Technician. `?rev=N` prints an earlier revision.
- **Email:** through the business's connected mailbox; `sendMail` now takes
  attachments. A person checks the address, subject and message and presses
  Send; the quotation is marked Sent only after SMTP accepts it. Gmail keeps
  the copy in its Sent folder; AEGIS does not add it to the Mail screen.
- **From a photo:** one vision call per upload (`src/lib/ai/quote-photo.ts`,
  kind `quote-photo`), classifying the photo (written estimate, supplier
  document, vehicle, other) and extracting lines. Prices come from the photo,
  then a cost in the photo at markup, then the price list (matched on the
  server, never sent to the model); the rest stay unpriced. A vehicle photo
  gives at most eight suggestions and the model may not price them. Every
  line is tagged with its source in the editor, and the photo sits beside
  the draft. A plate or phone links to an existing car or customer; nothing
  is created.
- **Photo spend:** the browser shrinks to about 1400px JPEG under 1 MB; the
  cache key is the photo's SHA-256, so a re-upload is free; at most
  `OPENAI_QUOTE_PHOTOS_PER_DAY` (10) billed reads per business per day; no
  reading once 80% of the monthly budget is used, keeping the rest for mail.
  The model is `OPENAI_MODEL_VISION` (default `gpt-4.1-mini`) because
  gpt-4o-mini bills an image at about 33 times its tokens (about 25,000 a
  photo). **Not yet run against the real API**: check the first call's
  input tokens on System Status before relying on the estimate of about
  2,500 per photo.
- **Privacy:** a photo of a written estimate may show a customer's name and
  phone, and it goes to OpenAI with the image. That is inherent to the feature
  and differs from the dashboard report, which sends no customer details.

Check: `npm run quote:check` (the owner's sample totals, markup, rounding,
typed amounts, price-list matching, photo reply validation and draft pricing
order, indexes and the price list's one-entry-per-wording rule).

Left to do: a first real photo read; VAT other than the printed "zero rated"
note, if the owner wants it; asking the owner what the shop writes in the
P.O. column.

## Inventory: stock batches (Suppliers & Costing, step 1)

Part of the Suppliers, Purchase Orders and Costing work the owner asked for
(3 Oct 2026), outside the frozen checklist. Steps still to come: suppliers and
the price book, record-only purchase orders and receiving, receipt photos,
quotation costing and low stock to draft POs.

- **Every stock in opens a batch** (`stockBatches`, BT-…): quantity received,
  quantity left, unit cost, supplier, delivery note, the movement that opened
  it. Goods received carries the cost paid; a customer return (whose amount is
  a credit, a price) and internal moves come in at the item's average.
- **Every stock out draws oldest batch first** and stores which batches and at
  what cost on the movement (`batches`, `costCents`). The item's guarded
  `onHand` is still what stops two picks taking the last unit; the batches
  are decremented with their own guards and re-planned on a lost race, and a
  failure puts back what was taken.
- **The item is the total:** on hand is the level, value is summed batch by
  batch, `unitCostCents` is now the weighted average (refreshed after every
  movement), and `nextCostCents` is the oldest open batch's cost. The drawer
  shows the batches, oldest (next used) first.
- **Existing stock converts itself:** the first read or write of a
  business's Inventory gives each stocked item without batches one opening
  batch (ref `OPEN-<sku>`, insert-only, so repeating it is harmless). Re-seeding
  deletes the seeded items' batches so they are rebuilt at the seeded levels.
- **Stock value changes** when this lands: it was on hand times a cost that
  never moved; it is now the batches' own costs.

Check: `npm run supplier:check` (oldest-first maths, value, incoming cost,
indexes, a repeated conversion, a batch that cannot be over-drawn, and a
read-only report of any item whose level disagrees with its batches).

## Suppliers and the price book (Suppliers & Costing, step 2)

A new optional module (`suppliers`, "Suppliers", `/suppliers`), granted to no
business by default. Tabs: Suppliers, Compare costs, Cost changes.

- **Suppliers** (`suppliers`, SP-…): contact, phone, email, terms, usual
  delivery days, notes. One record per name (unique `nameKey`). A supplier no
  longer used is set aside, never deleted, so its history stays.
- **Price book** (`supplierItems`, SI-…): each part as one supplier sells it,
  in their wording, at their latest cost, optionally linked to an Inventory
  item. One entry per wording per supplier. **Every cost is written through
  `recordCost`** (`src/lib/dal/suppliers.ts`), which also writes the history
  line (`supplierCosts`) when the cost changed; purchases and receipt photos
  will call the same function.
- **Comparison** groups entries by Inventory item, or by wording when
  unlinked, cheapest first, and marks the **planning cost**: the preferred
  supplier's, else the most recently confirmed (`planningCost`,
  `src/lib/suppliers.ts`). Quotation costing will use that, not the cheapest.
  Costs older than 90 days are flagged.
- **From Inventory**: the supplier names typed on Inventory items can be made
  into supplier records after a person ticks them, optionally putting each
  supplier's items into its price book at the current average cost
  (source "inventory").
- Money on these screens is pesos (`formatPeso`).

Check: `npm run supplier:check` now also covers name matching, comparison
grouping, the planning cost, and the unique name and wording indexes.

## Quotation costing (Suppliers & Costing, pulled forward)

Quotation part lines now take their cost from what the part costs today.

- **Sources** (`listCostSources`, `src/lib/dal/quote-costing.ts`), built per
  editor load from the modules the business has: a part with stock on hand
  costs its **oldest batch** (what the job will use); otherwise the supplier
  **planning cost** (preferred, else most recently confirmed). Each source
  carries every wording the part is known by, Inventory name and supplier
  wordings, so a receipt's "Inj. washer" finds Inventory's "Injector washer".
- **In the editor** (`quote-lines.tsx`): typing or picking a part fills the
  cost, says where it came from ("Cost: Supplier A · Oct 02, 2026"), links the
  line to the Inventory item (`sku`), and prices it at the markup if no price
  is there. It replaces a cost remembered from an old quotation but never one
  typed by hand. The description box also offers stocked and supplier parts
  never quoted before.
- **Warnings:** a line whose cost on record has risen above its own cost shows
  the markup now against the markup it was priced at, with "Use this cost"
  and "Price at 50%" buttons; neither applies without a click. A line with no
  cost is told when one is on record.
- **Photo drafts** run the same rules on the server (`applyCostSources`) after
  the photo and the price list, never changing a price the photo gave.
- Labor is never costed this way. The PDF and the email never show costs.

Check: `npm run quote:check` covers wording and plural matching, the risen-cost
markups, and draft costing.

## Purchase orders and receiving (Suppliers & Costing, step 3)

Two more tabs on Suppliers (Purchase orders, Receipts) and four routes:
`/suppliers/orders/new`, `/suppliers/orders/[ref]`, `/suppliers/receive`
(`?po=PO-…` to receive against an order), `/suppliers/receipts/[ref]`.

- **Orders are record-only** (`purchaseOrders`, PO-…): Draft → Ordered (how
  it was placed, when, expected delivery) → Partly received → Received, or
  Cancelled. AEGIS never contacts a supplier. Lines take whole units and an
  expected cost from the supplier's price book. Lines can change until the
  first delivery; after that the order is the record. An order nothing has
  arrived against can be cancelled; a partly received one is closed short.
- **Receipts** (`receipts`, GR-…), with or without an order. Posting each
  line calls `recordStockMove` (Goods received, which opens the batch at the
  cost paid, supplier and "GR-… · No. … · PO-…" as the delivery note), adds to
  the order line's received quantity (`$inc` by line id), and calls
  `recordCost` (price book and history). A line with no Inventory link
  creates the item on first receipt. Without the Inventory module a receipt
  records costs only.
- **Safe to repeat:** each line records its movement as soon as it is in
  stock, and a receipt left in "Posting" shows **Finish posting**, which skips
  posted lines. A short lock stops two requests posting one receipt at once.
- **Checks before writing:** the supplier matches the order, the order is
  ordered and open, nothing arrives beyond what is outstanding, and a supplier
  receipt number already recorded asks for confirmation.
- **Variance:** each receipt line shows actual against expected cost (from
  the order, or the price book without one), and the receipt the total.
- **Low stock → draft orders:** items at or below their reorder point, back
  up to target less what is already on open orders, one draft per supplier
  (preferred, else most recently costed, skipping suppliers no longer used).
  Items with no supplier are listed with the reason.

Check: `npm run supplier:check` now also covers order status, outstanding
quantities, variance, restock planning, the per-line received update and the
posting lock.

## Meta to Bookings (final acceptance checklist, 4 Oct 2026)

Built against `AEGIS_Meta_to_Bookings_Final_Acceptance_Checklist.Nicole.pdf`.
The checklist freezes scope: finish attribution, booking control, reporting and
production readiness only, and add nothing unrelated before acceptance.
(Quotations and Suppliers were built before it arrived; they are optional
modules granted to no business and change nothing here.)

- **Messenger inbox** (`/bookings/messenger`, a button on Bookings once a Page is
  connected): the stored chats, read only, with the ad and campaign each started
  from. **Create booking request** opens the New Booking form; the server reads
  the chat itself (`findConversation`) and copies its campaign onto the booking
  as `source` with `origin: "messenger"`, plus `messengerPsid`. Nothing the
  browser sends can set that credit. No AI is involved, by the owner's choice.
- **One request per chat:** the create action refuses a second booking for a
  chat unless staff tick "this is a separate booking" (`anotherFromChat`).
- **Locked attribution:** the webhook writes a chat's ad once
  (`storeMessage`); a booking's Messenger credit cannot be changed
  (`setManualSource` refuses it). Proven by `npm run messenger:simulate`.
- **Manual fallback:** an Ad source picker on the New Booking form and in the
  booking drawer, for calls, walk-ins and untracked messages, listing only real
  synced campaigns. A manual credit can be corrected.
- **Request vs confirmed:** a request is a Pending booking. Only Confirmed, In
  progress and Completed count as Confirmed Bookings (`CONFIRMED_STATUSES`,
  `src/lib/bookings.ts`); Pending and Cancelled never do.
- **Ads screen, "Ads to bookings" panel** (`campaign-funnel.tsx`, maths in
  `src/lib/ad-funnel.ts`): per campaign Spend, Conversations (Meta's messaging
  conversations started, only for campaigns optimised for them, otherwise "—"),
  Cost per Conversation, Confirmed Bookings, Cost per Booking, Conversation →
  Booking %. One window for all of them, Meta's own (`windowForRange`), printed
  as exact dates ("Sep 4 – Oct 3, 2026"). Bookings count on the day they were
  made. Clicking a campaign lists the bookings behind its number, counted and
  not, with AEGIS's own received-chat count for audit. At most one flag per
  campaign: spending with no bookings, cost per booking 1.5× the average, weak
  conversion, or clearly cheaper than average. Confirmed bookings from no ad are
  stated apart. Webhook and token details stay off this screen (they are in
  Business Management).
- **Bookings, booked vs served:** the Today tile reads served / booked; each
  calendar day shows "2/5 served"; the selected day shows Booked, Served, To
  serve, with cancellations left out of Booked and named separately.

Checks: `npm run attribution:check` (the checklist's own example, ₱288 per
booking and 8.4%, confirmed-only counting, windows and dates, flags, and the
real queries), `npm run calendar:check` (booked and served),
`npm run messenger:simulate` (signature, idempotency, locked credit).

**Not code, and still open for the PASS gate** (owner and developer actions):
- **Meta production approval.** Real customers' Messenger events only arrive
  once the app has the needed permissions approved in App Review; until then
  only people with a role on the app are delivered. Business verification is
  still blocked by the business having no internet domain.
- **Permanent webhook address.** The callback is still the temporary
  cloudflared tunnel. It must move to the production AEGIS address and survive
  restarts, which needs the production deployment.
- **The end-to-end acceptance test** (section 6) on a real or approved ad entry
  point, which depends on both of the above.

## Dashboard: real figures (4 Oct 2026)

The DEMO DATA tiles and cards are gone; every figure is read from the
business's records by `loadDashboard` (`src/lib/dal/dashboard.ts`), maths in
`src/lib/dashboard.ts`. `src/lib/data/dashboard.ts` holds only the range names.

- **Revenue:** the ledger, as before.
- **Expenses (purchases):** what was paid for goods received: every
  goods-received stock movement (typed into Inventory or posted from a supplier
  receipt) plus cost-only receipts for businesses without Inventory. Wages, rent
  and other running costs are not recorded anywhere in AEGIS, so they are not in
  it, and the label says purchases.
- **Revenue − purchases:** the two subtracted month by month. Named for what it
  is rather than "net profit", for the same reason.
- **Quoted:** quotation totals by quotation date, or **Stock value** for a
  business without Quotations. The old Total Balance tile is gone: AEGIS has no
  bank or cash account to read a balance from.
- **Bookings card:** bookings scheduled in the range, cancellations left out,
  by channel.
- **Ads Summary:** the connected Meta account's last 30 days (spend,
  conversations, confirmed bookings, cost per booking), labelled as such; a
  line saying none is connected otherwise.
- **Alerts:** worked out from the modules: urgent unread mail, bookings to
  confirm, stock at reorder point, cars overdue, supplier costs up in 30 days,
  late deliveries, draft quotations with unpriced lines. At most five, most
  pressing first; "Nothing needs attention" when empty.
- **Email "Awaiting reply":** messages the AI marked as needing action with no
  reply sent from AEGIS (a reply sent straight from Gmail is not seen).
- **AI Insights fallback** no longer shows invented commentary.

Check: `npm run report:check` covers purchases, net, the tile set, bookings by
channel and awaiting reply. It found and fixed a real fault: two buckets for
one month (purchases and cost-only receipts) were replaced instead of added.

## Quotation workflow (Final Completion checklist, section 6, 15 Oct 2026)

Everything section 6 asks for, on top of the document described under
"Quotations". Pure rules in `src/lib/quotations.ts`; data in
`src/lib/dal/quotations.ts`; actions in `src/app/actions/quotations.ts`.

- **The order of things:** booking (the appointment) → quotation (after the
  car is looked at) → customer approval → job order. The booking link is
  optional, so a walk-in or a price asked over the phone is quoted with no
  booking. A booking cannot be made from an approved quotation; that was
  discussed and left out as new scope.
- **Link to a booking:** a Booking picker in the editor (non-cancelled
  bookings from the last 120 days) fills in the customer and car where empty.
  The booking drawer lists its quotations and has "+ New quotation", which
  opens `/quotations/new?booking=BK-…` already filled in.
- **Statuses:** Draft, Sent, Approved, Partially Approved, Declined are
  stored. **Expired is never stored:** a Sent quotation past its
  `validUntil` reads as Expired (`effectiveStatus`). Validity defaults to the
  quote date plus Settings' "Valid for (days)" (30), editable per quotation.
  Sent means emailed from AEGIS, or "Mark as given" (printed, shown, sent
  from a phone).
- **Margin:** the editor's Totals panel shows the customer total and, in a
  grey "Internal · never printed" box, cost and gross profit with margin %.
  Margin % is profit over what the costed lines sell for, both after the
  discount (`quoteTotals().marginPercent`).
- **Discounts and special pricing:** a discount needs a written reason. A
  discount, or any line priced below its cost, is **special pricing** and
  needs an administrator's approval before the quotation can be emailed,
  downloaded or marked as given. The approval is stored with a key of the
  exact figures (`specialPricingKey`): change the discount or a below-cost
  line and it lapses; edit an ordinary line and it stands. Members can type a
  discount but not approve one.
- **Customer approval:** "Record answer" takes the outcome, the date and time
  (Manila), who answered, how, a note, and for a partial approval the lines
  agreed and the discount on them (never more than quoted). The approved
  amount is worked out on the server. "Undo" clears an answer recorded by
  mistake while no job order exists.
- **Who did what:** `preparedBy` (name at the time), the pricing approver,
  and who recorded the answer are stored. Every save, discount change,
  approval, send, answer and conversion is a line in `quoteEvents`
  (append-only), shown under History.
- **Revisions:** a Draft is edited in place, each save logged. Once a
  quotation has left the shop (any status but Draft), saving a change first
  copies the version the customer holds into `quotationRevisions` (written
  once; a unique index refuses a racing second save), then carries on as the
  next revision, a Draft again, with the answer and sent details cleared. Old
  revisions keep their own PDF. Only a first draft never sent can be deleted.
  Once a job order exists the quotation is locked.
- **The editor's layout:** one progress strip under the title (Draft → Sent →
  Customer answer → Job order) shows each step and the one next button;
  History is folded away at the bottom.

## Job orders and bookings (15 Oct 2026)

`jobOrders` (JO-…), made only from an approved quotation with **Make job
order**; there is no other way to create one. List: Quotations → Job orders
tab; page: `/quotations/jobs/[ref]`. Data in `src/lib/dal/job-orders.ts`; the
booking rules are pure, in `src/lib/job-orders.ts`.

- **What carries over:** the approved lines only, the approved discount and
  the customer-approved total, fixed at conversion, plus who approved and
  when. Each line keeps its quoted cost and an empty `actualCostCents`, and
  the job order has an empty `invoiceRef`, for Quoted Cost → Actual Cost →
  Invoice → Actual Gross Profit later.
- **One per quotation:** a unique index on `quotationRef`; a second click or a
  retry returns the first job order.
- **No duplicate revenue:** a job order posts nothing to the ledger. The sale
  stays the booking's single ledger entry: converting a quotation linked to a
  booking sets that booking's value to the approved amount (through
  `updateBookingDetails`, which upserts the same entry). A job order with no
  booking records no sale; invoicing will.
- **One job, tracked once:** the booking owns the appointment (Pending →
  Confirmed); once it has a job order, the job order owns the work (Open → In
  progress → Completed) and the booking follows: starting the job order makes
  the booking In progress, completing it makes it Completed (which writes the
  Fleet service line as before), reopening or going back to Open moves the
  booking back. Work cannot start on a booking still Pending. A booking with
  open work cannot be cancelled from Bookings; cancelling the job order
  leaves the booking Confirmed for staff to decide. With several job orders,
  the booking is Completed only when every one still standing is. In the
  drawer, Start/Complete becomes "Work on JO-…". `setBookingStatusAction`
  now returns refusals instead of throwing, because Next hides thrown
  messages in production.

Check: `npm run quote:check` covers margin %, special pricing keys, validity
and Expired, partial approval, Manila times, the booking sync rules, and the
unique indexes on revisions and job orders.

## Owner text alerts (15 Oct 2026)

Short SMS to the business's own people, set per business in Business
Management → **Owner text alerts**. **Outside the frozen checklist: needs the
owner's approval.** **No SMS provider is connected, so no alert has reached a
phone**; each is recorded as "Not sent". Connecting one is
`src/lib/sms/provider.ts`, the same single file Text Blast waits on.

- **Settings** (`ownerAlerts` on the business record): on/off, up to three
  named Philippine mobiles, which kinds, and a daily limit (20).
- **Kinds:** quotation sent / approved / partly approved / declined; approval
  needed (a member saved special pricing; an admin saving it is not texted);
  new bookings from the online booking page or a Messenger chat (staff-typed
  bookings are not); job order completed or cancelled. Hooks are in the
  quotation, booking and public booking actions.
- **Cost bounds:** one text per event per person (unique index on business,
  event key and number, written before sending); one GSM part at most
  (`fitSms` swaps the peso sign, dots and curly quotes, drops emoji, and cuts
  rather than splits); the daily limit, past which alerts are Skipped; and an
  alert recorded while no provider is connected is never sent later, so
  connecting one does not release a backlog.
- **Never in the way:** a failed alert is logged and the action that raised it
  carries on. The public booking page has no session, so it uses
  `notifyOwnerFor(businessId, …)`; the rest use `notifyOwner`.
- Data in `src/lib/dal/owner-alerts.ts` (`ownerAlerts`), wording in
  `src/lib/owner-alerts.ts`, panel `src/components/admin/owner-alerts-panel.tsx`.

Check: `npm run alerts:check` (every message one plain SMS part, the
character swaps, cutting, the mobile rule, and one text per event per person).

## Ask AEGIS (15 Oct 2026)

A floating bubble, bottom right on every signed-in screen, where staff ask
questions in plain words ("which quotations are waiting for an answer?").
**Outside the frozen checklist: needs the owner's approval.** Shown only when
`OPENAI_API_KEY` is set.

- **Actions, each confirmed.** Asked to do something, it proposes it as a
  card; nothing changes until the person presses Confirm, except `open`
  (go to a record or screen). Kinds: booking status, draft a quotation (saved
  as a Draft, lines tagged as suggested, never sent), mark a quotation as
  given, record a full approval or a decline, approve special pricing
  (administrators only), make a job order, move a job order. Each proposal
  is checked against the record as it is now and its card is written from
  that record, not from the model's words (`src/lib/dal/ask-actions.ts`).
  Confirm runs `runAskProposalAction` (`src/app/actions/ask.ts`), which calls
  the very server action the screen's own button uses, so every permission
  and rule applies unchanged. Not offered: sending email, partial approvals,
  editing prices; the assistant opens the screen for those instead. While an
  action runs, the bubble goes to the record, shows each step with a spinner
  then a check, refreshes the page, and a soft glow pulses round the screen.
  Every proposal and every confirmed run is logged in `askLog`.
- **Reads** go through the same tenant-scoped DAL functions the screens use
  (`src/lib/dal/ask-data.ts`). Tools: bookings,
  quotations, job orders, ads (the same `loadCampaignFunnel` the Ads screen now
  uses), money (the dashboard figures), inventory, customers and cars, service
  due, mail, and an app guide. A tool for a module the business lacks is not
  offered.
- **Two calls through `generate`** (`src/lib/ai/ask.ts`): a plan (fast model:
  which tools, which period, status or search; it sees no records) and an
  answer from what the tools returned. Figures reach the model already
  formatted, so it copies rather than calculates; it is told to say when the
  data does not hold the answer. Refs like QT-1004 in an answer become links.
- **Cost:** both steps cached (the same question over the same records is
  free); at most 60 questions per business per day (`OPENAI_ASK_PER_DAY`);
  paused at 75% of the monthly token budget, keeping the rest for mail triage;
  tool output cut to about 14,000 characters. Usage shows on System Status as
  "Ask AEGIS".
- **Privacy:** customer names, plates and amounts are sent to OpenAI when a
  question needs them; phone numbers and email addresses are not. Every
  question is logged in `askLog` with who asked, the tools used and the answer.
- **Not yet asked a real question** at the time of writing; the first one
  should be checked against the screen it describes.

Check: `npm run ask:check` (Manila periods, plan checking, ref links, the
index).

## Finance (16 Oct 2026, phase 1 of 9)

Built against the owner's *AEGIS Finance Reporting Checklist* (frozen
specification, printed): a Monthly Income Report and a Financial Standing
Report, kept separate, generated automatically after each month, archived with
revisions, every figure traceable. An optional module (`finance`, "Finance",
icon `wallet`), granted to no business, with no screen yet (no `href`, so it
shows as a module stub).

Decided with the developer on 16 Oct 2026:

- **Sales are invoices** (INV-…), by invoice date, made from a completed job
  order or typed in; a cash sale is an invoice paid at once. Unpaid invoices
  are AR. The old `transactions` ledger is not a source: it counts Pending
  bookings, and `revenueByMonth` groups by UTC month, so a sale before 8 AM on
  the 1st lands in the previous month.
- **Costs are bills** (BL-…), by bill date, in the nine categories of the
  spec. Parts count when bought (a bill from a supplier receipt), not when
  used. Unpaid bills are AP.
- **Payments** (PY-…) move account balances and settle invoices and bills; they
  are never income or expense. Transfers between own accounts are two legs.
- **A passbook is a bank account,** a kind of `bank`; a unique `accountKey`
  (institution plus number) stops one account being entered twice.
- **The month closes automatically on the 1st** (Manila) as Revision 1; later
  entries dated in a closed month need an admin-approved correction, which
  makes the next revision.
- **Members enter, admins own:** the owner screen, corrections and
  reconciliation differences are for administrators.
- Assumed until told otherwise: critical overdue AP is more than 30 days past
  due; AR ages from the invoice date, so 90+ starts on day 91.

Phase 1 (done): types (`src/types/finance.ts`), Manila periods
(`src/lib/finance-periods.ts`), the pure rules (`src/lib/finance.ts`: income,
standing, drill-down rows, aging, the 90+ control, AP groups, reconciliation,
report titles), indexes (`src/lib/data/finance.ts`, also created by the seed).
Check: `npm run finance:check` (the spec's September example, a hand total,
the independent position, no double-counted passbook, AP not yet due, aging,
the 90+ control, AP groups, Manila month turnover, and the unique indexes).

Phase 2 (built, checked in the browser on AUTOBLITZ on 16 Oct 2026, which now
has the Finance module): `/finance`, the Accounts screen. Browser-checked:
add cash and bank accounts, a passbook for the same BDO number typed
differently refused, a transfer too large refused, a transfer recorded, a count
with a difference shown on the screen and the dashboard, a short explanation
refused, explaining with and without adjusting the book, setting aside a
non-empty account refused, voiding a transfer. The test records (MA-1001,
MA-1002, PY-1001, PY-1002, RC-1001, RC-1002 and their nine audit lines) were
deleted afterwards at the developer's request, so AUTOBLITZ's Finance is empty
and the next account it gets will be MA-1001 again. The
shared `Modal` (`form-kit.tsx`) moved from z-60 to z-80 so it opens above side
drawers; before that, any form-kit modal opened from a drawer (including
Suppliers' Edit details) sat behind it. Data in `src/lib/dal/finance-accounts.ts` (accounts, transfers, counts)
and `src/lib/dal/finance.ts` (collections, `financeEvents` audit log); actions
in `src/app/actions/finance.ts`; screen in `src/components/finance/`.

- **Accounts** (MA-…): cash, bank account, passbook, e-wallet, each with an
  opening balance as of a day. A bank, passbook or e-wallet needs its number:
  it is hashed with the bank into `accountKey` (unique index) and only the last
  four digits are kept, so the same account cannot be entered twice, as a bank
  account and again as a passbook. Balances are never stored; each is opening
  plus payments since, and the drawer lists those rows with their total.
  The opening balance is fixed once money has moved or the account was
  counted. An account is set aside only when empty.
- **Transfers** are one payment (PY-…) out of one account and into another
  (`toAccountRef`), not two legs, since the local Mongo has no transactions.
  Refused if it would take the source below zero on that day or any later day
  (`lowestBalance`). Transfers and adjustments can be voided (kept, with the
  reason) unless that would leave an account below zero.
- **Counts** (RC-…): a cash count or passbook/statement balance for a day,
  entered blind (the form does not show the book figure). The server records
  the book for that day and the difference. A difference stays open, on the
  Finance screen and as a dashboard alert, until an administrator explains it,
  optionally adjusting the book by an `other` payment that moves the balance
  only and is never income or expense.
- **Members enter, admins own:** anyone with the module records transfers and
  counts; accounts, voids and resolving differences are for administrators.

Still to come: bills and AP; invoices and AR; live reports, drill-down and the owner screen; the month-end close with
PDFs, archive and revisions; year-end reports; an optional AI summary that
may only repeat figures in the frozen report; the acceptance run.

## Known issue

The booking drawer's timeline (`bookingTimeline`, `src/lib/bookings.ts`) shows
"Confirmation email sent · automated" and "Reminder scheduled", which never
happen. It breaks the no-invented-figures rule and should be rebuilt from real
events or removed.

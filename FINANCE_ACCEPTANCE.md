# AEGIS Finance: acceptance run

Run on 19 October 2026 against the *AEGIS Finance Reporting Checklist* (the
frozen specification for Monthly Income Reports and Financial Standing
Reports), section 9, Acceptance Tests. Business: AUTOBLITZ (BIZ-1001) on the
local development server, signed in as an administrator. Code: commit 9df7ada
plus the uncommitted Phase 6 to 8 work.

**Result: all eight acceptance tests passed.**

## Test data

TEST records seeded straight into the database and removed after the run:
four accounts (TEST Cash box, TEST BDO savings bank account, TEST BPI
passbook, TEST GCash), five invoices (three in September 2026 totalling
2,800,000, one 90+ days old from 1 July, one in October), seven bills (six in
September totalling 1,950,000, one in October not yet due), seven payments
(collections, bill payments, one transfer) and one cash count off by 500.
This is the specification's own September 2026 example.

Tests 1, 2 and 6 were checked against totals worked out by a separate script
that reads the raw records and adds them up with plain loops, importing none
of AEGIS's code.

## The eight tests

| # | Test | What was done | Expected | Observed | Result |
|---|------|---------------|----------|----------|--------|
| 1 | Net income matches a hand total | September 2026: independent sum of invoices and bills dated in the month, against the Income tab and the frozen report | 2,800,000 - 1,950,000 = 850,000.00 | Income tab: sales 2,800,000.00, costs 1,950,000.00, net income 850,000.00, margin 30.4%; the frozen Revision 1 matches | PASS |
| 2 | Standing matches Cash + Bank/Passbook + AR - AP | Independent balances (opening plus payments, transfers both ways) and amounts still owed, against the Standing tab, at the end of Sep 30 and today | Sep 30: 170,000 + 1,200,000 + 50,000 + 10,000 + 1,320,000 - 570,000 = 2,180,000. Oct 19: AR 1,470,000, AP 600,000, position 2,300,000 | Every line equal on both days; the Sep 30 page also states it matches the frozen report | PASS |
| 3 | A passbook cannot double-count a bank balance | Entered the existing BDO account again as a passbook, bank typed "B.D.O.", number with spaces; then drilled Bank and Passbook | Refused; each account under one line | Refused: "already on record as MA-1002 (TEST BDO savings). A passbook is the same money as its bank account, so each account is entered once." Still four accounts. Bank drill holds only MA-1002, Passbook only MA-1003 | PASS |
| 4 | Every owner figure drills down to its displayed amount | Clicked every figure button on the Overview (5), the September Income report (9) and today's Standing report (11) | Each drill-down adds up to the figure shown | 25 of 25: "N records, adding up to X: the figure shown." | PASS |
| 5 | 90+ day AR cannot stay without required remarks and next action | Invoice of 1 July with remark "Not yet paid": checked the flags, saved with the remark unchanged, saved with the next action blank, then saved complete | Flagged; first two saves refused; complete save clears the flag | Flagged on the invoice, in a red notice and in the "90+ without required follow-up" tile. Save 1 refused: "'Not yet paid' is not an acceptable remark." Save 2 refused: "Record the next action." Save 3 accepted, logged in the invoice's history; flag, notice and Overview follow-up alert cleared, "receivable over 90 days" alert kept | PASS |
| 6 | All outstanding AP visible, including not yet due | Payables tab against the independent list of bills with money still owed | 4 bills, including BL-1007 due 5 November | 4 bills: two Overdue, one Due within 7 days, BL-1007 under Due within 30 days ("Due in 17 days") | PASS |
| 7 | Month-end PDFs generated, the two reports separate | Restarted the server with the test data and no reports; waited for the close timer; read September's two PDFs | Both reports for each ended month, made automatically; income PDF without balances, standing PDF without income | 78 seconds after start, with no click: "[finance] BIZ-1001: closed 2026-07, 2026-08, 2026-09", six reports, six PDFs. Income PDF: sales, costs, net income, margin, breakdown, records; no balance, receivable, payable or position. Standing PDF: balances, AR, AP, position, exceptions, records; no sales or net income. Figures equal tests 1 and 2 | PASS |
| 8 | A revised report after an approved correction, earlier version traceable | Entered a 25,000 contractor bill dated 29 September after the close; reviewed the change on the Reports tab; issued Revision 2 with a reason; reopened Revision 1 | Revision 2 issued; Revision 1 unchanged and still viewable | Review listed exactly the added bill (costs 1,950,000 to 1,975,000). Revision 2: net income 825,000, by Ahmed Ben, with the reason. Revision 1 still shows 850,000; its drill-down still lists the original six bills; its stored PDF is byte-identical before and after (same SHA-256); Revision 2 has its own PDF | PASS |

## Specification coverage

| Section | Requirement | Status |
|---------|-------------|--------|
| 1 Monthly Income Report | Month and year, total sales, total costs, net income, net margin, the two formulas, the nine-line breakdown | Done |
| 1 Income rules | Only the month's sales and costs; no AR/AP balances, no cash/bank/passbook, no position; drill-down | Done |
| 2 Financial Standing | Cash on hand, bank accounts, passbook accounts, e-wallets, total AR, total AP, position, the formula | Done |
| 2 Controls and exceptions | Passbook counted once; AR 90+, overdue AP, AP due within 7 days, unreconciled differences, owner-attention items | Done |
| 3 AR screen | All twelve columns, the four aging buckets, the 90+ day control | Done |
| 4 AP screen | Every outstanding bill, all twelve columns, the six status groups | Done |
| 5 Owner dashboard | Exception-first Finance Overview: the five figures and the five critical alerts | Done |
| 6 Month-end reports | Two separate reports made automatically after each month closes, with the listed contents | Done |
| 7 Year-end reports | Annual Income Report and Year-End Financial Standing with the listed contents | Done (checked in Phase 7 on 2025 test data) |
| 8 Generation and control | Automatic monthly and annual reports, automatic PDFs, archive by month and year, drill-down everywhere, corrections as new revisions, AI that never invents figures | Done, with the notes below |
| 9 Acceptance tests | The eight above | All passed |

## Notes, limits and open items

1. **Corrections work differently from the original plan.** The plan said
   entries dated in a closed month would be held until approved. Instead
   they save normally, the frozen report never changes, and the month is
   flagged (Overview, its live report, the Reports tab) until an
   administrator reviews the exact differences and issues the next revision.
   This meets "corrections create a new report revision instead of silently
   replacing historical reports"; blocking back-dating outright would be a
   further change.
2. **One late unpaid entry can flag many standing reports**, one for each
   later month-end, and each is revised on its own. A "revise every affected
   report" action would save the owner clicks.
3. **The main Dashboard still uses the booking ledger.** The Phase 1 plan said
   its Revenue and Expenses tiles would switch to Finance figures for a
   business with Finance; that was not built. Until it is, the Dashboard's
   booked revenue and Finance's invoiced sales can show different numbers.
4. **The AI number check has one gap:** an invented sum that happens to equal
   another figure in the report would pass. The prompt forbids sums.
5. **`npm run finance:close` cannot render PDFs** (react-pdf under the command
   line's conditions); reports it closes get their PDFs the first time they
   are opened, from the frozen figures. The in-server timer renders them at
   once, as test 7 shows.
6. **The automatic close needs a long-running server** or a scheduled
   `npm run finance:close` on the production host.
7. **Not browser-tested:** the Finance screens as a member (no member account
   was signed in), and the annual close fired by the timer on an actual
   1 January (the same function was run by the button on 2025 data).
8. **Bank balances are not connected to any bank.** They come from recorded
   payments and are checked by entering passbook or statement balances as
   counts.
9. **Real records waiting:** AUTOBLITZ's three completed job orders
   (JO-1001 to JO-1003) have no invoice and its four posted supplier receipts
   (GR-1001 to GR-1004) have no bill; Finance flags both.

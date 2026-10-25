/**
 * Finance rehearsal.
 *
 *   npm run finance:check
 *
 * Part one proves the Monthly Income Report on the specification's own
 * example (September 2026: sales 2,800,000, costs 1,950,000, net income
 * 850,000, margin 30.4%), with records from other months, void ones and
 * unpaid ones mixed in, and checks it against a total made by hand.
 *
 * Part two proves the Financial Standing Report: balances from opening plus
 * payments, transfers that move money without changing the total, what is
 * still owed on a day, the position worked out independently, and that one
 * account cannot be counted twice.
 *
 * Part three covers AR aging and the 90+ day control, part four the AP status
 * groups, part five the Manila periods and report titles.
 *
 * Part five-b covers the closing items: fees (10,000 gross less 300 MDR is a
 * 9,700 deposit, the 300 a cost of its month; a transfer still changes no
 * income), the duplicate check on reference, name, date and amount, and the
 * old-and-new record a correction keeps; and Money In and Money Out entered
 * on their own, where only a sale or an expense touches Income; and the
 * invoice and receipt intake: what the AI's answer may contain, what sends a
 * reading to Needs Review, and what a confirmed posting must have.
 *
 * Part six makes sure the indexes exist on the configured database (a no-op
 * when they do), then proves the controls they carry: one record per real
 * account (a passbook cannot repeat its bank account), one invoice per
 * number, one bill per receipt, one copy of each report revision. It writes
 * only under a throwaway business id and removes it.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { FINANCE_INDEXES } from "@/lib/data/finance";
import { inventedNumbers, parseFinanceSummary, summaryFacts } from "@/lib/finance-summary";
import { INTAKE_SCHEMA, intakeDay, intakePostProblem, intakeReviewReasons, parseIntakeExtraction } from "@/lib/finance-intake";
import {
  EXPENSE_CATEGORIES,
  FEE_CATEGORY,
  MONEY_NATURES,
  moneyEntryProblem,
  changeSummary,
  describeFeeRule,
  feeFromRule,
  feeProblem,
  feeRuleProblem,
  fieldChanges,
  findDuplicates,
  formatFeeLine,
  netMovementCents,
  sameText,
  settledCents,
  accountIdentity,
  accountInputProblem,
  lowestBalance,
  transferProblem,
  apStatusGroup,
  ar90Problems,
  billInputProblem,
  billPayState,
  billPaymentProblem,
  collectionProblem,
  followUpProblems,
  invoiceInputProblem,
  isOver90,
  nextInvoiceNumber,
  termsDays,
  arAgingBucket,
  daysOutstanding,
  dueLabel,
  figureAddsUp,
  annualIncomeFigures,
  incomeChanges,
  incomeFigures,
  netMarginPercent,
  reconcile,
  reportTitle,
  monthsToClose,
  yearsToClose,
  standingAttention,
  standingChanges,
  standingFigures,
  type StandingBill,
  type StandingInvoice,
  type StandingPayment,
} from "@/lib/finance";
import {
  addMonths,
  daysBetween,
  monthDays,
  monthKeyOf,
  monthLabel,
  monthToClose,
  monthWindow,
  monthsOfYear,
} from "@/lib/finance-periods";
import type { ArFollowUp, ExpenseCategory, MoneyAccount } from "@/types";

const peso = (amount: number) => Math.round(amount * 100);

// ---- Part one: the Monthly Income Report -------------------------------------

function invoice(ref: string, invoiceDate: string, pesos: number, status: "open" | "void" = "open"): StandingInvoice {
  return { ref, number: ref.replace("INV-", ""), customerName: `Customer ${ref}`, invoiceDate, dueDate: invoiceDate, amountCents: peso(pesos), status };
}

function bill(ref: string, billDate: string, pesos: number, category: ExpenseCategory, dueDate = billDate, status: "open" | "void" = "open"): StandingBill {
  return { ref, payee: `Payee ${ref}`, reference: "", billDate, dueDate, amountCents: peso(pesos), category, status };
}

const invoices: StandingInvoice[] = [
  invoice("INV-1", "2026-09-01", 1_200_000),
  invoice("INV-2", "2026-09-15", 900_000),
  invoice("INV-3", "2026-09-30", 700_000),
  // Not September: the day before and the day after, and a void one inside.
  invoice("INV-4", "2026-08-31", 500_000),
  invoice("INV-5", "2026-10-01", 400_000),
  invoice("INV-6", "2026-09-20", 99_999, "void"),
];

const bills: StandingBill[] = [
  bill("BL-1", "2026-09-02", 800_000, "parts", "2026-10-02"),
  bill("BL-2", "2026-09-30", 600_000, "payroll"),
  bill("BL-3", "2026-09-05", 200_000, "rent"),
  bill("BL-4", "2026-09-10", 150_000, "utilities"),
  bill("BL-5", "2026-09-12", 120_000, "advertising"),
  bill("BL-6", "2026-09-25", 80_000, "shop-supplies"),
  bill("BL-7", "2026-08-31", 333_000, "parts"),
  bill("BL-8", "2026-09-26", 44_000, "contractors", "2026-09-26", "void"),
];

const september = incomeFigures("2026-09", invoices, bills);
assert.equal(september.sales.cents, peso(2_800_000));
assert.equal(september.costs.cents, peso(1_950_000));
assert.equal(september.netIncomeCents, peso(850_000));
assert.equal(september.netMarginPercent, 30.4);
console.log("✓ September 2026 example: sales 2,800,000 - costs 1,950,000 = 850,000, margin 30.4%");

// Acceptance test 1: the same month totalled by hand, outside the rules.
const byHandSales = invoices
  .filter((entry) => entry.status === "open" && entry.invoiceDate.startsWith("2026-09"))
  .reduce((sum, entry) => sum + entry.amountCents, 0);
const byHandCosts = bills
  .filter((entry) => entry.status === "open" && entry.billDate.startsWith("2026-09"))
  .reduce((sum, entry) => sum + entry.amountCents, 0);
assert.equal(september.netIncomeCents, byHandSales - byHandCosts);
console.log("✓ net income matches sales minus costs totalled by hand");

assert.deepEqual(
  september.sales.rows.map((row) => row.ref),
  ["INV-1", "INV-2", "INV-3"],
  "only invoices dated in the month, none void",
);
assert.ok(!september.costs.rows.some((row) => row.ref === "BL-7" || row.ref === "BL-8"));
console.log("✓ only records dated in the month count; void ones never do");

assert.ok(figureAddsUp(september.sales) && figureAddsUp(september.costs));
const categoryTotal = EXPENSE_CATEGORIES.reduce((sum, { key }) => {
  assert.ok(figureAddsUp(september.byCategory[key]));
  return sum + september.byCategory[key].cents;
}, 0);
assert.equal(categoryTotal, september.costs.cents);
assert.equal(september.byCategory.parts.cents, peso(800_000));
assert.equal(september.byCategory.contractors.cents, 0);
console.log("✓ every income figure adds up to its rows; the nine categories add up to costs");

assert.deepEqual(
  Object.keys(september).sort(),
  ["byCategory", "costs", "month", "netIncomeCents", "netMarginPercent", "sales"],
  "the income report carries no balance, receivable, payable or position",
);
assert.equal(netMarginPercent(peso(-50_000), 0), null);
assert.equal(netMarginPercent(peso(-50_000), peso(200_000)), -25);
console.log("✓ income carries no cash, bank, AR, AP or position; no margin without sales");

// ---- Part two: the Financial Standing Report ---------------------------------

function account(ref: string, type: MoneyAccount["type"], openingPesos: number, openingDate = "2026-09-01", bankKind?: MoneyAccount["bankKind"]): MoneyAccount {
  return { ref, type, bankKind, name: ref, institution: "", numberLast4: "", openingBalanceCents: peso(openingPesos), openingDate, active: true };
}

function payment(ref: string, accountRef: string, direction: "in" | "out", pesos: number, paidOn: string, link: Partial<StandingPayment> = {}): StandingPayment {
  return { ref, accountRef, direction, kind: "other", amountCents: peso(pesos), paidOn, note: "", status: "recorded", ...link };
}

const accounts: MoneyAccount[] = [
  account("MA-CASH", "cash", 50_000),
  account("MA-BANK", "bank", 1_000_000, "2026-09-01", "account"),
  account("MA-PASS", "bank", 250_000, "2026-09-01", "passbook"),
  account("MA-GCASH", "ewallet", 10_000),
  // Opened after the day asked about, so not there yet.
  account("MA-LATE", "bank", 999_999, "2026-10-01", "account"),
];

const payments: StandingPayment[] = [
  payment("PY-1", "MA-BANK", "in", 1_200_000, "2026-09-20", { kind: "collection", invoiceRef: "INV-1" }),
  payment("PY-2", "MA-CASH", "in", 300_000, "2026-09-22", { kind: "collection", invoiceRef: "INV-2" }),
  payment("PY-3", "MA-PASS", "out", 200_000, "2026-09-05", { kind: "bill", billRef: "BL-3" }),
  payment("PY-4", "MA-BANK", "out", 500_000, "2026-09-30", { kind: "bill", billRef: "BL-1" }),
  // A transfer: cash banked, one record out of cash and into the bank.
  payment("PY-5", "MA-CASH", "out", 100_000, "2026-09-25", { kind: "transfer", toAccountRef: "MA-BANK" }),
  // After the day asked about, and a void one: neither counts.
  payment("PY-7", "MA-BANK", "in", 700_000, "2026-10-02", { kind: "collection", invoiceRef: "INV-3" }),
  { ...payment("PY-8", "MA-CASH", "out", 40_000, "2026-09-28"), status: "void" },
];

const standing = standingFigures("2026-09-30", accounts, payments, invoices, bills);

const cash = 50_000 + 300_000 - 100_000;
const bank = 1_000_000 + 1_200_000 - 500_000 + 100_000 + (250_000 - 200_000);
const ewallet = 10_000;
// INV-1 paid; INV-2 has 600,000 left; INV-3 unpaid on the 30th; INV-4 unpaid;
// INV-5 issued later; INV-6 void.
const receivable = 0 + 600_000 + 700_000 + 500_000;
// BL-1 has 300,000 left; BL-3 paid; BL-7 unpaid; BL-8 void; the rest unpaid.
const payable = 300_000 + 600_000 + 150_000 + 120_000 + 80_000 + 333_000;

assert.equal(standing.cash.cents, peso(cash));
assert.equal(standing.bank.cents, peso(bank));
assert.equal(standing.ewallet.cents, peso(ewallet));
assert.equal(standing.receivable.cents, peso(receivable));
assert.equal(standing.payable.cents, peso(payable));
console.log("✓ balances: opening plus payments up to the day; later and void payments left out");

// Acceptance test 2: the position worked out independently of the rules.
assert.equal(standing.positionCents, peso(cash + bank + ewallet + receivable - payable));
console.log(`✓ position = Cash + Bank/Passbook + E-wallet + AR - AP (${(standing.positionCents / 100).toLocaleString("en-US")})`);

for (const figure of [standing.cash, standing.bank, standing.ewallet, standing.receivable, standing.payable]) {
  assert.ok(figureAddsUp(figure));
}
console.log("✓ every standing figure adds up to its rows");

const withoutTransfer = standingFigures(
  "2026-09-30",
  accounts,
  payments.filter((entry) => entry.kind !== "transfer"),
  invoices,
  bills,
);
assert.equal(withoutTransfer.positionCents, standing.positionCents);
assert.notEqual(withoutTransfer.cash.cents, standing.cash.cents);
console.log("✓ a transfer moves money between accounts without changing the position");

// Acceptance test 3: the same balance cannot be counted twice.
const passbookRows = standing.bank.rows.filter((row) => row.ref === "MA-PASS" && row.kind === "opening");
assert.equal(passbookRows.length, 1);
assert.ok(!standing.cash.rows.some((row) => row.ref === "MA-PASS"));
assert.throws(() => standingFigures("2026-09-30", [...accounts, accounts[1]], payments, invoices, bills), /counted twice/);
assert.equal(accountIdentity("BDO", "0012-3456-7890"), accountIdentity(" bdo ", "001234567890"));
assert.notEqual(accountIdentity("BDO", "001234567890"), accountIdentity("BPI", "001234567890"));
assert.equal(accountIdentity("", ""), null);
console.log("✓ a passbook counts once, under Bank/Passbook; one account cannot be listed twice or registered twice");

// Bank accounts and passbooks are shown as separate lines that add up to Bank/Passbook once.
assert.equal(standing.bankAccounts.cents + standing.passbooks.cents, standing.bank.cents);
assert.ok(standing.passbooks.rows.every((row) => row.accountRef === "MA-PASS"));
assert.ok(!standing.bankAccounts.rows.some((row) => row.accountRef === "MA-PASS"));
assert.ok(figureAddsUp(standing.bankAccounts) && figureAddsUp(standing.passbooks));
console.log("✓ bank accounts and passbooks are separate lines that add up to Bank/Passbook, each account once");

// The exceptions listed under the position, for the same day.
const attention = standingAttention("2026-09-30", standing, invoices, bills, [
  { ref: "RC-1", accountRef: "MA-CASH", asOf: "2026-09-28", differenceCents: peso(-500), status: "open" },
  { ref: "RC-2", accountRef: "MA-CASH", asOf: "2026-10-05", differenceCents: peso(-200), status: "open" },
  { ref: "RC-3", accountRef: "MA-BANK", asOf: "2026-09-15", differenceCents: peso(100), status: "resolved" },
]);
assert.deepEqual(attention.apOverdue.rows.map((row) => row.ref).sort(), ["BL-4", "BL-5", "BL-6", "BL-7"]);
assert.deepEqual(attention.apDue7.rows.map((row) => row.ref).sort(), ["BL-1", "BL-2"]);
assert.equal(attention.apDue7.rows.find((row) => row.ref === "BL-1")!.amountCents, peso(300_000), "what is still owed, not the original");
assert.deepEqual(attention.differences.rows.map((row) => row.ref), ["RC-1"], "open, and counted on or before the day");
assert.deepEqual(attention.ar90.rows, [], "nothing 90 days old on Sep 30");
const december = standingFigures("2026-12-15", accounts, payments, invoices, bills);
const later = standingAttention("2026-12-15", december, invoices, bills, []);
assert.deepEqual(later.ar90.rows.map((row) => row.ref).sort(), ["INV-2", "INV-4"]);
assert.equal(later.ar90.cents, peso(600_000 + 500_000));
for (const figure of [attention.apOverdue, attention.apDue7, attention.differences, later.ar90]) assert.ok(figureAddsUp(figure));
console.log("✓ standing exceptions: AR 90+, overdue AP, AP due in 7 days and open count differences, each for the same day");

// Acceptance test 6: every outstanding payable is there, not only overdue ones.
const notYetDue = standingFigures("2026-09-30", accounts, payments, invoices, [bill("BL-9", "2026-09-29", 5_000, "other", "2026-12-31")]);
assert.equal(notYetDue.payable.rows.length, 1);
console.log("✓ AP includes bills not yet due");

const bankInRows = standing.bank.rows.filter((row) => row.ref === "PY-5");
const cashOutRows = standing.cash.rows.filter((row) => row.ref === "PY-5");
assert.equal(bankInRows.length, 1);
assert.equal(bankInRows[0].amountCents, peso(100_000));
assert.equal(cashOutRows[0].amountCents, peso(-100_000));
assert.match(bankInRows[0].label, /^Transfer in/);
console.log("✓ a transfer is one record: out of one account, into the other");

// Accounts as typed.
const cashInput = { type: "cash" as const, bankKind: null, name: "Petty cash", institution: "", accountNumber: "", openingBalanceCents: peso(5_000), openingDate: "2026-10-01" };
assert.equal(accountInputProblem(cashInput, "2026-10-16"), null);
assert.match(accountInputProblem({ ...cashInput, type: "bank" }, "2026-10-16")!, /bank account or a passbook/);
assert.match(accountInputProblem({ ...cashInput, type: "bank", bankKind: "passbook", institution: "BDO" }, "2026-10-16")!, /account number/);
assert.equal(accountInputProblem({ ...cashInput, type: "bank", bankKind: "passbook", institution: "BDO", accountNumber: "0012 3456" }, "2026-10-16"), null);
assert.match(accountInputProblem({ ...cashInput, type: "ewallet", institution: "GCash" }, "2026-10-16")!, /mobile number/);
assert.match(accountInputProblem({ ...cashInput, openingDate: "2026-10-17" }, "2026-10-16")!, /not come yet/);
assert.match(accountInputProblem({ ...cashInput, openingBalanceCents: -1 }, "2026-10-16")!, /zero or more/);
console.log("✓ a bank, passbook or e-wallet account needs its number; no future or negative opening balance");

// Transfers as typed.
const cashBox = accounts[0];
const bdo = accounts[1];
const move = { fromRef: cashBox.ref, toRef: bdo.ref, amountCents: peso(1_000), paidOn: "2026-10-01" };
assert.equal(transferProblem(move, cashBox, bdo, "2026-10-16"), null);
assert.match(transferProblem({ ...move, toRef: cashBox.ref }, cashBox, cashBox, "2026-10-16")!, /two different/);
assert.match(transferProblem({ ...move, paidOn: "2026-10-17" }, cashBox, bdo, "2026-10-16")!, /future/);
assert.match(transferProblem({ ...move, paidOn: "2026-08-31" }, cashBox, bdo, "2026-10-16")!, /opening day/);
assert.match(transferProblem(move, cashBox, { ...bdo, active: false }, "2026-10-16")!, /no longer used/);
assert.match(transferProblem({ ...move, amountCents: 0 }, cashBox, bdo, "2026-10-16")!, /above zero/);
console.log("✓ transfers need two active accounts, an amount, and a day after both opened and not in the future");

// A back-dated payment out must not leave a later day below zero.
const box = account("MA-BOX", "cash", 1_000);
const spent = [payment("PY-20", "MA-BOX", "out", 800, "2026-09-20")];
assert.deepEqual(lowestBalance(box, spent, "2026-09-10", "2026-10-16"), { cents: peso(200), dateKey: "2026-09-20" });
const backDated = [...spent, payment("PY-21", "MA-BOX", "out", 500, "2026-09-10", { kind: "transfer", toAccountRef: "MA-BANK" })];
assert.deepEqual(lowestBalance(box, backDated, "2026-09-10", "2026-10-16"), { cents: peso(-300), dateKey: "2026-09-20" });
console.log("✓ a back-dated transfer is checked against every later day, not only its own");

assert.deepEqual(reconcile(peso(100), peso(100)), { differenceCents: 0, status: "matched" });
assert.deepEqual(reconcile(peso(100), peso(95)), { differenceCents: peso(-5), status: "open" });
console.log("✓ a counted balance that differs from the book stays open");

// ---- Part three: AR aging and the 90+ day control ----------------------------

assert.equal(daysOutstanding("2026-07-18", "2026-10-16"), 90);
assert.equal(daysOutstanding("2026-10-20", "2026-10-16"), 0);
assert.deepEqual([0, 30, 31, 60, 61, 90, 91, 400].map(arAgingBucket), [
  "0-30", "0-30", "31-60", "31-60", "61-90", "61-90", "90+", "90+",
]);
console.log("✓ aging buckets: 0-30, 31-60, 61-90, then 90+ from day 91");

const empty: ArFollowUp = { reasonUnpaid: "", remarks: "", responsiblePerson: "", lastAction: "", nextAction: "", nextFollowUpDate: null };
assert.equal(ar90Problems(empty, "2026-10-16").length, 6);

const notYetPaid = ar90Problems({ ...empty, remarks: "Not yet paid." }, "2026-10-16");
assert.match(notYetPaid.find((problem) => problem.field === "remarks")!.message, /not an acceptable remark/);
assert.ok(ar90Problems({ ...empty, reasonUnpaid: "UNPAID" }, "2026-10-16").some((problem) => problem.field === "reasonUnpaid"));

const complete: ArFollowUp = {
  reasonUnpaid: "Fleet client waiting on their head office to release payment",
  remarks: "Spoke to Ms. Reyes on 10 Oct; she confirmed the cheque is signed and will be ready for pickup next week.",
  responsiblePerson: "Rosa",
  lastAction: "Called accounts payable on 10 Oct",
  nextAction: "Collect the cheque at their office",
  nextFollowUpDate: "2026-10-22",
};
assert.deepEqual(ar90Problems(complete, "2026-10-16"), []);
assert.deepEqual(
  ar90Problems({ ...complete, remarks: "Will pay soon." }, "2026-10-16").map((problem) => problem.field),
  ["remarks"],
);
assert.deepEqual(
  ar90Problems(complete, "2026-10-23").map((problem) => problem.field),
  ["nextFollowUpDate"],
  "a follow-up date that has passed",
);
console.log("✓ 90+ control: all six fields required, \"Not yet paid\" refused, passed follow-ups flagged");

// Follow-up saves: nothing required under 90 days, everything over.
assert.deepEqual(followUpProblems(empty, "2026-07-19", "2026-10-16"), [], "day 89: no control yet");
assert.deepEqual(followUpProblems(empty, "2026-07-18", "2026-10-16"), [], "day 90: still 61-90");
assert.equal(followUpProblems(empty, "2026-07-17", "2026-10-16").length, 6, "day 91: all six required");
assert.equal(followUpProblems({ ...complete, remarks: "Not yet paid" }, "2026-07-17", "2026-10-16")[0].field, "remarks");
assert.deepEqual(followUpProblems(complete, "2026-07-17", "2026-10-16"), []);
assert.equal(isOver90("2026-07-17", "2026-10-16"), true);
assert.equal(isOver90("2026-07-18", "2026-10-16"), false);
console.log("✓ follow-up saves: free under 90 days, refused over 90 until all six fields are filled properly");

// Invoices as typed, numbering, and collections.
assert.equal(nextInvoiceNumber([]), "0001");
assert.equal(nextInvoiceNumber(["0007", "0012", "0009"]), "0013");
assert.equal(nextInvoiceNumber(["SI-0099", "SI-0100"]), "SI-0101");
assert.equal(nextInvoiceNumber(["A-9", "cash sale"]), "A-10");
const issued = { customerName: "Reyes Trucking", number: "0001", invoiceDate: "2026-10-05", dueDate: "2026-11-04", amountCents: peso(12_500), nextFollowUpDate: null };
assert.equal(invoiceInputProblem(issued, "2026-10-16"), null);
assert.match(invoiceInputProblem({ ...issued, customerName: "" }, "2026-10-16")!, /customer/);
assert.match(invoiceInputProblem({ ...issued, number: " " }, "2026-10-16")!, /invoice number/);
assert.match(invoiceInputProblem({ ...issued, invoiceDate: "2026-10-17" }, "2026-10-16")!, /future/);
assert.match(invoiceInputProblem({ ...issued, dueDate: "2026-10-04" }, "2026-10-16")!, /before the invoice/);
const owed = { invoiceDate: "2026-10-05", outstandingCents: peso(12_500), status: "open" as const };
assert.equal(collectionProblem({ amountCents: peso(5_000), paidOn: "2026-10-10" }, owed, "2026-10-16"), null);
assert.match(collectionProblem({ amountCents: peso(13_000), paidOn: "2026-10-10" }, owed, "2026-10-16")!, /more than is still owed/);
assert.match(collectionProblem({ amountCents: peso(100), paidOn: "2026-10-04" }, owed, "2026-10-16")!, /before the invoice/);
assert.match(collectionProblem({ amountCents: peso(100), paidOn: "2026-10-10" }, { ...owed, outstandingCents: 0 }, "2026-10-16")!, /collected in full/);
console.log("✓ invoices: next number keeps its prefix and width; no future dates; no collecting more than is owed");

// ---- Part four: AP status groups ---------------------------------------------

const today = "2026-10-16";
const groups = (
  [
    ["2026-12-01", "due-later"],
    ["2026-11-15", "due-30"],
    ["2026-10-24", "due-30"],
    ["2026-10-23", "due-7"],
    ["2026-10-17", "due-7"],
    ["2026-10-16", "due-today"],
    ["2026-10-15", "overdue"],
    ["2026-09-16", "overdue"],
    ["2026-09-15", "critical-overdue"],
  ] as const
).map(([due, expected]) => [apStatusGroup(due, today), expected]);
for (const [actual, expected] of groups) assert.equal(actual, expected);
// Bills as typed, and payments against them.
assert.deepEqual(
  ["30 days", "Net 15 days", "60-day PDC", "Cash", "COD", "cash on delivery", "15d", "", "Monthly"].map(termsDays),
  [30, 15, 60, 0, 0, 0, 15, null, null],
);
const typed = { payee: "Davao Light", billDate: "2026-10-05", dueDate: "2026-10-20", amountCents: peso(4_500), category: "utilities" as const };
assert.equal(billInputProblem(typed, today), null);
assert.match(billInputProblem({ ...typed, payee: " " }, today)!, /payee/);
assert.match(billInputProblem({ ...typed, billDate: "2026-10-17" }, today)!, /future/);
assert.match(billInputProblem({ ...typed, dueDate: "2026-10-04" }, today)!, /before the bill/);
assert.match(billInputProblem({ ...typed, amountCents: 0 }, today)!, /above zero/);
assert.match(billInputProblem({ ...typed, category: "fuel" as never }, today)!, /category/);
const owing = { billDate: "2026-10-05", outstandingCents: peso(4_500), status: "open" as const };
assert.equal(billPaymentProblem({ amountCents: peso(2_000), paidOn: "2026-10-10" }, owing, today), null);
assert.match(billPaymentProblem({ amountCents: peso(5_000), paidOn: "2026-10-10" }, owing, today)!, /more than is still owed/);
assert.match(billPaymentProblem({ amountCents: peso(100), paidOn: "2026-10-01" }, owing, today)!, /before the bill/);
assert.match(billPaymentProblem({ amountCents: peso(100), paidOn: "2026-10-17" }, owing, today)!, /future/);
assert.match(billPaymentProblem({ amountCents: peso(100), paidOn: "2026-10-10" }, { ...owing, outstandingCents: 0 }, today)!, /paid in full/);
assert.match(billPaymentProblem({ amountCents: peso(100), paidOn: "2026-10-10" }, { ...owing, status: "void" }, today)!, /void/);
assert.deepEqual(
  [billPayState(100, 0, "open"), billPayState(100, 40, "open"), billPayState(100, 100, "open"), billPayState(100, 0, "void")],
  ["Unpaid", "Part paid", "Paid", "Void"],
);
console.log("✓ bills: terms read as days, no future dates, no paying more than is owed or before the bill");

assert.equal(dueLabel("2026-10-21", today), "Due in 5 days");
assert.equal(dueLabel("2026-10-16", today), "Due today");
assert.equal(dueLabel("2026-10-15", today), "1 day overdue");
console.log("✓ AP groups: due later, within 30, within 7, today, overdue, critical after 30 days overdue");

// ---- Part five: Manila periods and titles ------------------------------------

// 00:05 on 1 October in Manila is still 30 September in UTC.
assert.equal(monthToClose(new Date("2026-09-30T16:05:00Z")), "2026-09");
assert.equal(monthToClose(new Date("2026-09-30T15:55:00Z")), "2026-08");
assert.equal(monthKeyOf(new Date("2026-09-30T23:00:00Z")), "2026-10");
assert.equal(monthWindow("2026-09").from.toISOString(), "2026-08-31T16:00:00.000Z");
assert.equal(monthWindow("2026-12").to.toISOString(), "2026-12-31T16:00:00.000Z");
assert.deepEqual(monthDays("2028-02"), { first: "2028-02-01", last: "2028-02-29" });
assert.equal(addMonths("2026-12", 1), "2027-01");
assert.equal(addMonths("2026-01", -1), "2025-12");
assert.equal(monthsOfYear(2026).length, 12);
assert.equal(monthLabel("2026-09"), "September 2026");
assert.equal(daysBetween("2026-02-28", "2026-03-01"), 1);
console.log("✓ months turn over at Manila midnight, not UTC");

// The month-end close: which months are due, and catching up after downtime.
const onFirst = new Date("2026-09-30T16:05:00Z"); // 00:05 on 1 October in Manila
assert.deepEqual(monthsToClose("2026-08", onFirst, new Set()), ["2026-08", "2026-09"]);
assert.deepEqual(monthsToClose("2026-08", onFirst, new Set(["2026-08"])), ["2026-09"]);
assert.deepEqual(monthsToClose("2026-08", new Date("2026-09-30T15:55:00Z"), new Set()), ["2026-08"], "September is not over at 23:55 Manila");
assert.deepEqual(monthsToClose("2026-10", onFirst, new Set()), [], "a month still running is never closed");
assert.deepEqual(monthsToClose(null, onFirst, new Set()), [], "no records, no reports");
console.log("✓ close: every ended month without a report, oldest first, from Manila midnight on the 1st");

// The year-end pair: after December closes, never before, and caught up.
assert.deepEqual(yearsToClose("2025-11", onFirst, new Set()), ["2025"], "2026 is not over in October");
assert.deepEqual(yearsToClose("2025-11", new Date("2026-12-31T16:05:00Z"), new Set()), ["2025", "2026"], "00:05 on 1 January in Manila");
assert.deepEqual(yearsToClose("2025-11", new Date("2026-12-31T15:55:00Z"), new Set(["2025"])), [], "December 2026 still running");
assert.deepEqual(yearsToClose(null, onFirst, new Set()), []);
console.log("✓ year-end close: once December has ended in Manila, for every year not yet closed");

// The Annual Income Report: the year is exactly its twelve months.
const year = annualIncomeFigures("2026", invoices, bills);
assert.equal(year.sales.cents, peso(1_200_000 + 900_000 + 700_000 + 500_000 + 400_000));
assert.equal(year.costs.cents, peso(800_000 + 600_000 + 200_000 + 150_000 + 120_000 + 80_000 + 333_000));
assert.equal(year.months.length, 12);
assert.equal(year.months.reduce((sum, line) => sum + line.salesCents, 0), year.sales.cents);
assert.equal(year.months.reduce((sum, line) => sum + line.costsCents, 0), year.costs.cents);
assert.equal(year.months.reduce((sum, line) => sum + line.netIncomeCents, 0), year.netIncomeCents);
for (const line of year.months) {
  const month = incomeFigures(line.month, invoices, bills);
  assert.equal(line.netIncomeCents, month.netIncomeCents, `${line.month} matches its monthly report`);
}
assert.equal(year.months.find((line) => line.month === "2026-09")!.netIncomeCents, peso(850_000));
assert.equal(
  EXPENSE_CATEGORIES.reduce((sum, { key }) => sum + year.byCategory[key].cents, 0),
  year.costs.cents,
  "category totals add up to annual costs",
);
assert.equal(year.netMarginPercent, netMarginPercent(year.netIncomeCents, year.sales.cents));
assert.equal(annualIncomeFigures("2025", invoices, bills).sales.cents, 0, "nothing dated in 2025");
console.log("✓ annual income: the twelve months add up to the year and each matches its monthly report");

// Corrections: what changed since a report froze its figures.
assert.deepEqual(incomeChanges(september, incomeFigures("2026-09", invoices, bills)), [], "nothing changed, nothing flagged");
const lateBill = bill("BL-9", "2026-09-28", 50_000, "utilities", "2026-10-28");
const corrected = incomeFigures("2026-09", invoices, [...bills, lateBill]);
const changes = incomeChanges(september, corrected);
assert.equal(changes.length, 1, "only costs changed");
assert.equal(changes[0].label, "Costs & Expenses");
assert.equal(changes[0].toCents - changes[0].fromCents, peso(50_000));
assert.deepEqual(changes[0].rows.map((row) => [row.ref, row.fromCents, row.toCents]), [["BL-9", null, peso(50_000)]]);
const october = incomeFigures("2026-10", invoices, [...bills, lateBill]);
assert.deepEqual(incomeChanges(incomeFigures("2026-10", invoices, bills), october), [], "a September bill does not touch October");

const frozenStanding = standingFigures("2026-09-30", accounts, payments, invoices, bills);
assert.deepEqual(standingChanges(frozenStanding, standingFigures("2026-09-30", accounts, payments, invoices, bills)), []);
const latePayment = payment("PY-9", "MA-CASH", "out", 20_000, "2026-09-29", { kind: "bill", billRef: "BL-4" });
const moved = standingChanges(frozenStanding, standingFigures("2026-09-30", accounts, [...payments, latePayment], invoices, bills));
assert.deepEqual(moved.map((change) => change.label), ["Cash on hand", "Accounts payable"]);
assert.deepEqual(
  moved.find((change) => change.label === "Accounts payable")!.rows.map((row) => [row.ref, row.fromCents, row.toCents]),
  [["BL-4", peso(150_000), peso(130_000)]],
  "a part payment changes what is still owed on the bill",
);
const after = standingFigures("2026-09-30", accounts, [...payments, payment("PY-10", "MA-CASH", "out", 1_000, "2026-10-03")], invoices, bills);
assert.deepEqual(standingChanges(frozenStanding, after), [], "a payment dated after the month-end does not touch its report");
console.log("✓ corrections: changes since a report are found record by record, and only for that month");

// The AI summary may only repeat figures the frozen report contains.
const frozenIncome = {
  kind: "income" as const, period: "2026-09", revision: 1, income: september, accountNames: {}, businessName: "TEST", reason: "",
  generatedAt: "2026-10-01T00:05:00.000Z", generatedBy: "AEGIS (automatic close)",
};
const facts = summaryFacts(frozenIncome);
assert.equal(JSON.stringify(facts).includes("INV-"), false, "no single records are sent");
assert.equal(JSON.stringify(facts).includes("Customer"), false, "no customer names are sent");
const honest = {
  summary: "In September 2026 the business made a net income of ₱ 850,000.00 on sales of ₱2,800,000 against costs of ₱ 1,950,000.00, a 30.4% net margin.",
  points: ["Parts / Materials were the largest cost at ₱ 800,000.00 across 6 bills.", "Sales came from 3 invoices."],
};
assert.deepEqual(inventedNumbers(honest, facts), [], "exact figures, however the commas and decimals are written, are allowed");
assert.deepEqual(inventedNumbers({ summary: "Net income was about ₱0.85M.", points: [] }, facts), ["0.85"]);
assert.deepEqual(inventedNumbers({ summary: "Costs were 69.6% of sales.", points: [] }, facts), ["69.6"], "a ratio the report does not show");
assert.deepEqual(inventedNumbers({ summary: "Payroll and rent came to ₱ 800,000.00 together.", points: ["Rent and utilities: ₱350,000"] }, facts), ["350000"], "a sum the report does not show");
assert.equal(parseFinanceSummary({ summary: "", points: [] }), null);
assert.equal(parseFinanceSummary({ summary: "Fine.", points: [1] }), null);
assert.equal(parseFinanceSummary({ summary: "Fine.", points: ["a", "b", "c", "d", "e"] })!.points.length, 4);
const standingFacts = summaryFacts({
  ...frozenIncome, kind: "standing" as const, income: undefined, standing, attention: standingAttention("2026-09-30", standing, invoices, bills, []),
});
assert.ok(JSON.stringify(standingFacts).includes("₱ 2,327,000.00"), "the standing summary sees the position");
assert.equal("sales" in standingFacts, false, "a standing summary is not given income figures");
console.log("✓ AI summary: totals only, no names or records; any figure not in the report rejects the answer");

assert.equal(reportTitle("income", "2026-09", 1), "September 2026 Income Report - Revision 1");
assert.equal(reportTitle("standing", "2026-09", 2), "September 2026 Financial Standing Report - Revision 2");
assert.equal(reportTitle("annual-income", "2026", 1), "2026 Annual Income Report - Revision 1");
console.log("✓ report titles carry their revision");

// ---- Part five-b: fees, duplicates and corrections ----------------------------

// The checklist's own example: 10,000 gross - 300 MDR = 9,700 net deposit.
const mdr = { percentBps: 300, fixedCents: 0 };
assert.equal(feeFromRule(mdr, peso(10_000)), peso(300));
assert.equal(feeFromRule({ percentBps: 250, fixedCents: peso(15) }, peso(1_000)), peso(40));
assert.equal(describeFeeRule({ percentBps: 250, fixedCents: peso(15) }), "2.5% + ₱ 15.00");
assert.equal(feeRuleProblem({ name: "Terminal", kind: "card", percentBps: 10_000, fixedCents: 0 }) !== null, true, "100% is refused");
assert.equal(feeRuleProblem({ name: "Terminal", kind: "card", percentBps: 0, fixedCents: 0 }) !== null, true, "a rule must take something");
assert.equal(feeRuleProblem({ name: "Terminal", kind: "card", percentBps: 300, fixedCents: 0 }), null);
assert.notEqual(feeProblem({ cents: peso(10_000), kind: "card", ruleRef: null }, peso(10_000), "in"), null, "a fee cannot take all money received");
assert.equal(feeProblem({ cents: peso(10_000), kind: "bank", ruleRef: null }, peso(10_000), "out"), null, "on money out it is paid on top");
assert.equal(feeProblem(null, peso(10_000), "in"), null);

const feeAccounts: MoneyAccount[] = [account("MA-BDO", "bank", 0, "2026-10-01", "account"), account("MA-GC", "ewallet", 5_000, "2026-10-01")];
const feeInvoices = [invoice("INV-F1", "2026-10-05", 10_000)];
const feeBills = [bill("BL-F1", "2026-10-06", 1_000, "parts", "2026-10-20")];
const cardCollection = payment("PY-F1", "MA-BDO", "in", 10_000, "2026-10-07", {
  kind: "collection",
  invoiceRef: "INV-F1",
  fee: { cents: peso(300), kind: "card" },
});
const billWithCharge = payment("PY-F2", "MA-BDO", "out", 1_000, "2026-10-08", { kind: "bill", billRef: "BL-F1", fee: { cents: peso(25), kind: "bank" } });
const feePayments = [cardCollection, billWithCharge];

assert.equal(netMovementCents(cardCollection), peso(9_700));
assert.equal(netMovementCents(billWithCharge), -peso(1_025));
assert.equal(settledCents(feePayments, { invoiceRef: "INV-F1" }, "2026-10-31"), peso(10_000), "the gross settles the invoice");
assert.equal(settledCents(feePayments, { billRef: "BL-F1" }, "2026-10-31"), peso(1_000), "the bill is settled by the amount, not the fee");
const feeStanding = standingFigures("2026-10-31", feeAccounts, feePayments, feeInvoices, feeBills);
assert.equal(feeStanding.bank.cents, peso(9_700 - 1_025), "the account holds what actually arrived and left");
assert.equal(feeStanding.receivable.cents, 0);
assert.equal(feeStanding.payable.cents, 0);
assert.ok(feeStanding.bank.rows.some((row) => row.ref === "PY-F1" && row.label.includes("net ₱ 9,700.00")));
assert.equal(formatFeeLine(peso(10_000), peso(300), "in"), "gross ₱ 10,000.00 less fee ₱ 300.00 = net ₱ 9,700.00");
console.log("✓ fees: 10,000 gross - 300 MDR = 9,700 deposited; a bank charge is paid on top; the gross settles the invoice or bill");

const feeIncome = incomeFigures("2026-10", feeInvoices, feeBills, feePayments);
assert.equal(feeIncome.sales.cents, peso(10_000));
assert.equal(feeIncome.costs.cents, peso(1_000 + 300 + 25), "the bill and both fees");
assert.equal(feeIncome.byCategory[FEE_CATEGORY].cents, peso(325));
assert.ok(figureAddsUp(feeIncome.costs) && figureAddsUp(feeIncome.byCategory[FEE_CATEGORY]));
assert.equal(EXPENSE_CATEGORIES.reduce((sum, { key }) => sum + feeIncome.byCategory[key].cents, 0), feeIncome.costs.cents);
assert.equal(incomeFigures("2026-09", feeInvoices, feeBills, feePayments).costs.cents, 0, "a fee is a cost of the month it was paid");
assert.equal(
  incomeFigures("2026-10", feeInvoices, feeBills, feePayments.map((entry) => ({ ...entry, status: "void" as const }))).costs.cents,
  peso(1_000),
  "a void payment's fee is no cost",
);
// Income and Standing still agree: the position fell by exactly the fees, the only cost not on a bill.
const noFees = standingFigures("2026-10-31", feeAccounts, feePayments.map((entry) => ({ ...entry, fee: undefined })), feeInvoices, feeBills);
assert.equal(noFees.positionCents - feeStanding.positionCents, peso(325));
console.log("✓ fees are costs under Other Expenses in the month paid, and the position falls by exactly the fees");

const plainTransfer = payment("PY-F3", "MA-GC", "out", 2_000, "2026-10-09", { kind: "transfer", toAccountRef: "MA-BDO" });
const feeTransfer = { ...plainTransfer, ref: "PY-F4", fee: { cents: peso(15), kind: "ewallet" as const } };
const beforeTransfer = standingFigures("2026-10-31", feeAccounts, feePayments, feeInvoices, feeBills);
const withTransfer = standingFigures("2026-10-31", feeAccounts, [...feePayments, plainTransfer], feeInvoices, feeBills);
assert.equal(withTransfer.positionCents, beforeTransfer.positionCents, "a transfer changes no position");
assert.equal(withTransfer.ewallet.cents, beforeTransfer.ewallet.cents - peso(2_000), "the source decreases");
assert.equal(withTransfer.bank.cents, beforeTransfer.bank.cents + peso(2_000), "the destination increases");
assert.equal(
  incomeFigures("2026-10", feeInvoices, feeBills, [...feePayments, plainTransfer]).netIncomeCents,
  feeIncome.netIncomeCents,
  "a transfer is neither income nor expense",
);
const withFeeTransfer = standingFigures("2026-10-31", feeAccounts, [...feePayments, feeTransfer], feeInvoices, feeBills);
assert.equal(withFeeTransfer.ewallet.cents, beforeTransfer.ewallet.cents - peso(2_015), "the source pays the fee");
assert.equal(withFeeTransfer.bank.cents, beforeTransfer.bank.cents + peso(2_000), "the destination receives the full amount");
assert.equal(
  incomeFigures("2026-10", feeInvoices, feeBills, [...feePayments, feeTransfer]).netIncomeCents,
  feeIncome.netIncomeCents - peso(15),
  "only the transfer's fee is an expense",
);
console.log("✓ transfers: source down, destination up, no income or expense; a transfer fee is the only cost in it");

// Duplicates: the same document on reference, name, date and amount.
const onFile = [
  { ref: "BL-D1", party: "Davao Auto Parts, Inc.", reference: "D.R. 4471", dateKey: "2026-10-03", amountCents: peso(12_500), label: "BL-D1" },
  { ref: "BL-D2", party: "Davao Light", reference: "", dateKey: "2026-10-05", amountCents: peso(8_200), label: "BL-D2" },
];
const lookup = (party: string, reference: string, dateKey: string, pesos: number) =>
  findDuplicates({ party, reference, dateKey, amountCents: peso(pesos) }, onFile).map((match) => match.ref);
assert.deepEqual(lookup("davao auto parts inc", "DR4471", "2026-10-04", 12_000), ["BL-D1"], "same reference and name, however typed");
assert.deepEqual(lookup("DAP Davao", "dr-4471", "2026-10-03", 12_500), ["BL-D1"], "same reference and amount under another spelling of the name");
assert.deepEqual(lookup("Davao Light", "", "2026-10-05", 8_200), ["BL-D2"], "same name, date and amount with no reference");
assert.deepEqual(lookup("Davao Light", "", "2026-11-05", 8_200), [], "the next month's bill for the same amount is not a duplicate");
assert.deepEqual(lookup("Davao Auto Parts", "DR 4472", "2026-10-03", 9_000), [], "another reference and amount");
assert.equal(sameText("", ""), false, "two empty references are not a match");
console.log("✓ duplicates: reference, name, date and amount compared, punctuation and case ignored");

// Corrections keep every changed field, old and new.
const changed = fieldChanges([
  { field: "Amount", from: "₱ 4,500.00", to: "₱ 5,400.00" },
  { field: "Payee", from: "Davao Light", to: "Davao Light" },
  { field: "Remarks", from: "", to: "Typo on entry" },
]);
assert.deepEqual(changed.map((change) => change.field), ["Amount", "Remarks"]);
assert.equal(changeSummary(changed), "Amount: ₱ 4,500.00 to ₱ 5,400.00; Remarks: (empty) to Typo on entry");
console.log("✓ corrections: only changed fields are recorded, each with its old and new value");

// Money In and Money Out on their own.
const entry = {
  direction: "in" as const,
  nature: "owner-capital" as const,
  accountRef: "MA-BDO",
  amountCents: peso(20_000),
  paidOn: "2026-10-10",
  party: "",
  reference: "",
  description: "",
  category: null,
};
assert.equal(moneyEntryProblem(entry, "2026-10-24"), null, "owner's money needs no name or description");
assert.notEqual(moneyEntryProblem({ ...entry, direction: "out" }, "2026-10-24"), null, "owner's money in is not money out");
assert.notEqual(moneyEntryProblem({ ...entry, paidOn: "2026-10-25" }, "2026-10-24"), null, "not in the future");
assert.notEqual(moneyEntryProblem({ ...entry, nature: "sale", party: "Walk-in" }, "2026-10-24"), null, "a sale needs its receipt number");
assert.equal(moneyEntryProblem({ ...entry, nature: "sale", party: "Walk-in", reference: "OR 1001" }, "2026-10-24"), null);
assert.notEqual(
  moneyEntryProblem({ ...entry, direction: "out", nature: "expense", party: "Petron" }, "2026-10-24"),
  null,
  "an expense needs its category",
);
assert.notEqual(moneyEntryProblem({ ...entry, nature: "other-in" }, "2026-10-24"), null, "other money says what it is");
assert.notEqual(moneyEntryProblem({ ...entry, nature: "loan-received" }, "2026-10-24"), null, "a loan names its lender");
assert.deepEqual(
  MONEY_NATURES.filter((item) => item.effect !== "none").map((item) => item.key),
  ["sale", "expense"],
  "only a sale and an expense touch Income",
);

const capital = payment("PY-M1", "MA-BDO", "in", 20_000, "2026-10-10", { nature: "owner-capital", party: "Owner" });
const drawing = payment("PY-M2", "MA-GC", "out", 1_000, "2026-10-11", { nature: "owner-drawing" });
const moneyBefore = standingFigures("2026-10-31", feeAccounts, feePayments, feeInvoices, feeBills);
const moneyAfter = standingFigures("2026-10-31", feeAccounts, [...feePayments, capital, drawing], feeInvoices, feeBills);
assert.equal(moneyAfter.bank.cents - moneyBefore.bank.cents, peso(20_000), "money in raises the account");
assert.equal(moneyAfter.ewallet.cents - moneyBefore.ewallet.cents, -peso(1_000), "money out lowers the account");
assert.equal(moneyAfter.positionCents - moneyBefore.positionCents, peso(19_000), "and the position by the same");
assert.equal(
  incomeFigures("2026-10", feeInvoices, feeBills, [...feePayments, capital, drawing]).netIncomeCents,
  feeIncome.netIncomeCents,
  "owner's money is neither income nor expense",
);
assert.ok(moneyAfter.bank.rows.some((row) => row.ref === "PY-M1" && row.label.startsWith("Owner's money in · Owner")));
console.log("✓ money in and out: owner's money and loans move a balance only; a sale or expense is an invoice or bill");

// Invoice and receipt intake.
const schema = INTAKE_SCHEMA as { required: string[]; properties: Record<string, unknown> };
assert.deepEqual([...schema.required].sort(), Object.keys(schema.properties).sort(), "strict JSON schema: every field required");
const clear = { party: "high", reference: "high", date: "high", amount: "high", dueDate: "high", category: "high" };
const answer = {
  docType: "supplier-invoice",
  issuedByThisBusiness: false,
  seller: "Davao Auto Parts",
  buyer: "AUTOBLITZ",
  reference: "SI 4471",
  date: "2026-10-03",
  dueDate: "2026-11-02",
  total: 12500,
  fee: null,
  paymentMethod: "unpaid",
  paid: false,
  category: "parts",
  description: "Brake pads and rotors",
  businessName: "AUTOBLITZ Auto Care",
  branch: "",
  confidence: clear,
  summary: "A supplier invoice for brake parts.",
  warnings: [],
};
const parsed = parseIntakeExtraction(answer, "AUTOBLITZ")!;
assert.equal(parsed.direction, "out");
assert.equal(parsed.party, "Davao Auto Parts", "the other side is the seller when the business buys");
assert.equal(parsed.amountCents, peso(12_500));
assert.equal(parsed.category, "parts");
assert.deepEqual(intakeReviewReasons(parsed, "AUTOBLITZ", "2026-10-24"), [], "a clean reading of this business's document needs no review");
// A supplier's own invoice headed "SALES INVOICE", sold to this business, is still a bill.
const headed = parseIntakeExtraction({ ...answer, docType: "sales-invoice", issuedByThisBusiness: true }, "AUTOBLITZ")!;
assert.equal(headed.direction, "out", "the business as buyer decides the side, not the heading");
assert.equal(headed.docType, "supplier-invoice");
assert.equal(headed.party, "Davao Auto Parts");
const ourReceipt = parseIntakeExtraction({ ...answer, docType: "official-receipt", seller: "AUTOBLITZ AUTO CARE", buyer: "Juan Dela Cruz" }, "AUTOBLITZ")!;
assert.equal(ourReceipt.direction, "in", "the business as seller is money in");
assert.equal(ourReceipt.party, "Juan Dela Cruz");
assert.equal(ourReceipt.category, null, "money in has no expense category");
assert.equal(ourReceipt.paid, true, "a receipt is paid");
assert.equal(parseIntakeExtraction({ ...answer, seller: "X", buyer: "Y", issuedByThisBusiness: true, docType: "sales-invoice" }, "AUTOBLITZ")!.direction, "in", "with no name to go on, the model's reading is used");
assert.ok(
  intakeReviewReasons({ ...parsed, party: "AUTOBLITZ" }, "AUTOBLITZ", "2026-10-24").some((reason) => reason.includes("your own business")),
  "the business's own name as the other side is flagged",
);
assert.equal(parseIntakeExtraction({ ...answer, date: "2026-02-30" })!.date, null, "an impossible date is dropped");
assert.equal(parseIntakeExtraction({ ...answer, dueDate: "2026-09-01" })!.dueDate, null, "a due date before the date is dropped");
assert.equal(parseIntakeExtraction({ ...answer, total: -5 })!.amountCents, null);
assert.equal(parseIntakeExtraction({ ...answer, docType: "letter" }), null, "an unknown type rejects the answer");
assert.equal(intakeDay("2026-10-03"), "2026-10-03");

const doubtful = parseIntakeExtraction({ ...answer, confidence: { ...clear, amount: "low" }, businessName: "Other Motors Inc.", warnings: ["Total is handwritten"] }, "AUTOBLITZ")!;
const reasons = intakeReviewReasons(doubtful, "AUTOBLITZ", "2026-10-24");
assert.ok(reasons.some((reason) => reason.startsWith("Amount is not clearly readable")), "low confidence sends it to review");
assert.ok(reasons.some((reason) => reason.includes("Other Motors")), "another business's document is flagged");
assert.ok(reasons.includes("Total is handwritten"), "the AI's warnings are shown");
assert.ok(intakeReviewReasons(parseIntakeExtraction({ ...answer, total: null }, "AUTOBLITZ")!, "AUTOBLITZ", "2026-10-24").includes("Amount was not found."));
assert.deepEqual(intakeReviewReasons(null, "AUTOBLITZ", "2026-10-24").length, 1, "an unread upload says so");

const confirm = {
  direction: "out" as const,
  party: "Davao Auto Parts",
  reference: "SI 4471",
  date: "2026-10-03",
  dueDate: "2026-11-02",
  amountCents: peso(12_500),
  category: "parts" as const,
  paid: false,
  accountRef: null,
  description: "",
};
assert.equal(intakePostProblem(confirm, "2026-10-24"), null);
assert.notEqual(intakePostProblem({ ...confirm, category: null }, "2026-10-24"), null, "a bill needs its category");
assert.notEqual(intakePostProblem({ ...confirm, paid: true }, "2026-10-24"), null, "paid needs the account");
assert.notEqual(intakePostProblem({ ...confirm, direction: "in", reference: "" }, "2026-10-24"), null, "an invoice needs its number");
assert.notEqual(intakePostProblem({ ...confirm, date: "2026-10-25" }, "2026-10-24"), null, "not in the future");
console.log("✓ intake: the AI's answer is narrowed, doubtful or foreign readings go to Needs Review, posting needs every field");

// ---- Part six: the database ---------------------------------------------------

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
const businessId = `FINANCE-CHECK-${randomUUID().slice(0, 8)}`;

const isDuplicate = (error: unknown) => (error as { code?: number }).code === 11000;

try {
  for (const index of FINANCE_INDEXES) {
    await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
  }
  console.log(`✓ ${FINANCE_INDEXES.length} finance indexes present on ${process.env.MONGODB_DB_NAME}`);

  const moneyAccounts = db.collection("moneyAccounts");
  const key = accountIdentity("BDO", "001234567890");
  await moneyAccounts.insertOne({ businessId, ref: "MA-1", type: "bank", bankKind: "account", accountKey: key });
  await assert.rejects(
    moneyAccounts.insertOne({ businessId, ref: "MA-2", type: "bank", bankKind: "passbook", accountKey: key }),
    isDuplicate,
  );
  await moneyAccounts.insertOne({ businessId, ref: "MA-3", type: "cash" });
  await moneyAccounts.insertOne({ businessId, ref: "MA-4", type: "cash" });
  console.log("✓ the database refuses a passbook for a bank account already on record; cash accounts need no number");

  const invoiceCollection = db.collection("invoices");
  await invoiceCollection.insertOne({ businessId, ref: "INV-A", number: "0001" });
  await assert.rejects(invoiceCollection.insertOne({ businessId, ref: "INV-B", number: "0001" }), isDuplicate);
  await invoiceCollection.insertOne({ businessId, ref: "INV-C", number: "0002", jobOrderRef: "JO-1" });
  await assert.rejects(invoiceCollection.insertOne({ businessId, ref: "INV-D", number: "0003", jobOrderRef: "JO-1" }), isDuplicate);
  console.log("✓ one invoice per number and per job order");

  const billCollection = db.collection("bills");
  await billCollection.insertOne({ businessId, ref: "BL-A", receiptRef: "GR-1" });
  await assert.rejects(billCollection.insertOne({ businessId, ref: "BL-B", receiptRef: "GR-1" }), isDuplicate);
  await billCollection.insertOne({ businessId, ref: "BL-C" });
  await billCollection.insertOne({ businessId, ref: "BL-D" });
  console.log("✓ one bill per supplier receipt; typed bills need no receipt");

  const reports = db.collection("financeReports");
  await reports.insertOne({ businessId, kind: "income", period: "2026-09", revision: 1 });
  await reports.insertOne({ businessId, kind: "standing", period: "2026-09", revision: 1 });
  await assert.rejects(reports.insertOne({ businessId, kind: "income", period: "2026-09", revision: 1 }), isDuplicate);
  await reports.insertOne({ businessId, kind: "income", period: "2026-09", revision: 2 });
  console.log("✓ income and standing are separate reports; each revision is written once");
} finally {
  for (const collection of new Set(FINANCE_INDEXES.map((index) => index.collection))) {
    await db.collection(collection).deleteMany({ businessId });
  }
  await mongo.close();
}

console.log("\nFinance check passed.");

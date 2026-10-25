import "server-only";

import { MIN_REVISION_REASON, incomeChanges, monthsToClose, reportTitle, standingChanges, yearsToClose } from "@/lib/finance";
import { renderFinanceReportPdf } from "@/lib/finance-pdf";
import { periodEnd } from "@/lib/finance-periods";
import { formatMoney } from "@/lib/format";
import { accountNamesOf, annualIncomeOf, firstMonthOf, incomeOf, readBooksFor, standingOf, type Books } from "./finance-books";
import { getDb } from "./db";
import { InputError, isDuplicateKey } from "./refs";
import type {
  ArchiveMonth,
  FinanceActor,
  FinanceEventDocument,
  FinanceIntakeDocument,
  FinanceReportDocument,
  FinanceReportFileDocument,
  FinanceReportKind,
  FigureChange,
  IncomeFigures,
  StandingAttention,
  StandingFigures,
  ReportRevision,
} from "@/types";

/**
 * The close: freezing the Monthly Income Report and the Financial Standing
 * Report for each month that has ended, and, once December has closed, the
 * Annual Income Report and the Year-End Financial Standing for the year.
 * Always separate documents, each with its PDF, and corrected only by issuing
 * a new revision.
 *
 * A revision is written once and never updated. Later entries, edits and
 * voids dated in a closed period change the live figures but not the frozen
 * report; `listArchive` shows exactly what differs, and an administrator
 * decides whether that is a correction worth a new revision.
 *
 * Everything here names the business explicitly, because the close runs from
 * a timer with no session. Screens pass the id from their verified session.
 */

export const AUTO_CLOSER: FinanceActor = { userId: "system", name: "AEGIS (automatic close)" };
const MONTHLY: FinanceReportKind[] = ["income", "standing"];
const ANNUAL: FinanceReportKind[] = ["annual-income", "year-end-standing"];

async function collections() {
  const db = await getDb();
  return {
    reports: db.collection<FinanceReportDocument>("financeReports"),
    files: db.collection<FinanceReportFileDocument>("financeReportFiles"),
    events: db.collection<FinanceEventDocument>("financeEvents"),
    businesses: db.collection<{ businessId: string; name: string; modules: string[]; status?: string }>("businesses"),
  };
}

async function businessNameOf(businessId: string): Promise<string> {
  const { businesses } = await collections();
  return (await businesses.findOne({ businessId }))?.name ?? businessId;
}

/** A report's figures from the records as they are now, for its kind and period. */
function liveFigures(
  books: Books,
  kind: FinanceReportKind,
  period: string,
): { income: IncomeFigures } | { standing: StandingFigures; attention: StandingAttention } {
  if (kind === "income") return { income: incomeOf(books, period) };
  if (kind === "annual-income") return { income: annualIncomeOf(books, period) };
  return standingOf(books, periodEnd(period));
}

/** What differs between a report's revision and the records now. */
function changesSince(books: Books, doc: FinanceReportDocument): FigureChange[] {
  const live = liveFigures(books, doc.kind, doc.period);
  return "income" in live ? incomeChanges(doc.income!, live.income) : standingChanges(doc.standing!, live.standing);
}

/**
 * Writes one revision of one report and its PDF. The PDF is made first, from
 * the same document, so the stored file is exactly the frozen figures. False
 * when that revision already exists (a second timer, a double click).
 */
async function freeze(
  businessId: string,
  books: Books,
  kind: FinanceReportKind,
  period: string,
  revision: number,
  reason: string,
  actor: FinanceActor,
): Promise<boolean> {
  const { reports, events } = await collections();
  const now = new Date();
  const doc: FinanceReportDocument = {
    businessId,
    kind,
    period,
    revision,
    ...liveFigures(books, kind, period),
    accountNames: accountNamesOf(books),
    businessName: await businessNameOf(businessId),
    reason,
    generatedAt: now,
    generatedBy: actor.name,
  };
  // The PDF is made from the same document, so it is exactly the frozen
  // figures. Where it cannot be rendered (`npm run finance:close`, which runs
  // outside Next), the revision is still frozen and `findReportPdf` makes its
  // PDF from it the first time it is opened.
  let pdf: Buffer | null = null;
  try {
    pdf = await renderFinanceReportPdf(doc);
  } catch (error) {
    console.warn(`[finance] PDF for ${kind} ${period} rev ${revision} deferred:`, error instanceof Error ? error.message : error);
  }

  try {
    await reports.insertOne({ ...doc });
  } catch (error) {
    if (isDuplicateKey(error)) return false;
    throw error;
  }
  if (pdf) await storePdf(businessId, kind, period, revision, pdf);
  const headline = doc.income ? `net income ${formatMoney(doc.income.netIncomeCents)}` : `position ${formatMoney(doc.standing!.positionCents)}`;
  await events.insertOne({
    businessId,
    at: now,
    actor: { userId: actor.userId, name: actor.name },
    action: revision === 1 ? "report.closed" : "report.revised",
    ref: `${kind}:${period}:${revision}`,
    detail: `${reportTitle(kind, period, revision)}, ${headline}${reason ? `. ${reason}` : ""}`,
  });
  return true;
}

async function revisionsOf(businessId: string): Promise<FinanceReportDocument[]> {
  const { reports } = await collections();
  return reports.find({ businessId }, { projection: { _id: 0 } }).sort({ period: 1, kind: 1, revision: 1 }).toArray();
}

/**
 * Closes every month that has ended and lacks a report, oldest first, writing
 * Revision 1 of each report it is missing; then, for every year whose
 * December has closed, the year-end pair. Safe to run any number of times and
 * from two places at once. Returns the periods it wrote anything for.
 */
export async function closeDueMonths(businessId: string, now = new Date()): Promise<string[]> {
  const books = await readBooksFor(businessId);
  const existing = await revisionsOf(businessId);
  const has = (kind: FinanceReportKind, period: string) => existing.some((doc) => doc.kind === kind && doc.period === period);
  const complete = (kinds: FinanceReportKind[]) =>
    new Set(existing.map((doc) => doc.period).filter((period) => kinds.every((kind) => has(kind, period))));
  const first = firstMonthOf(books);

  const written: string[] = [];
  const closeAll = async (periods: string[], kinds: FinanceReportKind[]) => {
    for (const period of periods) {
      let wrote = false;
      for (const kind of kinds) {
        if (!has(kind, period)) wrote = (await freeze(businessId, books, kind, period, 1, "", AUTO_CLOSER)) || wrote;
      }
      if (wrote) written.push(period);
    }
  };
  // Months first, so a year is closed only after its December has been.
  await closeAll(monthsToClose(first, now, complete(MONTHLY)), MONTHLY);
  await closeAll(yearsToClose(first, now, complete(ANNUAL)), ANNUAL);
  return written;
}

/** Every business with Finance switched on, for the timer. */
export async function listFinanceBusinessIds(): Promise<string[]> {
  const { businesses } = await collections();
  const docs = await businesses.find({ modules: "finance", status: "active" }, { projection: { businessId: 1 } }).toArray();
  return docs.map((doc) => doc.businessId);
}

/**
 * An approved correction: the next revision of one report, from the records
 * as they are now, with the reason on it. Refused when nothing has changed,
 * since a revision that repeats the last one corrects nothing.
 */
export async function issueRevision(
  businessId: string,
  kind: FinanceReportKind,
  period: string,
  reason: string,
  actor: FinanceActor,
): Promise<number> {
  const why = reason.trim();
  if (why.length < MIN_REVISION_REASON) {
    throw new InputError(`Say what was corrected and why (at least ${MIN_REVISION_REASON} characters).`);
  }
  const current = (await revisionsOf(businessId)).filter((doc) => doc.kind === kind && doc.period === period).at(-1);
  if (!current) throw new InputError("That period has not been closed yet, so there is nothing to revise.");

  const books = await readBooksFor(businessId);
  if (changesSince(books, current).length === 0) throw new InputError(`Nothing has changed since Revision ${current.revision}.`);

  const next = current.revision + 1;
  const wrote = await freeze(businessId, books, kind, period, next, why, actor);
  if (!wrote) throw new InputError(`Revision ${next} was issued a moment ago by someone else.`);
  return next;
}

function toRevision(doc: FinanceReportDocument): ReportRevision {
  return {
    kind: doc.kind,
    period: doc.period,
    revision: doc.revision,
    title: reportTitle(doc.kind, doc.period, doc.revision),
    reason: doc.reason,
    generatedAt: doc.generatedAt.toISOString(),
    generatedBy: doc.generatedBy,
    headlineCents: doc.income ? doc.income.netIncomeCents : doc.standing!.positionCents,
  };
}

/**
 * The archive: every closed month and year, newest first (a year before its
 * months), with every revision of each report and what differs between each
 * report's current revision and the records now.
 */
export async function listArchive(businessId: string): Promise<ArchiveMonth[]> {
  const [docs, books] = await Promise.all([revisionsOf(businessId), readBooksFor(businessId)]);
  const periods = [...new Set(docs.map((doc) => doc.period))].sort((a, b) => {
    const year = b.slice(0, 4).localeCompare(a.slice(0, 4));
    if (year !== 0) return year;
    if (a.length !== b.length) return a.length - b.length; // the year first
    return b.localeCompare(a);
  });
  return periods.map((period) => {
    const of = (kinds: FinanceReportKind[]) => docs.filter((doc) => doc.period === period && kinds.includes(doc.kind));
    const annual = period.length === 4;
    const income = of(annual ? ["annual-income"] : ["income"]);
    const standing = of(annual ? ["year-end-standing"] : ["standing"]);
    const latestIncome = income.at(-1);
    const latestStanding = standing.at(-1);
    return {
      period,
      annual,
      income: income.map(toRevision),
      standing: standing.map(toRevision),
      incomeChanges: latestIncome ? changesSince(books, latestIncome) : [],
      standingChanges: latestStanding ? changesSince(books, latestStanding) : [],
    };
  });
}

/** One frozen revision, whole, for viewing it. */
export async function findReport(
  businessId: string,
  kind: FinanceReportKind,
  period: string,
  revision: number,
): Promise<FinanceReportDocument | null> {
  const { reports } = await collections();
  return reports.findOne({ businessId, kind, period, revision }, { projection: { _id: 0 } });
}

/** Keeps a revision's PDF. Written once; a second copy of the same revision is ignored. */
async function storePdf(businessId: string, kind: FinanceReportKind, period: string, revision: number, pdf: Buffer): Promise<void> {
  const { files } = await collections();
  try {
    await files.insertOne({ businessId, kind, period, revision, pdf: new Uint8Array(pdf), bytes: pdf.length, createdAt: new Date() });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }
}

/**
 * The PDF kept with one revision. A revision frozen where PDFs could not be
 * rendered gets its PDF now, from the frozen document, and keeps it.
 */
export async function findReportPdf(
  businessId: string,
  kind: FinanceReportKind,
  period: string,
  revision: number,
): Promise<Uint8Array | null> {
  const { files } = await collections();
  const doc = await files.findOne({ businessId, kind, period, revision });
  if (doc) {
    // Stored as BSON binary; the driver hands back a Binary with a buffer.
    const raw = doc.pdf as unknown as { buffer?: Uint8Array } | Uint8Array;
    return raw instanceof Uint8Array ? raw : new Uint8Array(raw.buffer ?? []);
  }
  const report = await findReport(businessId, kind, period, revision);
  if (!report) return null;
  const pdf = await renderFinanceReportPdf({ ...report, businessId });
  await storePdf(businessId, kind, period, revision, pdf);
  return new Uint8Array(pdf);
}

// ---- Review Queue housekeeping -------------------------------------------------

/** Discarded uploads, which never became a record, are kept this long and then removed. */
export const DISCARDED_KEEP_DAYS = 90;

/**
 * Removes uploads discarded more than 90 days ago, for one business, by its
 * id: the Finance timer runs with no session. Posted uploads are never touched.
 */
export async function purgeDiscardedIntake(businessId: string, now = new Date()): Promise<number> {
  const db = await getDb();
  const before = new Date(now.getTime() - DISCARDED_KEEP_DAYS * 24 * 60 * 60_000);
  const result = await db
    .collection<FinanceIntakeDocument>("financeIntake")
    .deleteMany({ businessId, status: "discarded", discardedAt: { $lt: before } });
  return result.deletedCount;
}

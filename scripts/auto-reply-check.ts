/**
 * Automatic mail replies rehearsal.
 *
 *   npm run autoreply:check
 *
 * Part one proves the rule: the routine cases are answered, and everything
 * that matters — complaints, quotes, money, approvals, deadlines, unsure
 * triage, drafts with gaps — waits for a person, as do no-reply senders,
 * mailing lists, other auto-replies and conversations already answered.
 *
 * Part two makes sure the indexes exist on the configured database, then
 * proves a conversation can be claimed for an automatic reply only once. It
 * writes only under a throwaway business id and removes it.
 *
 * **No email is sent.** Nothing here opens the mailbox or calls the model.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import { MAIL_AUTO_REPLY_INDEXES } from "@/lib/data/mail-auto-reply";
import {
  autoReplyConfigOf,
  autoReplyVerdict,
  isNoReplyAddress,
  readMailSignals,
  type AutoReplyCandidate,
  type AutoReplyContext,
} from "@/lib/mail/auto-reply";
import type { MailSignals } from "@/types";

// ---- Part one: the rule --------------------------------------------------------

const now = new Date("2026-11-04T09:00:00+08:00");
const context: AutoReplyContext = {
  mailbox: "service@autoblitz.ph",
  enabledAt: new Date("2026-11-01T00:00:00+08:00"),
  now,
};

const person: MailSignals = readMailSignals(new Map(), { messageId: "<m1@mail.example>" });

/** "Thanks, received" from a customer: the case the feature exists for. */
const routine: AutoReplyCandidate = {
  email: "maria.santos@gmail.com",
  subject: "Thank you",
  body: ["Hi, just letting you know I got the documents you sent over. Thanks!", "Maria"],
  category: "Customer",
  priority: "Normal",
  aiSummary: "Maria confirms she received the documents and says thanks.",
  actionItems: [],
  deadline: null,
  needsApproval: false,
  triaged: true,
  suggestedReply: "Hi Maria,\n\nThank you for letting us know. Have a great day!\n\nAhmed",
  draftCurrent: true,
  signals: person,
  answered: false,
  receivedAt: new Date(now.getTime() - 30 * 60 * 1000),
};

const verdict = (patch: Partial<AutoReplyCandidate>, ctx: Partial<AutoReplyContext> = {}) =>
  autoReplyVerdict({ ...routine, ...patch }, { ...context, ...ctx });

const sends = (label: string, patch: Partial<AutoReplyCandidate>) => {
  const result = verdict(patch);
  assert.equal(result.send, true, `${label} should be answered automatically, got: ${result.send ? "" : result.reason}`);
  console.log(`  send  ${label}`);
};

const holds = (label: string, patch: Partial<AutoReplyCandidate>, ctx: Partial<AutoReplyContext> = {}) => {
  const result = verdict(patch, ctx);
  assert.equal(result.send, false, `${label} must wait for a person`);
  console.log(`  hold  ${label} — ${result.send ? "" : result.reason}`);
};

console.log("Part one: the rule");
sends("thanks, received (Normal)", {});
sends("acknowledgement (Low)", { priority: "Low", subject: "Got it", aiSummary: "Acknowledges our last email." });
sends("fleet acknowledgement with one action", { category: "Fleet", actionItems: ["Acknowledge receipt"] });

// Unsure triage.
holds("never triaged", { triaged: false });
holds("triage failed (attempted, empty summary)", { aiSummary: "", category: "Other" });
holds("category Other", { category: "Other" });

// Mail that matters.
holds("complaint", { body: ["I am very disappointed with the repair."], aiSummary: "Customer is unhappy with a repair." });
holds("quote request", { subject: "Quote for brake pads", aiSummary: "Asks for a quotation." });
holds("money in the body", { body: ["I sent ₱5,000 yesterday, please check."] });
holds("Filipino: magkano", { body: ["Magkano po ang change oil?"] });
holds("booking question", { body: ["Can I book for Saturday?"] });
holds("needs approval", { needsApproval: true });
holds("states a deadline", { deadline: "by Friday" });
holds("High priority", { priority: "High" });
holds("Urgent priority", { priority: "Urgent" });
holds("Billing category", { category: "Billing" });
holds("Insurance category", { category: "Insurance" });
holds("Supplier category", { category: "Supplier" });
holds("asks for several things", { actionItems: ["Send records", "Call back"] });

// The draft.
holds("no draft yet", { suggestedReply: null });
holds("stale draft", { draftCurrent: false });
holds("draft with a gap (opening hours unknown)", {
  subject: "Opening hours",
  aiSummary: "Asks what time the shop opens on Sunday.",
  actionItems: ["Reply with opening hours"],
  suggestedReply: "Hi Maria,\n\nWe are open [opening hours] on Sundays.\n\nAhmed",
});
holds("draft mentions a price", { suggestedReply: "Hi Maria, the service costs PHP 2,500. Ahmed" });
holds("draft too long", { suggestedReply: "Thanks. ".repeat(200) });

// Senders and loops.
holds("no-reply sender", { email: "no-reply@shopee.ph" });
holds("mailer-daemon", { email: "MAILER-DAEMON@googlemail.com" });
holds("notifications sender", { email: "notifications@github.com" });
holds("own mailbox", { email: "Service@AutoBlitz.ph" });
holds("headers never checked", { signals: null });
holds("Auto-Submitted: auto-replied", {
  signals: readMailSignals(new Map([["auto-submitted", "auto-replied"]]), { messageId: "<a@x>" }),
});
holds("Precedence: bulk", {
  signals: readMailSignals(new Map([["precedence", "bulk"]]), { messageId: "<b@x>" }),
});
holds("mailing list (List-Id)", {
  signals: readMailSignals(new Map<string, unknown>([["list-id", { id: "news.example", name: "News" }]]), { messageId: "<c@x>" }),
});
holds("mailing list (as mailparser shapes it)", {
  signals: readMailSignals(new Map<string, unknown>([["list", { unsubscribe: { url: "https://x" } }]]), { messageId: "<c2@x>" }),
});
holds("X-Autoreply", {
  signals: readMailSignals(new Map([["x-autoreply", "yes"]]), { messageId: "<d@x>" }),
});
holds("bounce (empty Return-Path)", {
  signals: readMailSignals(new Map<string, unknown>([["return-path", { text: "<>", value: [] }]]), { messageId: "<e@x>" }),
});
holds("already answered in the thread", { answered: true });
holds("arrived before switched on", {}, { enabledAt: new Date(now.getTime() - 5 * 60 * 1000) });
holds("older than a day", { receivedAt: new Date(now.getTime() - 26 * 60 * 60 * 1000) }, { enabledAt: new Date(0) });

// Auto-Submitted: no is a person, explicitly.
sends("Auto-Submitted: no", {
  signals: readMailSignals(new Map([["auto-submitted", "no"]]), { messageId: "<f@x>" }),
});

// Threading: a reply belongs to the conversation its first message started.
const reply = readMailSignals(new Map(), {
  messageId: "<3@x>",
  inReplyTo: "<2@x>",
  references: ["<1@x>", "<2@x>"],
});
assert.equal(reply.threadId, "<1@x>");
assert.deepEqual(reply.references, ["<1@x>", "<2@x>"]);
assert.equal(readMailSignals(new Map(), { messageId: "<9@x>", inReplyTo: "<8@x>" }).threadId, "<8@x>");
assert.equal(person.threadId, "<m1@mail.example>");

assert.equal(isNoReplyAddress("maria.santos@gmail.com"), false);
assert.equal(isNoReplyAddress("info@autoblitz.ph"), false, "info@ is often a person");

// Off by default.
assert.equal(autoReplyConfigOf(undefined).enabled, false);
console.log("  ok    threading, sender patterns and the off-by-default setting\n");

// ---- Part two: once per conversation -------------------------------------------

console.log("Part two: indexes and the once-per-conversation claim");
const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);
for (const index of MAIL_AUTO_REPLY_INDEXES) {
  await db.collection(index.collection).createIndex(index.keys, index.options ?? {});
}

const businessId = `CHECK-${randomUUID()}`;
const log = db.collection("mailAutoReplies");
try {
  const claim = { businessId, messageId: "<2@x>", threadId: "<1@x>", to: "a@b.c", subject: "Re: x", body: "x", status: "sending", reason: "", createdAt: new Date() };
  await log.insertOne({ ...claim });
  await assert.rejects(
    log.insertOne({ ...claim, messageId: "<3@x>" }),
    (error: { code?: number }) => error.code === 11000,
    "a second automatic reply in the same conversation must be refused",
  );
  console.log("  ok    a second claim on the same conversation is refused by the database");
} finally {
  await log.deleteMany({ businessId });
  await mongo.close();
}

console.log("\nAll automatic-reply checks passed. No email was sent.");

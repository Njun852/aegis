/**
 * Connectivity rehearsal for checklist items 4 and 5.
 *
 *   npm run mail:check              # the default business
 *   npm run mail:check -- BIZ-1002  # a specific one
 *
 * Signs in to the mailbox stored for a business, lists the newest few messages,
 * and prints their headers. **Nothing is written** — not to the database, not
 * to the mailbox, and no message is marked read. Use it to prove credentials
 * work before touching the app, and to see exactly what a failure reports:
 * revoke the app password in the Google account and run it again.
 *
 * Runs with `--conditions=react-server` so the `server-only` marker on the
 * modules below resolves to an empty module instead of throwing.
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";
import { decryptSecret } from "@/lib/auth/secrets";
import { isSafeLink, linkHost, readLinks, splitLinks } from "@/lib/mail-links";
import { MAX_RECIPIENTS, parseRecipients, readRecipients } from "@/lib/mail-recipients";
import { classifyMailError, explainMailFailure, explainSendFailure } from "@/lib/mail/failures";
import { createImapSource } from "@/lib/mail/imap-source";
import type { BusinessDocument } from "@/types";

// ---- Addresses for To, Cc and Bcc (no network) -------------------------------------

assert.deepEqual(
  parseRecipients("Ana@Shop.ph, ana@shop.ph; Ben Cruz <ben@cruz.com>\n carl@x.co"),
  { addresses: ["ana@shop.ph", "ben@cruz.com", "carl@x.co"], invalid: [] },
  "commas, semicolons, new lines and display names; each address once",
);
assert.deepEqual(parseRecipients("ana@shop.ph, not an address").invalid, ["not", "an", "address"]);
assert.equal(readRecipients({ to: "", cc: "", bcc: "" }).ok, false, "a new email needs someone to send to");
assert.equal(readRecipients({ to: "", cc: "a@b.co", bcc: "" }, { requireTo: false }).ok, true, "a reply's copies need no To");
const both = readRecipients({ to: "a@b.co", cc: "A@b.co, c@d.co", bcc: "c@d.co, e@f.co" });
assert.ok(both.ok);
assert.deepEqual(both.recipients, { to: ["a@b.co"], cc: ["c@d.co"], bcc: ["e@f.co"] }, "nobody gets the same message twice");
const bad = readRecipients({ to: "a@b.co", cc: "", bcc: "oops" });
assert.ok(!bad.ok && bad.error.startsWith("Bcc:"), "the box with the mistake is named");
const many = Array.from({ length: MAX_RECIPIENTS + 1 }, (_, i) => `p${i}@x.co`).join(",");
assert.equal(readRecipients({ to: many, cc: "", bcc: "" }).ok, false, "a slip cannot become a blast");
assert.equal(classifyMailError({ code: "EENVELOPE", message: "No recipients defined" }), "rejected");
assert.equal(classifyMailError({ code: "EAUTH", message: "Invalid login" }), "auth-failed");
assert.match(explainSendFailure("error"), /nothing was sent/, "a failed send says it did not leave");
console.log("✓ To, Cc and Bcc: parsed, checked, deduplicated, capped; send failures say nothing was sent");

// ---- Links in mail (no network) -----------------------------------------------------

{
  const html = `<p>Hi</p><a href="https://drive.google.com/x?a=1&amp;b=2">See <b>the photos</b></a>
    <a href='javascript:alert(1)'>click</a><a href="mailto:ana@shop.ph">Email Ana</a>
    <a href="https://drive.google.com/x?a=1&amp;b=2">again</a>`;
  const links = readLinks(html, "Also at https://autoblitz.ph/book. Thanks.");
  assert.deepEqual(
    links,
    [
      { url: "https://drive.google.com/x?a=1&b=2", text: "See the photos" },
      { url: "mailto:ana@shop.ph", text: "Email Ana" },
      { url: "https://autoblitz.ph/book", text: "" },
    ],
    "real addresses, each once, with their words; javascript: dropped; trailing full stop not part of the link",
  );
  assert.equal(isSafeLink("data:text/html,hi"), false);
  assert.deepEqual(splitLinks("Book at https://autoblitz.ph/book, today."), [
    { text: "Book at " },
    { text: "https://autoblitz.ph/book", url: "https://autoblitz.ph/book" },
    { text: ", today." },
  ]);
  assert.equal(linkHost("https://www.facebook.com/autoblitz"), "facebook.com");
  console.log("✓ links: read from HTML and text, unsafe ones dropped, addresses in text made clickable");
}

const businessId = process.argv[2] ?? "BIZ-1001";
const SHOW = 5;

const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);

const business = await db
  .collection<BusinessDocument>("businesses")
  .findOne({ businessId });

if (!business) {
  console.error(`No business ${businessId}.`);
  await mongo.close();
  process.exit(1);
}

const mailbox = business.mailbox;
if (!mailbox?.address || !mailbox.secretCipher) {
  console.error(
    `${businessId} (${business.name}) has no mailbox connected. Connect one in Business Management first.`,
  );
  await mongo.close();
  process.exit(1);
}

const appPassword = decryptSecret(mailbox.secretCipher);
if (!appPassword) {
  console.error(
    "The stored password could not be decrypted. MAIL_CREDENTIAL_KEY has probably changed since it was saved — reconnect the mailbox.",
  );
  await mongo.close();
  process.exit(1);
}

console.log(`Signing in to ${mailbox.address} for ${business.name}…`);

const source = createImapSource({ address: mailbox.address, appPassword });
const started = Date.now();
const result = await source.fetchSince({ uidValidity: null, lastUid: null }, SHOW);
const elapsed = Date.now() - started;

if (!result.ok) {
  console.error(`\nFAILED after ${elapsed}ms — ${result.reason}`);
  console.error(`  reported as: ${explainMailFailure(result.reason)}`);
  console.error(`  underlying : ${result.detail}`);
  await mongo.close();
  process.exit(1);
}

const { messages, cursor } = result.data;
console.log(
  `\nOK in ${elapsed}ms · uidValidity ${cursor.uidValidity} · highest UID ${cursor.lastUid} · ${messages.length} message(s)\n`,
);

for (const message of messages) {
  console.log(`--- ${message.receivedAt.toISOString()}${message.unread ? "  (unread)" : ""}`);
  console.log(`  from    : ${message.from} <${message.email}>`);
  console.log(`  subject : ${message.subject}`);
  console.log(`  id      : ${message.messageId}`);
  console.log(`  body    : ${(message.body[0] ?? "").slice(0, 90)}`);
}

console.log("\nNothing was written. No message was marked read.");
await mongo.close();

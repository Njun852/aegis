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
import { MongoClient } from "mongodb";
import { decryptSecret } from "@/lib/auth/secrets";
import { explainMailFailure } from "@/lib/mail/failures";
import { createImapSource } from "@/lib/mail/imap-source";
import type { BusinessDocument } from "@/types";

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

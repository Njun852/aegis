/**
 * Acceptance rehearsal for checklist items 13, 14 and 15.
 *
 *   npm run triage:check
 *
 * Sends the two scripted acceptance-test emails plus one real one straight to
 * the model and prints what comes back, without writing anything to the
 * database. Use it before the acceptance meeting to confirm that:
 *
 *   item 13 — a stated deadline is extracted in the email's own words, and an
 *             email without one returns nothing rather than an invented date;
 *   item 14 — no suggested reply asserts a price, an approval or a confirmation;
 *   item 15 — the PHP 500,000 commitment request is flagged for management
 *             approval and every reply option routes it to a person.
 *
 * One call, about 1,300 tokens. Nothing is cached or stored.
 */
import { MongoClient } from "mongodb";
import type { MailMessageDocument } from "@/types";
import OpenAI from "openai";
import { INSTRUCTIONS, SCHEMA, TOKENS_PER_MESSAGE, parseBatch, toInput }
  from "@/lib/ai/mail-triage-prompt";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
const mongo = await new MongoClient(process.env.MONGODB_URI!).connect();
const db = mongo.db(process.env.MONGODB_DB_NAME!);

const docs = await db
  .collection<MailMessageDocument>("messages")
  .find({ messageId: { $in: ["m9", "m10", "m1"] } })
  .toArray();
const inputs = docs.map(toInput);
const sent = new Set(inputs.map((i) => i.id));

const res = await client.responses.create({
  model: process.env.OPENAI_MODEL_FAST?.trim() || "gpt-4o-mini",
  instructions: INSTRUCTIONS,
  input: JSON.stringify({ messages: inputs }),
  max_output_tokens: inputs.length * TOKENS_PER_MESSAGE + 120,
  text: { format: { type: "json_schema", name: "mail_triage", schema: SCHEMA as unknown as Record<string, unknown>, strict: true } },
});

console.log(`status=${res.status}  tokens: ${res.usage?.input_tokens} in / ${res.usage?.output_tokens} out`);
const parsed = parseBatch(JSON.parse(res.output_text), sent);
if (!parsed) { console.log("VALIDATION REJECTED THE OUTPUT"); process.exit(1); }

for (const r of parsed) {
  const src = docs.find((doc) => doc.messageId === r.id);
  if (!src) continue;
  console.log(`\n--- ${r.id}: ${src.subject.slice(0, 62)}`);
  console.log(`  category      : ${r.category}`);
  console.log(`  priority      : ${r.priority}`);
  console.log(`  deadline      : ${r.deadline === null ? "(none — renders 'None mentioned')" : r.deadline}`);
  console.log(`  needsApproval : ${r.needsApproval}${r.approvalReason ? "  — " + r.approvalReason : ""}`);
  console.log(`  summary       : ${r.summary}`);
  console.log(`  replies       : ${r.replies.join("  |  ")}`);
}
await mongo.close();

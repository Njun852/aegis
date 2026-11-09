/**
 * Semaphore adapter rehearsal.
 *
 *   npm run sms:provider-check
 *
 * Proves the adapter in src/lib/sms/provider.ts sends what Semaphore expects
 * and reads every kind of answer truthfully: accepted, refused, a bad key, the
 * rate limit, a network rejection, and a dropped connection.
 *
 * Nothing leaves this machine. `fetch` is replaced before the adapter is used,
 * and the API key is a fake set only inside this process, so no text is sent
 * and no credit is spent whatever is in .env.local.
 */
import assert from "node:assert/strict";

process.env.SEMAPHORE_API_KEY = "fake-key-for-rehearsal";
process.env.SEMAPHORE_SENDER_NAME = "AUTOBLITZ";

interface Call {
  url: string;
  form: URLSearchParams;
}
const calls: Call[] = [];
let answer: () => Response | Promise<Response> = () => new Response("[]");

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), form: new URLSearchParams(String(init?.body ?? "")) });
  return answer();
}) as typeof fetch;

const { getSmsProvider, smsProviderName, toSemaphoreNumber } = await import("@/lib/sms/provider");

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// ---- Switched on by the key alone ----------------------------------------------------

assert.equal(smsProviderName(), "semaphore");
const provider = getSmsProvider();
assert.ok(provider);
console.log("  ok    a key in the environment connects Semaphore");

// ---- Numbers ----------------------------------------------------------------------------

assert.equal(toSemaphoreNumber("+639171234567"), "09171234567");
assert.equal(toSemaphoreNumber("+14155550123"), null);
assert.equal(toSemaphoreNumber("+63212345678"), null, "a landline is not a mobile");
console.log("  ok    +639XXXXXXXXX becomes 09XXXXXXXXX; anything else is refused");

// ---- Accepted ---------------------------------------------------------------------------

answer = () => json([{ message_id: 12345, recipient: "639171234567", status: "Pending", network: "Globe" }]);
const accepted = await provider.send("+639171234567", "Hi Maria, your car is due for service. AUTOBLITZ");
assert.deepEqual(accepted, { ok: true, id: "12345" });
const sent = calls.at(-1)!;
assert.equal(sent.url, "https://api.semaphore.co/api/v4/messages");
assert.equal(sent.form.get("apikey"), "fake-key-for-rehearsal");
assert.equal(sent.form.get("number"), "09171234567");
assert.equal(sent.form.get("message"), "Hi Maria, your car is due for service. AUTOBLITZ");
assert.equal(sent.form.get("sendername"), "AUTOBLITZ");
console.log("  ok    accepted: sends key, number, message and sender name; keeps Semaphore's message id");

// ---- Refusals, each in words a person can act on ---------------------------------------

answer = () => json({ sendername: ["The senderame supplied is not valid."] });
let result = await provider.send("+639171234567", "Hello");
assert.equal(result.ok, false);
assert.match(!result.ok ? result.error : "", /senderame supplied is not valid/);

answer = () => json(["Your current balance of 0 credits is not sufficient."]);
result = await provider.send("+639171234567", "Hello");
assert.match(!result.ok ? result.error : "", /balance of 0 credits/);

answer = () => json({ message: "Unauthenticated." }, 401);
result = await provider.send("+639171234567", "Hello");
assert.match(!result.ok ? result.error : "", /SEMAPHORE_API_KEY/);

answer = () => json({ message: "Too Many Attempts." }, 429);
result = await provider.send("+639171234567", "Hello");
assert.match(!result.ok ? result.error : "", /limit/);

answer = () => json([{ message_id: 9, status: "Failed" }]);
result = await provider.send("+639171234567", "Hello");
assert.match(!result.ok ? result.error : "", /network rejected/);

answer = () => new Response("<html>Bad Gateway</html>", { status: 502 });
result = await provider.send("+639171234567", "Hello");
assert.equal(result.ok, false, "an HTML error page is never read as accepted");
console.log("  ok    refused, no credit, bad key, rate limit, network rejection and a bad gateway all read as failed, with the reason");

// ---- Never sent at all -------------------------------------------------------------------

const before = calls.length;
result = await provider.send("+14155550123", "Hello");
assert.match(!result.ok ? result.error : "", /Philippine mobile/);
result = await provider.send("+639171234567", "Test drive your new car");
assert.match(!result.ok ? result.error : "", /TEST/);
assert.equal(calls.length, before, "neither reached Semaphore");
console.log("  ok    a foreign number, or a text starting with \"TEST\" (which Semaphore silently drops), never reaches Semaphore");

// ---- A dropped connection throws, for the sweep to record ------------------------------

answer = () => {
  throw new TypeError("fetch failed");
};
await assert.rejects(provider.send("+639171234567", "Hello"), /fetch failed/);
console.log("  ok    a network fault throws, and the sweep marks that text failed");

// ---- Spacing between calls ----------------------------------------------------------------

answer = () => json([{ message_id: 1, status: "Pending" }]);
const started = Date.now();
await provider.send("+639171234567", "One");
await provider.send("+639171234567", "Two");
await provider.send("+639171234567", "Three");
assert.ok(Date.now() - started >= 950, "three calls take at least two gaps of half a second");
console.log("  ok    calls are spaced half a second apart, under Semaphore's 120 a minute");

console.log("\nAll Semaphore checks passed. Nothing was sent.");

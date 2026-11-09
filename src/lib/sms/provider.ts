import "server-only";

/**
 * The one place an SMS provider plugs in.
 *
 * The provider is Semaphore (semaphore.co), switched on by putting its API key
 * in the environment. With no key, `getSmsProvider` returns null and Text Blast
 * leaves every message queued, marked as not sent. Nothing else in the app
 * names a provider or knows how a text is delivered.
 *
 * What an adapter must honour:
 *
 * - `send` reports the truth. Return `ok: true` only when the provider accepted
 *   the message; anything else is `ok: false` with a reason a person can read.
 *   The sweep records exactly what is returned and never assumes delivery.
 * - `send` must not throw for an ordinary refusal (bad number, no credit).
 *   Throw only for a fault; the sweep catches it and marks the text failed.
 * - `to` arrives in E.164 ("+639171234567"). Convert here if the provider
 *   wants another form.
 * - Credentials come from the environment, never from the database or a
 *   browser, and are never logged.
 */
export interface SmsProvider {
  /** Shown beside each sent message: "semaphore", "twilio". */
  name: string;
  send(to: string, body: string): Promise<SmsSendResult>;
}

export type SmsSendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export function getSmsProvider(): SmsProvider | null {
  const apiKey = process.env.SEMAPHORE_API_KEY?.trim();
  if (!apiKey) return null;
  return semaphore(apiKey, process.env.SEMAPHORE_SENDER_NAME?.trim() || null);
}

/** For the screen and System Status: is anything able to send? */
export function smsProviderName(): string | null {
  return getSmsProvider()?.name ?? null;
}

// ---- Semaphore -------------------------------------------------------------------

const SEMAPHORE_URL = "https://api.semaphore.co/api/v4/messages";

/**
 * Semaphore allows 120 send calls a minute. The sweep sends one text per call,
 * one after another, so spacing calls half a second apart keeps a large batch
 * under the limit instead of having its tail refused and marked failed.
 */
const MIN_GAP_MS = 500;
const store = globalThis as typeof globalThis & { aegisSemaphoreLastCall?: number };

async function waitForSlot(): Promise<void> {
  const wait = (store.aegisSemaphoreLastCall ?? 0) + MIN_GAP_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  store.aegisSemaphoreLastCall = Date.now();
}

/** "+639171234567" → "09171234567", the form Semaphore's own examples use. Null for anything that is not a Philippine mobile. */
export function toSemaphoreNumber(e164: string): string | null {
  const match = /^\+63(9\d{9})$/.exec(e164.replace(/[\s-]/g, ""));
  return match ? `0${match[1]}` : null;
}

/**
 * Semaphore's docs give no shape for a refusal, and in practice it answers with
 * either a list of strings or an object of field → messages. Every string in
 * whatever came back is collected, so the person reads Semaphore's own words.
 */
function errorText(payload: unknown): string {
  const found: string[] = [];
  const walk = (value: unknown) => {
    if (typeof value === "string") found.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(payload);
  const text = [...new Set(found.map((line) => line.trim()).filter(Boolean))].join(" ");
  return text.slice(0, 300);
}

function semaphore(apiKey: string, senderName: string | null): SmsProvider {
  return {
    name: "semaphore",
    async send(to, body) {
      const number = toSemaphoreNumber(to);
      if (!number) return { ok: false, error: "Semaphore only sends to Philippine mobile numbers (09XX XXX XXXX)." };

      // Semaphore silently drops any message that starts with "TEST" while still
      // answering as if it went out, so it is refused here rather than recorded as sent.
      if (/^\s*test/i.test(body)) {
        return { ok: false, error: "Semaphore does not send texts that begin with \"TEST\". Reword the start of the message." };
      }

      const form = new URLSearchParams({ apikey: apiKey, number, message: body });
      if (senderName) form.set("sendername", senderName);

      await waitForSlot();
      // A network fault or timeout throws, which the sweep records as failed.
      const response = await fetch(SEMAPHORE_URL, {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(20_000),
      });

      const raw = await response.text();
      let payload: unknown = raw;
      try {
        payload = JSON.parse(raw);
      } catch {
        // Not JSON: keep the text, which errorText reads as it is.
      }

      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: "Semaphore refused the API key. Check SEMAPHORE_API_KEY." };
      }
      if (response.status === 429) {
        return { ok: false, error: "Semaphore's sending limit was reached. Send this one again in a minute." };
      }

      // Accepted: a list with one entry per recipient, carrying its message_id.
      const first = Array.isArray(payload) ? (payload[0] as Record<string, unknown> | undefined) : undefined;
      if (response.ok && first && first.message_id !== undefined && first.message_id !== null) {
        if (String(first.status).toLowerCase() === "failed") {
          return { ok: false, error: "Semaphore accepted the text, but the network rejected it. The credit is refunded." };
        }
        return { ok: true, id: String(first.message_id) };
      }

      const reason = errorText(payload);
      return {
        ok: false,
        error: reason ? `Semaphore: ${reason}` : `Semaphore did not accept the text (HTTP ${response.status}).`,
      };
    },
  };
}

import "server-only";

/**
 * The one place an SMS provider plugs in.
 *
 * No provider is connected yet, so `getSmsProvider` returns null and Text Blast
 * leaves every message queued, marked as not sent. To connect one later, this
 * is the only file that changes: read the provider's credentials from the
 * environment and return an adapter that implements `SmsProvider`. Nothing
 * else in the app names a provider or knows how a text is delivered.
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
  return null;
}

/** For the screen and System Status: is anything able to send? */
export function smsProviderName(): string | null {
  return getSmsProvider()?.name ?? null;
}

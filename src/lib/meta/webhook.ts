import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * What Meta sends when a customer messages the Page, and how AEGIS proves it
 * really came from Meta.
 *
 * The webhook is the one door into AEGIS with no session behind it: anyone on
 * the internet can post to it. Meta signs every delivery with the app secret,
 * so the signature is the whole of the authentication — it is checked on the
 * raw body, before the payload is parsed, and a delivery that fails is dropped
 * without being read.
 *
 * Pure: no database, no network, so `npm run messenger:simulate` exercises
 * exactly this code.
 */

export interface MetaMessagingEvent {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
  };
  /** Present on the first message of a chat started from an ad. */
  referral?: {
    source?: string;
    type?: string;
    ad_id?: string;
    ref?: string;
  };
  /** A tap on an ad's button can arrive as a postback carrying the same referral. */
  postback?: {
    mid?: string;
    title?: string;
    payload?: string;
    referral?: { source?: string; type?: string; ad_id?: string; ref?: string };
  };
}

export interface MetaWebhookPayload {
  object?: string;
  entry?: { id?: string; time?: number; messaging?: MetaMessagingEvent[] }[];
}

/** One message as AEGIS stores it, whatever shape Meta delivered it in. */
export interface IncomingMessage {
  /** Meta's message id. The same delivery twice must not become two messages. */
  mid: string;
  pageId: string;
  /** Page-scoped id of the customer: stable for this Page, useless elsewhere. */
  psid: string;
  text: string;
  at: Date;
  /** The ad that started this chat, when Meta says so. */
  adId: string | null;
  /** "ADS", "SHORTLINK", "CUSTOMER_CHAT_PLUGIN", and so on. */
  referralSource: string | null;
  /** True for messages the Page sent, which AEGIS records but never acts on. */
  fromPage: boolean;
}

/**
 * Meta's signature over the exact bytes it sent. Compared in constant time, so
 * a wrong signature cannot be narrowed down by timing the response.
 */
export function verifySignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  let given: Buffer;
  try {
    given = Buffer.from(header.slice("sha256=".length), "hex");
  } catch {
    return false;
  }

  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * The messages worth storing, flattened out of Meta's envelope.
 *
 * Echoes — the Page's own replies, sent from Meta Business Suite — are kept as
 * context for the AI reading the thread, marked so nothing treats them as a
 * customer asking for something. Deliveries, reads and reactions are ignored.
 */
export function readMessages(payload: MetaWebhookPayload): IncomingMessage[] {
  if (payload.object !== "page") return [];
  const messages: IncomingMessage[] = [];

  for (const entry of payload.entry ?? []) {
    const pageId = entry.id;
    if (!pageId) continue;

    for (const event of entry.messaging ?? []) {
      const referral = event.referral ?? event.postback?.referral;
      const text = event.message?.text ?? event.postback?.title ?? "";
      const mid = event.message?.mid ?? event.postback?.mid;
      if (!mid || !text.trim()) continue;

      const fromPage = event.message?.is_echo === true || event.sender?.id === pageId;
      // The customer is whichever side is not the Page.
      const psid = fromPage ? event.recipient?.id : event.sender?.id;
      if (!psid) continue;

      messages.push({
        mid,
        pageId,
        psid,
        text: text.trim(),
        at: new Date(event.timestamp ?? entry.time ?? Date.now()),
        adId: referral?.ad_id ?? null,
        referralSource: referral?.source ?? null,
        fromPage,
      });
    }
  }

  return messages;
}

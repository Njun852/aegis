import { NextResponse } from "next/server";
import {
  findBusinessIdByPageId,
  recordSignatureFailure,
  recordWebhookEvent,
  storeMessage,
} from "@/lib/dal/messenger";
import { readMessages, verifySignature, type MetaWebhookPayload } from "@/lib/meta/webhook";

/**
 * Where Meta delivers Messenger chats.
 *
 * The only route in AEGIS reachable without signing in, so it is written to be
 * safe in the open:
 *
 * - **GET** answers Meta's one-time subscription check, and only when the
 *   verify token matches the one configured on this server.
 * - **POST** is authenticated by Meta's signature over the raw body, checked
 *   before the payload is parsed. Anything unsigned or wrongly signed is
 *   refused and recorded.
 * - A delivery for a Page no business has connected is accepted and ignored.
 * - Meta retries anything it does not get a 200 for quickly, so this answers as
 *   soon as the messages are stored and never makes Meta wait on the AI.
 */

export const dynamic = "force-dynamic";

function configured(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/** Meta's subscription check: echo the challenge, but only to the right caller. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const verifyToken = configured("META_WEBHOOK_VERIFY_TOKEN");

  if (!verifyToken) {
    return new NextResponse("META_WEBHOOK_VERIFY_TOKEN is not set on this server", {
      status: 503,
    });
  }
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === verifyToken
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  return new NextResponse("Verification failed", { status: 403 });
}

export async function POST(request: Request) {
  const appSecret = configured("META_APP_SECRET");
  if (!appSecret) {
    // Without the secret nothing can be authenticated, so nothing is accepted.
    return new NextResponse("META_APP_SECRET is not set on this server", { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    await recordSignatureFailure(null);
    return new NextResponse("Bad signature", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return new NextResponse("Not JSON", { status: 400 });
  }

  const pages = new Map<string, string>();
  for (const message of readMessages(payload)) {
    let businessId = pages.get(message.pageId);
    if (businessId === undefined) {
      businessId = (await findBusinessIdByPageId(message.pageId)) ?? "";
      pages.set(message.pageId, businessId);
    }
    // A Page nobody has connected: accepted so Meta stops retrying, stored
    // nowhere.
    if (!businessId) continue;

    await storeMessage(businessId, message);
    await recordWebhookEvent(businessId, message.at);
  }

  return NextResponse.json({ received: true });
}

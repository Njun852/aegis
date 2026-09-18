/**
 * How a failed Meta request is worded for the person looking at the screen, and
 * how a Graph API error is classified into one of those cases.
 *
 * Mirrors `src/lib/mail/failures.ts`: pure, client-safe, and separate from the
 * module that reaches the network, so a `"use server"` file can import the
 * wording without pulling the client in.
 *
 * Stage 2 asks that "Meta connection failures are clearly reported". Everything
 * here classifies and returns; nothing throws.
 */

export type MetaFailure =
  | "not-configured"
  | "token-invalid"
  | "no-permission"
  | "account-not-found"
  | "rate-limited"
  | "unreachable"
  | "timeout"
  | "error";

export function explainMetaFailure(reason: MetaFailure): string {
  switch (reason) {
    case "not-configured":
      return "No Meta ad account is connected for this business.";
    case "token-invalid":
      return "Meta rejected the token. It may have expired or been revoked — generate a new one and reconnect.";
    case "no-permission":
      return "The token cannot read this ad account. Check that whoever the token belongs to (usually a system user) has the ad account assigned, and that the token includes ads_read. A sandbox ad account only accepts tokens that include ads_management.";
    case "account-not-found":
      return "Meta does not recognise that ad account id. Check it in Ads Manager — it looks like act_1234567890.";
    case "rate-limited":
      return "Meta is limiting requests for this account right now. Wait a few minutes and sync again.";
    case "unreachable":
      return "Meta could not be reached. Check the server's connection and try again.";
    case "timeout":
      return "Meta did not respond in time. Try the sync again.";
    default:
      return "Meta returned an unexpected error. Try again; if it persists, check System Status.";
  }
}

/** The error object the Graph API returns in a failed response body. */
export interface GraphError {
  code?: number;
  error_subcode?: number;
  message?: string;
  type?: string;
}

/**
 * Turns a Graph API error into one of the cases above.
 *
 * The token case is separated from every other failure deliberately: an expired
 * or revoked token is the one a person has to act on, and it must not read as an
 * outage they would wait out.
 */
export function classifyMetaError(error: GraphError | null, httpStatus: number): MetaFailure {
  const code = error?.code;

  if (code === 190 || code === 102 || httpStatus === 401) return "token-invalid";
  // 10 and 200-299 are Meta's permission family; the "owner has not granted
  // ads_read" answer we saw on the real account arrives as 200.
  if (code === 10 || (code !== undefined && code >= 200 && code < 300)) {
    return "no-permission";
  }
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 80000 ||
    code === 80004 ||
    httpStatus === 429
  ) {
    return "rate-limited";
  }
  // 100/33 is "object does not exist"; 803 is "some of the aliases you
  // requested do not exist". A bare 100 is any invalid parameter — usually a
  // bug on our side, not the account — so it stays a generic error. Meta also
  // answers a made-up account id with the permission error above, so this case
  // only fires when it chooses to say so.
  if ((code === 100 && error?.error_subcode === 33) || code === 803) {
    return "account-not-found";
  }
  return "error";
}

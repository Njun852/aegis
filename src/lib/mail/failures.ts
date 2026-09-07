/**
 * How a failed mailbox operation is worded for the person looking at the
 * screen, and how a raw driver error is classified into one of those cases.
 *
 * Mirrors `src/lib/ai/failures.ts`: pure, client-safe, and separate from the
 * modules that reach the network, so a `"use server"` file can import the
 * wording without pulling an IMAP client into the bundle.
 *
 * Checklist item 5 asks that AEGIS "reports the problem clearly, does not
 * crash, and can reconnect". That is the whole reason this file exists:
 * everything below classifies and returns rather than throwing.
 */

export type MailFailure =
  | "not-configured"
  | "auth-failed"
  | "unreachable"
  | "timeout"
  | "mailbox-missing"
  | "error";

export function explainMailFailure(reason: MailFailure): string {
  switch (reason) {
    case "not-configured":
      return "No mailbox is connected for this business.";
    case "auth-failed":
      return "Gmail rejected the sign-in. The app password may have been revoked or changed — reconnect the mailbox to continue.";
    case "unreachable":
      return "Gmail could not be reached. Check the server's connection and try again.";
    case "timeout":
      return "Gmail did not respond in time. The next sync will try again.";
    case "mailbox-missing":
      return "The mailbox opened but the inbox folder was not found.";
    default:
      return "The mailbox could not be read just now.";
  }
}

/**
 * Turns whatever the IMAP or SMTP client threw into one of the cases above.
 *
 * Authentication is separated from every other failure deliberately: a revoked
 * app password is the one case a person has to act on, and it must not be
 * reported as a generic outage they would wait out.
 */
export function classifyMailError(error: unknown): MailFailure {
  const fault = error as {
    code?: string;
    /** ImapFlow sets this outright when the server rejected the sign-in. */
    authenticationFailed?: boolean;
    serverResponseCode?: string;
    responseText?: string;
    response?: string;
    message?: string;
  };

  /**
   * ImapFlow reports an authentication failure as a flag, not as a message —
   * `error.message` is the generic "Command failed", while the real answer
   * ("NO [AUTHENTICATIONFAILED] Invalid credentials") is on these fields. Read
   * the flag first: a revoked app password is the one failure a person has to
   * act on, and reporting it as a generic outage would have them wait for a
   * recovery that is never going to come.
   */
  if (fault.authenticationFailed === true) return "auth-failed";
  if (fault.serverResponseCode === "AUTHENTICATIONFAILED") return "auth-failed";

  const code = fault.code ?? "";
  const text = [
    fault.message,
    fault.responseText,
    fault.response,
    fault.serverResponseCode,
    code,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    code === "EAUTH" ||
    text.includes("invalid credentials") ||
    text.includes("authenticationfailed") ||
    text.includes("authentication failed") ||
    text.includes("username and password not accepted") ||
    text.includes("application-specific password")
  ) {
    return "auth-failed";
  }

  if (
    code === "ETIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ESOCKETTIMEDOUT" ||
    text.includes("timed out") ||
    text.includes("socket timeout")
  ) {
    return "timeout";
  }

  if (
    code === "ENOTFOUND" ||
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    code === "ECONNECTION" ||
    text.includes("getaddrinfo")
  ) {
    return "unreachable";
  }

  if (text.includes("mailbox does not exist") || text.includes("nonexistent")) {
    return "mailbox-missing";
  }

  return "error";
}

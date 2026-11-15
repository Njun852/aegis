/**
 * Email addresses typed into To, Cc and Bcc. Pure and client-safe, so the
 * compose box and the reply box check them as the person types, and the
 * server checks them again before anything is sent.
 */

/** A loose check: enough to catch a typo or a name in the box, not RFC 5322. */
const ADDRESS = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/;

/** Everyone a message goes to, To, Cc and Bcc together. Gmail allows far more; this stops a slip becoming a blast. */
export const MAX_RECIPIENTS = 20;

export interface ParsedRecipients {
  /** Each address once, lower-cased, in the order typed. */
  addresses: string[];
  /** What was typed that is not an address. */
  invalid: string[];
}

/**
 * Splits a box of addresses on commas, semicolons, spaces or new lines.
 * "Ana Cruz <ana@shop.ph>" is read as ana@shop.ph.
 */
export function parseRecipients(text: string): ParsedRecipients {
  const addresses: string[] = [];
  const invalid: string[] = [];
  const parts = text
    .replace(/[^<>,;\n]*<([^<>]+)>/g, " $1 ")
    .split(/[\s,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of parts) {
    const address = part.toLowerCase();
    if (!ADDRESS.test(address)) invalid.push(part);
    else if (!addresses.includes(address)) addresses.push(address);
  }
  return { addresses, invalid };
}

export interface RecipientSet {
  to: string[];
  cc: string[];
  bcc: string[];
}

/**
 * The three boxes read together, or why they cannot be sent as typed. An
 * address in more than one box is kept in the first (To, then Cc), so nobody
 * receives the message twice.
 */
export function readRecipients(
  boxes: { to: string; cc: string; bcc: string },
  { requireTo = true }: { requireTo?: boolean } = {},
): { ok: true; recipients: RecipientSet } | { ok: false; error: string } {
  const to = parseRecipients(boxes.to);
  const cc = parseRecipients(boxes.cc);
  const bcc = parseRecipients(boxes.bcc);

  for (const [label, parsed] of [["To", to], ["Cc", cc], ["Bcc", bcc]] as const) {
    if (parsed.invalid.length > 0) {
      return { ok: false, error: `${label}: "${parsed.invalid[0]}" is not an email address.` };
    }
  }
  if (requireTo && to.addresses.length === 0) return { ok: false, error: "Add who the message is to." };

  const ccOnly = cc.addresses.filter((address) => !to.addresses.includes(address));
  const bccOnly = bcc.addresses.filter((address) => !to.addresses.includes(address) && !ccOnly.includes(address));
  const total = to.addresses.length + ccOnly.length + bccOnly.length;
  if (total > MAX_RECIPIENTS) {
    return { ok: false, error: `A message can go to at most ${MAX_RECIPIENTS} people, To, Cc and Bcc together.` };
  }
  return { ok: true, recipients: { to: to.addresses, cc: ccOnly, bcc: bccOnly } };
}

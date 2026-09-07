import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Reversible encryption for credentials AEGIS has to be able to replay — a
 * mailbox app password, which must be sent to Gmail on every sync.
 *
 * Deliberately not hashing: `src/lib/auth/password.ts` hashes because a user's
 * password only ever needs comparing. This one has to be recovered, so it is
 * encrypted with AES-256-GCM under a key held in the environment. A database
 * dump on its own therefore yields nothing usable — an attacker needs the
 * server's `MAIL_CREDENTIAL_KEY` as well.
 *
 * GCM rather than CBC: it authenticates as well as encrypts, so tampering with
 * a stored value is detected on decrypt instead of producing plausible rubbish.
 * The stored format is `gcm$<ivHex>$<tagHex>$<cipherHex>`, matching the shape
 * `password.ts` already uses.
 */

const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export class MissingCredentialKeyError extends Error {
  constructor() {
    super(
      "MAIL_CREDENTIAL_KEY is not set, or is not 64 hex characters. Generate one with: openssl rand -hex 32",
    );
    this.name = "MissingCredentialKeyError";
  }
}

function key(): Buffer {
  const raw = process.env.MAIL_CREDENTIAL_KEY?.trim();
  if (!raw) throw new MissingCredentialKeyError();

  const bytes = Buffer.from(raw, "hex");
  if (bytes.length !== KEY_LENGTH) throw new MissingCredentialKeyError();
  return bytes;
}

/** True when the install is configured to store mailbox credentials at all. */
export function canStoreSecrets(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return [
    "gcm",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join("$");
}

/**
 * Returns null rather than throwing when a stored value cannot be read — a
 * rotated key or a tampered row is a state the caller must handle (report the
 * mailbox as needing reconnection), not an exception that takes a page down.
 */
export function decryptSecret(stored: string): string | null {
  const [scheme, ivHex, tagHex, cipherHex] = stored.split("$");
  if (scheme !== "gcm" || !ivHex || !tagHex || !cipherHex) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivHex, "hex"),
    );
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([
      decipher.update(Buffer.from(cipherHex, "hex")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

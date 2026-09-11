import { randomBytes } from "node:crypto";

/**
 * Generated account passwords — "Kq7m-Xw3P-9fRt-Hn2c".
 *
 * Self-contained on purpose: no `server-only`, no `@/` imports. The seed script
 * runs under plain Node without the app's alias resolver or the react-server
 * condition, and it needs to mint the first administrator's password with the
 * same generator the Users screen uses. Never import this from a client
 * component — `node:crypto` does not belong in a browser bundle.
 *
 * No 0/O or 1/l/I, so a password read aloud or copied off a screen survives it.
 * `randomBytes` with rejection sampling rather than a modulo, so no character is
 * likelier than another: roughly 90 bits across sixteen characters.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const GROUPS = 4;
const GROUP_LENGTH = 4;

export function generatePassword(): string {
  const limit = 256 - (256 % ALPHABET.length);
  const chars: string[] = [];

  while (chars.length < GROUPS * GROUP_LENGTH) {
    for (const byte of randomBytes(32)) {
      if (byte >= limit) continue;
      chars.push(ALPHABET[byte % ALPHABET.length]);
      if (chars.length === GROUPS * GROUP_LENGTH) break;
    }
  }

  const groups: string[] = [];
  for (let index = 0; index < GROUPS; index += 1) {
    groups.push(chars.slice(index * GROUP_LENGTH, (index + 1) * GROUP_LENGTH).join(""));
  }
  return groups.join("-");
}

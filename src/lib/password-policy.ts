/**
 * The password rules, stated once.
 *
 * Deliberately free of `server-only`: the form shows the rule and the server
 * enforces it, and the two must never drift apart. The DAL that enforces it
 * imports `next/headers`, so the constant cannot live there — a client
 * component importing it would pull the whole server module into the bundle.
 */
export const PASSWORD_MIN_LENGTH = 10;

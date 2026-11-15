/**
 * Links in mail: pulled out of an email's HTML and text when it is read in,
 * and found in the plain text again when it is shown, so a web address in the
 * body can be clicked. Pure and client-safe.
 */
import type { MailLink } from "@/types";

/** Plenty for a real email; a newsletter's hundred tracking links are not worth listing. */
export const MAX_LINKS = 40;

/** A web address in plain text, stopping before trailing punctuation. */
const URL_IN_TEXT = /\bhttps?:\/\/[^\s<>"'`]+[^\s<>"'`.,;:!?)\]}]/gi;

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };

function decode(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (_, name: string) => ENTITIES[name] ?? "");
}

/** Only addresses a person can safely open: web pages and email addresses. Never `javascript:` or `data:`. */
export function isSafeLink(url: string): boolean {
  return /^(https?:\/\/[^\s]+|mailto:[^\s@]+@[^\s]+)$/i.test(url);
}

/**
 * Every link in an email, each once, in the order they appear: `<a href>` in
 * the HTML with the words it was shown as, then web addresses written in the
 * text. Unsafe schemes are dropped.
 */
export function readLinks(html: string | false | undefined, text: string): MailLink[] {
  const links: MailLink[] = [];
  const add = (rawUrl: string, rawText: string) => {
    const url = decode(rawUrl.trim());
    if (!isSafeLink(url) || links.some((link) => link.url === url) || links.length >= MAX_LINKS) return;
    const label = decode(rawText.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 140);
    links.push({ url, text: label && label !== url ? label : "" });
  };
  if (typeof html === "string") {
    for (const match of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi)) {
      add(match[2], match[3]);
    }
  }
  for (const match of text.matchAll(URL_IN_TEXT)) add(match[0], "");
  return links;
}

/** A paragraph cut into plain text and web addresses, so the addresses can be shown as links. */
export function splitLinks(text: string): { text: string; url?: string }[] {
  const parts: { text: string; url?: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_IN_TEXT)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at) });
    parts.push({ text: match[0], url: match[0] });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** "drive.google.com", for showing where a link really goes. */
export function linkHost(url: string): string {
  if (url.toLowerCase().startsWith("mailto:")) return url.slice(7);
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

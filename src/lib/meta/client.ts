import "server-only";

import { classifyMetaError, type GraphError, type MetaFailure } from "./failures";

/**
 * The only door between AEGIS and Meta — and it opens one way.
 *
 * AEGIS reads ad accounts; it never changes them. That is enforced here rather
 * than promised elsewhere: the request method is fixed to GET, and this module
 * exports nothing that could create, edit, pause or delete a campaign. An ESLint
 * rule (`eslint.config.mjs`) forbids the Graph API hostname in every other file,
 * so a second, writable path to Meta cannot be added without the lint failing.
 *
 * The token travels in the Authorization header, never in the URL, so it cannot
 * end up in a request log. Every call resolves to a result; none throw.
 */

/**
 * Pinned rather than floating: Meta changes field behaviour between versions,
 * and an unpinned call would change under us on Meta's schedule. v26.0 was the
 * newest version the sandbox account accepted when this was written; bump it
 * deliberately, and re-run `npm run ads:check` when you do.
 */
export const GRAPH_VERSION = "v26.0";

const GRAPH_ORIGIN = "https://graph.facebook.com";
const TIMEOUT_MS = 15_000;

/** Upper bound on objects fetched per list, so one huge account cannot run away. */
export const PAGE_CAP = 500;

export type MetaOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; reason: MetaFailure; detail: string };

async function request<T>(url: URL, token: string): Promise<MetaOutcome<T>> {
  // A paging cursor comes back from Meta as a full URL. Following it is only
  // safe while it still points at Meta — the token must never be sent anywhere
  // else, whatever a response claims.
  if (url.origin !== GRAPH_ORIGIN) {
    return { ok: false, reason: "error", detail: `Refused to follow ${url.origin}` };
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (cause) {
    const name = (cause as { name?: string })?.name;
    return name === "TimeoutError" || name === "AbortError"
      ? { ok: false, reason: "timeout", detail: "Meta did not respond in time." }
      : {
          ok: false,
          reason: "unreachable",
          detail: cause instanceof Error ? cause.message : String(cause),
        };
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      reason: response.ok ? "error" : classifyMetaError(null, response.status),
      detail: `Meta answered ${response.status} with a body that was not JSON.`,
    };
  }

  const error = (body as { error?: GraphError })?.error;
  if (!response.ok || error) {
    return {
      ok: false,
      reason: classifyMetaError(error ?? null, response.status),
      detail: error?.message ?? `Meta answered ${response.status}.`,
    };
  }

  return { ok: true, data: body as T };
}

function buildUrl(path: string, params: Record<string, string>): URL {
  if (!path.startsWith("/") || path.includes("://")) {
    throw new Error(`Graph paths are relative, e.g. /act_123/campaigns — got ${path}`);
  }
  const url = new URL(`${GRAPH_ORIGIN}/${GRAPH_VERSION}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

/** One object or one page. */
export function graphGet<T>(
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<MetaOutcome<T>> {
  return request<T>(buildUrl(path, params), token);
}

interface Page<T> {
  data?: T[];
  paging?: { next?: string };
}

/**
 * Every page of a list, up to `PAGE_CAP` items. `truncated` says the cap was
 * hit, so the caller knows the list is incomplete and must not treat anything
 * missing from it as deleted.
 */
export async function graphGetAll<T>(
  token: string,
  path: string,
  params: Record<string, string> = {},
): Promise<MetaOutcome<{ items: T[]; truncated: boolean }>> {
  const items: T[] = [];
  let url: URL | null = buildUrl(path, { limit: "100", ...params });

  while (url) {
    const page: MetaOutcome<Page<T>> = await request<Page<T>>(url, token);
    if (!page.ok) return page;

    items.push(...(page.data.data ?? []));
    if (items.length >= PAGE_CAP) {
      return { ok: true, data: { items: items.slice(0, PAGE_CAP), truncated: true } };
    }

    const next: string | undefined = page.data.paging?.next;
    url = next ? new URL(next) : null;
  }

  return { ok: true, data: { items, truncated: false } };
}

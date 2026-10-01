import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`. This is an *optimistic* check
 * only — it looks for the session cookie's presence so signed-out visitors are
 * bounced without a database round trip. It deliberately does not verify the
 * token: every real authorization decision happens in the DAL
 * (`src/lib/dal/session.ts`), which is what the Next docs recommend.
 */
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIES.some((name) =>
    request.cookies.has(name),
  );

  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Everything except the auth endpoints, the login page, static assets, the
   * Meta webhook — Meta arrives with no session, and that route proves who it
   * is by checking Meta's signature instead — and the public booking page,
   * which customers use without an account. That page reaches the database
   * only through `src/lib/dal/public-booking.ts`, by the business its link
   * names, and its actions are rate limited per visitor.
   */
  matcher: [
    "/((?!api/auth|api/meta/webhook|book/|login|_next/static|_next/image|favicon.ico).*)",
  ],
};

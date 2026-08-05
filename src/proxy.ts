import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, eventFromHost } from "@/lib/config";
import { verifySession } from "@/lib/auth/session";

/**
 * Host-based routing for the five-subdomain platform, plus path-based routing
 * as a fallback.
 *
 * NOTE ON THE FILENAME: Next.js 16 deprecated `middleware.ts` in favour of
 * `proxy.ts` (and the named export `middleware` → `proxy`). Unlike middleware,
 * proxy runs on the **Node.js** runtime and that is not configurable.
 *
 *   hunt.example.com/clue/3  →  rewrite → /hunt/clue/3   → app/(hunt)/...
 *   ctf.example.com/         →  rewrite → /ctf           → app/(ctf)/...
 *   app.example.com/enter    →  passthrough              → app/(app)/enter
 *
 * The rewrite is invisible to the user: the URL bar keeps the pretty
 * subdomain form while Next resolves a normal nested route.
 *
 * PATH-BASED ROUTING exists because not every deployment has subdomains.
 * localhost and ngrok serve everything from one host, so `/ctf` and `/quiz`
 * must be gated on the path alone. `PROTECTED_PREFIXES` is what makes those
 * reachable-but-authenticated when `eventFromHost` returns null.
 *
 * AUTH HERE IS OPTIMISTIC ONLY. Per the Next docs, proxy shouldn't be treated
 * as the authorization boundary — it exists to bounce logged-out users to the
 * entry page cheaply. Every route handler that mutates state re-verifies the
 * session itself (see `requireSession`). Losing that second check would be a
 * real vulnerability, not a style issue.
 */

/**
 * The admin console lives at an unguessable path rather than `/admin`. This is
 * obscurity, not security — every `/api/admin/**` handler still checks
 * `session.role === "admin"` — but it keeps the console out of casual reach
 * and out of logs that participants can see over a shoulder.
 */
const SECRET_ADMIN_PATH = "/spider-hq-admin-9981";

/** Paths that must never be rewritten or gated. */
const PUBLIC_PREFIXES = ["/_next", "/api/health", "/favicon.ico", "/enter", "/api/enter", "/admin"];

/** Gated even without an event subdomain — see PATH-BASED ROUTING above. */
const PROTECTED_PREFIXES = ["/ctf", SECRET_ADMIN_PATH, "/hunt", "/code", "/quiz"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // The admin login page itself must be reachable logged-out, or there is no
  // way to log in. Exact match only: everything under it stays gated.
  if (pathname === SECRET_ADMIN_PATH) {
    return NextResponse.next();
  }

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  // Every API route lives at the top level (`src/app/api/**`), not nested
  // under a per-event route group, and every handler re-verifies its own
  // session via `requireSession` (see the file-level note above). Rewriting
  // `/api/quiz/round1` to `/quiz/api/quiz/round1` 404s outright, and an HTML
  // redirect is the wrong response for a fetch() caller anyway — a 401 JSON
  // body from the handler itself is what the client code expects.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const host = request.headers.get("host");
  const event = eventFromHost(host);
  const isProtectedPath = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Neither an event subdomain (app.*, www.*, localhost) nor a protected
  // path — serve as-is.
  if (!event && !isProtectedPath) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value || request.cookies.get("xplore_session")?.value;
  const session = await verifySession(token);
  if (!session) {
    // Built from the real Host header, not request.nextUrl.origin — the latter
    // collapses to the bare "localhost" origin regardless of which subdomain
    // the request actually came in on, which sent every login redirect back
    // to the plain landing page instead of the event the user was on.
    const origin = `${request.nextUrl.protocol}//${host}`;
    // Admins bounce to their own console login, not the participant entry page.
    const entryPath = pathname.startsWith(SECRET_ADMIN_PATH) ? SECRET_ADMIN_PATH : "/enter";
    const entry = new URL(entryPath, origin);
    // Send them back where they were trying to go once they're in.
    entry.searchParams.set("rt", `${origin}${pathname}${search}`);
    return NextResponse.redirect(entry);
  }

  // Subdomain routing: rewrite the subdomain into its route group segment.
  if (event) {
    const url = request.nextUrl.clone();
    const cleanPathname = pathname.startsWith(`/${event}`) ? pathname.slice(event.length + 1) || "/" : pathname;
    url.pathname = `/${event}${cleanPathname === "/" ? "" : cleanPathname}`;

    const res = NextResponse.rewrite(url);
    // Hand identity to route handlers so they don't each re-parse the cookie.
    // These are internal-only; they never reach the browser.
    res.headers.set("x-team-id", session.teamId);
    res.headers.set("x-participant-id", session.sub);
    res.headers.set("x-event", event);
    return res;
  }

  // Path-based routing (e.g. /ctf, /quiz on localhost or ngrok). The path
  // already names the route group, so there is nothing to rewrite.
  const res = NextResponse.next();
  res.headers.set("x-team-id", session.teamId);
  res.headers.set("x-participant-id", session.sub);
  return res;
}

export const config = {
  /**
   * Skip static assets outright — running proxy on every chunk request would
   * add latency to page loads for no benefit.
   */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};

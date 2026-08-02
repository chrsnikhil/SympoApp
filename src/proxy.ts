import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, eventFromHost } from "@/lib/config";
import { verifySession } from "@/lib/auth/session";

/**
 * Host-based & path-based proxy authentication boundary.
 */

/** Paths that must never be gated. */
const PUBLIC_PREFIXES = ["/_next", "/api/health", "/favicon.ico", "/enter", "/api/enter"];

const PROTECTED_PREFIXES = ["/ctf", "/admin", "/hunt", "/code", "/quiz"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const host = request.headers.get("host");
  const event = eventFromHost(host);
  const isProtectedPath = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Not an event subdomain and not a protected path — serve as-is.
  if (!event && !isProtectedPath) {
    return NextResponse.next();
  }

  // Optimistic session check (signature verification)
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  console.log(`[proxy debug] path=${pathname} tokenPresent=${Boolean(token)} sessionVerified=${Boolean(session)}`);
  if (!session) {
    const entry = new URL("/enter", request.nextUrl.origin);
    // Use relative path for rt so redirects work across ngrok, custom domains, and localhost
    entry.searchParams.set("rt", `${pathname}${search}`);
    return NextResponse.redirect(entry);
  }

  // If subdomain routing, rewrite into route group segment
  if (event) {
    const url = request.nextUrl.clone();
    url.pathname = `/${event}${pathname === "/" ? "" : pathname}`;

    const res = NextResponse.rewrite(url);
    res.headers.set("x-team-id", session.teamId);
    res.headers.set("x-participant-id", session.sub);
    res.headers.set("x-event", event);
    return res;
  }

  // Path-based routing (e.g. /ctf, /admin/ctf on localhost / ngrok)
  const res = NextResponse.next();
  res.headers.set("x-team-id", session.teamId);
  res.headers.set("x-participant-id", session.sub);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?)$).*)"],
};

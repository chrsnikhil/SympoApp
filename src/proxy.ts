import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, eventFromHost } from "@/lib/config";
import { verifySession } from "@/lib/auth/session";

/**
 * Host-based & path-based proxy authentication boundary.
 */

/** Secret randomized admin login path prefix */
const SECRET_ADMIN_PATH = "/spider-hq-admin-9981";

/** Paths that must never be gated for authentication. */
const PUBLIC_PREFIXES = ["/_next", "/api/health", "/favicon.ico", "/enter", "/api/enter"];

const PROTECTED_PREFIXES = ["/ctf", SECRET_ADMIN_PATH, "/hunt", "/code", "/quiz"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Exact match on secret admin login page is public
  if (pathname === SECRET_ADMIN_PATH) {
    return NextResponse.next();
  }

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
    const isAdminRoute = pathname.startsWith(SECRET_ADMIN_PATH);
    const targetEntryPath = isAdminRoute ? SECRET_ADMIN_PATH : "/enter";
    const entry = new URL(targetEntryPath, request.nextUrl.origin);
    // Use relative path for rt so redirects work across ngrok, custom domains, and localhost
    entry.searchParams.set("rt", `${pathname}${search}`);
    return NextResponse.redirect(entry);
  }

  // If subdomain routing, rewrite into route group segment (except for API routes)
  if (event && !pathname.startsWith("/api/")) {
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

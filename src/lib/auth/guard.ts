import { cookies } from "next/headers";
import { SESSION_COOKIE } from "@/lib/config";
import { verifySession, type SessionClaims } from "./session";

/**
 * The real authorization boundary.
 *
 * `proxy.ts` does an optimistic check to bounce logged-out users, but proxy is
 * explicitly not a security boundary in Next 16 — a request can reach a route
 * handler without passing through it. So every handler that reads private data
 * or writes anything calls this and re-verifies the cookie itself.
 */
export async function getSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
    this.name = "UnauthorizedError";
  }
}

/** Use in route handlers; throws rather than returning null so callers can't forget to check. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session;
}

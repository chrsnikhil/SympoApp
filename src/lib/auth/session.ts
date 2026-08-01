import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import {
  COOKIE_DOMAIN,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  requireEnv,
} from "@/lib/config";

/**
 * Stateless sessions.
 *
 * The whole point: verifying a request is a signature check with ZERO database
 * reads. That is what lets 500 people load pages in the same five seconds
 * without the database becoming the bottleneck. The trade-off is that a
 * session can't be revoked instantly — acceptable for a few-hour event, and
 * the TTL bounds it.
 *
 * `jose` rather than `jsonwebtoken` because it's Web Crypto based, so the same
 * code runs unchanged in route handlers and in `proxy.ts`.
 */

export interface SessionClaims {
  /** Participant id (Mongo ObjectId as string). */
  sub: string;
  teamId: string;
  role: "participant" | "admin";
}

function secret(): Uint8Array {
  return new TextEncoder().encode(requireEnv("JWT_SECRET"));
}

export async function signSession(claims: SessionClaims): Promise<string> {
  return new SignJWT({ teamId: claims.teamId, role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret());
}

/** Returns the claims, or null for missing/expired/tampered tokens. */
export async function verifySession(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.teamId !== "string") return null;
    return {
      sub: payload.sub,
      teamId: payload.teamId,
      role: payload.role === "admin" ? "admin" : "participant",
    };
  } catch {
    // Covers expiry, bad signature, malformed token — all equally "no session".
    return null;
  }
}

/**
 * Cookie options.
 *
 * `domain: .example.com` is the load-bearing part: it makes the cookie valid
 * on every subdomain, so logging in once at app.* carries into hunt.*, ctf.*,
 * code.* and quiz.* with no further round trips.
 *
 * SameSite=Lax (not Strict) so following a link from the landing page into an
 * event still sends the cookie.
 */
export function sessionCookieOptions() {
  const domain = COOKIE_DOMAIN ?? undefined;
  return {
    httpOnly: true,
    secure: false,
    sameSite: "lax" as const,
    path: "/",
    domain,
    maxAge: SESSION_TTL_SECONDS,
  };
}

/** Codes are stored hashed; a database dump must not yield working codes. */
export function hashCode(code: string): string {
  return createHash("sha256").update(normaliseCode(code)).digest("hex");
}

/** Users type codes with stray spaces and mixed case — normalise before hashing. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function normaliseAnswer(answer: string): string {
  return answer
    .trim()
    .toLowerCase()
    .replace(/^(a|an|the)\s+/i, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Constant-time-ish compare for answer/flag hashes. */
export function hashAnswer(answer: string): string {
  return createHash("sha256").update(normaliseAnswer(answer)).digest("hex");
}

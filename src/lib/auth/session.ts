import { SignJWT, jwtVerify } from "jose";
import { createHash } from "node:crypto";
import {
  COOKIE_DOMAIN,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  requireEnv,
} from "@/lib/config";

export interface SessionClaims {
  /** Participant id (Mongo ObjectId as string). */
  sub: string;
  teamId: string;
  role: "participant" | "admin";
}

export interface CookieOptions {
  name: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
  maxAge: number;
  domain?: string;
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
    return null;
  }
}

/**
 * Cookie options.
 */
export function sessionCookieOptions(isSecure?: boolean): CookieOptions {
  const opts: CookieOptions = {
    name: SESSION_COOKIE,
    httpOnly: true,
    secure: isSecure ?? (process.env.NODE_ENV === "production"),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
  if (COOKIE_DOMAIN && COOKIE_DOMAIN.trim().length > 0) {
    opts.domain = COOKIE_DOMAIN.trim();
  }
  return opts;
}

/** Codes are stored hashed; a database dump must not yield working codes. */
export function hashCode(code: string): string {
  return createHash("sha256").update(normaliseCode(code)).digest("hex");
}

/** Users type codes with stray spaces and mixed case — normalise before hashing. */
export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/** Constant-time-ish compare for answer/flag hashes. */
export function hashAnswer(answer: string): string {
  return createHash("sha256").update(answer.trim().toLowerCase()).digest("hex");
}

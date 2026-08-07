import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * The gate is the whole point of this file, so it is tested through `proxy()`
 * rather than by asserting the contents of PROTECTED_PREFIXES. A constant
 * containing the right string proves nothing if the matching logic around it
 * is wrong — these tests fail if either half breaks.
 */
vi.mock("@/lib/auth/session", () => ({
  // No valid session, ever. This is the logged-out case.
  verifySession: async () => null,
}));

const { proxy } = await import("./proxy");

/** Path-based deployment: one host, no event subdomain (localhost, ngrok). */
const req = (path: string) =>
  new NextRequest(new URL(`http://localhost:3000${path}`), {
    headers: { host: "localhost:3000" },
  });

describe("proxy gating, logged out", () => {
  it("bounces /shiftverse to the entry page", async () => {
    const res = await proxy(req("/shiftverse"));
    expect(res.status).toBe(307);
    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/enter");
  });

  it("bounces a nested shiftverse path too, not just the root", async () => {
    const res = await proxy(req("/shiftverse/result"));
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/enter");
  });

  it("carries the attempted path in rt so login returns there", async () => {
    const res = await proxy(req("/shiftverse/result"));
    const rt = new URL(res.headers.get("location")!).searchParams.get("rt");
    expect(rt).toContain("/shiftverse/result");
  });

  // Guards the prefix match: a path that merely starts with the same letters
  // must not be swept in, and the events that were already gated must stay so.
  it("still gates the pre-existing events", async () => {
    for (const p of ["/quiz", "/ctf", "/hunt", "/code"]) {
      expect((await proxy(req(p))).status).toBe(307);
    }
  });

  it("leaves the entry page itself reachable", async () => {
    const res = await proxy(req("/enter"));
    expect(res.status).not.toBe(307);
  });

  it("leaves the health check reachable", async () => {
    const res = await proxy(req("/api/health"));
    expect(res.status).not.toBe(307);
  });
});

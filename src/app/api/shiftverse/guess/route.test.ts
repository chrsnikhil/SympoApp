import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHIFTVERSE_DURATION_MS } from "@/lib/config";

const requireSession = vi.fn();

vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guard")>();
  return { ...actual, requireSession: () => requireSession() };
});

const claimSlot = vi.fn();
vi.mock("@/lib/shiftverse/slot", () => ({
  claimSlot: (...args: unknown[]) => claimSlot(...args),
}));

const { UnauthorizedError } = await import("@/lib/auth/guard");
const { POST, evaluateAttempt, isBoardExpired } = await import("./route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/shiftverse/guess", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireSession.mockReset();
  claimSlot.mockReset();
});

describe("POST /api/shiftverse/guess", () => {
  it("returns 401 when there is no valid session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError());

    const res = await POST(req({ guessedWord: "TESTWORDALPHA" }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
    // An unauthenticated caller must never reach the database at all.
    expect(claimSlot).not.toHaveBeenCalled();
  });
});

// The attempt limiter and the expiry check are the two decidable pieces of
// this route, so they're pure functions the route wires up rather than logic
// buried in the handler — tested directly here, no request/DB plumbing needed.

describe("evaluateAttempt", () => {
  it("allows the first MAX_ATTEMPTS_PER_WINDOW calls and refuses the next", () => {
    const now = 1_000_000;
    let record: { count: number; resetAt: number } | undefined;

    for (let i = 0; i < 10; i++) {
      const result = evaluateAttempt(record, now);
      expect(result.limited).toBe(false);
      record = result.record;
    }

    // The 11th call inside the same window is the first one over the cap.
    const eleventh = evaluateAttempt(record, now);
    expect(eleventh.limited).toBe(true);
  });

  it("resets the count once the window has elapsed", () => {
    const first = evaluateAttempt(undefined, 0);
    expect(first.limited).toBe(false);

    // Drive the record past MAX_ATTEMPTS_PER_WINDOW within the same window.
    let record = first.record;
    for (let i = 0; i < 15; i++) {
      record = evaluateAttempt(record, 0).record;
    }
    expect(evaluateAttempt(record, 0).limited).toBe(true);

    // A call after resetAt starts a fresh window regardless of the exhausted count.
    const afterReset = evaluateAttempt(record, record.resetAt + 1);
    expect(afterReset.limited).toBe(false);
    expect(afterReset.record).toEqual({ count: 1, resetAt: record.resetAt + 1 + 60_000 });
  });

  it("does not reset exactly AT resetAt — the window is still live", () => {
    const record = { count: 10, resetAt: 500 };
    // now === resetAt fails the strict `now > resetAt` reset check, so this
    // call is still counted against the old window and pushes it over.
    expect(evaluateAttempt(record, 500).limited).toBe(true);
  });
});

describe("isBoardExpired", () => {
  const startTime = 1_000_000;

  it("is not expired just inside the window", () => {
    expect(isBoardExpired(startTime, startTime + SHIFTVERSE_DURATION_MS - 1)).toBe(false);
  });

  it("is not expired exactly at the boundary (strictly-greater check)", () => {
    expect(isBoardExpired(startTime, startTime + SHIFTVERSE_DURATION_MS)).toBe(false);
  });

  it("is expired just past the boundary", () => {
    expect(isBoardExpired(startTime, startTime + SHIFTVERSE_DURATION_MS + 1)).toBe(true);
  });

  it("treats an unstamped startTime (<= 0) as just starting now, never expired", () => {
    const now = 5_000_000;
    expect(isBoardExpired(0, now)).toBe(false);
  });
});

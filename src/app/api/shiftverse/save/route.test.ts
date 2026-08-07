import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();

vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guard")>();
  return { ...actual, requireSession: () => requireSession() };
});

const findOne = vi.fn();
const updateOne = vi.fn().mockResolvedValue({});
vi.mock("@/lib/db/client", () => ({
  collections: { shiftverseTeams: async () => ({ findOne, updateOne }) },
}));

const { UnauthorizedError } = await import("@/lib/auth/guard");
const { POST } = await import("./route");

function req(body: unknown): Request {
  return new Request("http://localhost/api/shiftverse/save", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireSession.mockReset();
  findOne.mockReset();
  updateOne.mockClear();
});

describe("POST /api/shiftverse/save", () => {
  it("returns 401 when there is no valid session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError());

    const res = await POST(req({ perLetterGuesses: [1, 2, 3] }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
    // An unauthenticated caller must never reach the database at all.
    expect(findOne).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });
});

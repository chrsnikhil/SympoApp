import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSession = vi.fn();

vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/guard")>();
  return { ...actual, requireSession: () => requireSession() };
});

const claimSlot = vi.fn();
vi.mock("@/lib/shiftverse/slot", () => ({
  claimSlot: (...args: unknown[]) => claimSlot(...args),
}));

const updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
vi.mock("@/lib/db/client", () => ({
  collections: { shiftverseTeams: async () => ({ updateOne }) },
}));

const { UnauthorizedError } = await import("@/lib/auth/guard");
const { GET } = await import("./route");

beforeEach(() => {
  requireSession.mockReset();
  claimSlot.mockReset();
  updateOne.mockClear();
});

describe("GET /api/shiftverse/state", () => {
  it("returns 401 when there is no valid session", async () => {
    requireSession.mockRejectedValue(new UnauthorizedError());

    const res = await GET();

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
    // An unauthenticated caller must never reach the database at all.
    expect(claimSlot).not.toHaveBeenCalled();
  });

  it("never returns plaintextWord or shiftKey, even though the slot document carries them", async () => {
    requireSession.mockResolvedValue({
      sub: "participant-1",
      teamId: "507f1f77bcf86cd799439011",
      role: "participant",
    });
    claimSlot.mockResolvedValue({
      _id: "slot-doc-id",
      teamNumber: 7,
      teamId: "507f1f77bcf86cd799439011",
      claimedAt: new Date(),
      // The whole point: these two exist on the document and must not
      // survive into the JSON response.
      plaintextWord: "MILESMORALES",
      shiftKey: 13,
      encryptedWord: "PLOHVPRUDOHV",
      perLetterGuesses: [1, 2, 3],
      startTime: Date.now(),
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).not.toHaveProperty("plaintextWord");
    expect(body).not.toHaveProperty("shiftKey");
    expect(body.teamNumber).toBe(7);
    expect(body.encryptedWord).toBe("PLOHVPRUDOHV");
  });
});

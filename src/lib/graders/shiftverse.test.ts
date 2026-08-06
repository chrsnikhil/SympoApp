import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const slot = {
  teamNumber: 1, plaintextWord: "MILESMORALES", encryptedWord: "PLOHVPRUDOHV",
  startTime: Date.now(), perLetterGuesses: [], teamId: new ObjectId(), claimedAt: new Date(), shiftKey: 3,
};

// A second team with a different word, so "does the grader resolve against the
// CALLER's slot" is answerable rather than assumed.
const otherSlot = { ...slot, teamNumber: 2, plaintextWord: "GWENSTACY", teamId: new ObjectId() };

vi.mock("@/lib/shiftverse/slot", () => ({
  claimSlot: async (teamId: ObjectId) =>
    String(teamId) === String(otherSlot.teamId) ? otherSlot : slot,
}));

/**
 * Stands in for the `submissions` collection. `priorSolve` is what the
 * already-solved guard will find; the tests set it to model a team that has
 * already won.
 */
let priorSolve: unknown = null;
let lastQuery: Record<string, unknown> | null = null;

vi.mock("@/lib/db/client", () => ({
  collections: {
    submissions: async () => ({
      findOne: async (q: Record<string, unknown>) => {
        lastQuery = q;
        return priorSolve;
      },
    }),
  },
}));

const { gradeShiftverse } = await import("./shiftverse");

const input = (payload: string, teamId = slot.teamId) => ({
  challenge: { _id: new ObjectId(), slug: "shiftverse", points: 100, config: {} } as never,
  teamId,
  participantId: new ObjectId(),
  submissionId: new ObjectId(),
  payload,
  receivedAt: new Date(),
});

beforeEach(() => {
  priorSolve = null;
  lastQuery = null;
});

describe("gradeShiftverse", () => {
  it("awards the challenge's points for the right word", async () => {
    const r = await gradeShiftverse(input("milesmorales"));
    expect(r.correct).toBe(true);
    expect(r.points).toBe(100);
  });

  it("scores nothing for a wrong word", async () => {
    const r = await gradeShiftverse(input("GWENSTACY"));
    expect(r.correct).toBe(false);
    expect(r.points).toBe(0);
  });

  // The assertion above passes against a stub that always returns
  // correct:false. This one does not: it requires the grader to actually
  // resolve the caller's own slot, which is the behaviour that replaced it.
  it("grades against the CALLER's slot, not any slot", async () => {
    // "GWENSTACY" is team 2's word and wrong for team 1...
    expect((await gradeShiftverse(input("GWENSTACY", slot.teamId))).correct).toBe(false);
    // ...and right for team 2.
    const r = await gradeShiftverse(input("GWENSTACY", otherSlot.teamId));
    expect(r.correct).toBe(true);
    expect(r.meta?.teamNumber).toBe(2);
  });

  describe("already-solved guard", () => {
    it("refuses to score a repeat of a word the team already got right", async () => {
      priorSolve = { _id: new ObjectId() };
      const r = await gradeShiftverse(input("milesmorales"));
      expect(r.correct).toBe(false);
      expect(r.points).toBe(0);
      expect(r.meta?.reason).toBe("already-solved");
    });

    // Without this the pipeline appends challenge.points per call, so a team
    // could farm the leaderboard until its board expired.
    it("pays exactly once across repeated correct submissions", async () => {
      const first = await gradeShiftverse(input("milesmorales"));
      expect(first.points).toBe(100);
      // The pipeline has now recorded a correct verdict.
      priorSolve = { _id: new ObjectId() };
      const second = await gradeShiftverse(input("milesmorales"));
      const third = await gradeShiftverse(input("milesmorales"));
      expect(second.points + third.points).toBe(0);
    });

    // Asserting the REASON, not just the score: a wrong guess scores 0 either
    // way, so checking only points would pass with the guard removed and prove
    // nothing. The reason distinguishes "short-circuited by the guard" from
    // "graded and found wrong".
    it("short-circuits a wrong guess made after solving, without penalty", async () => {
      priorSolve = { _id: new ObjectId() };
      const r = await gradeShiftverse(input("NONSENSE"));
      expect(r.points).toBe(0);
      expect(r.correct).toBe(false);
      expect(r.meta?.reason).toBe("already-solved");
    });

    it("scopes the check to this team and this challenge", async () => {
      await gradeShiftverse(input("milesmorales"));
      expect(lastQuery).toMatchObject({ teamId: slot.teamId, "verdict.correct": true });
      expect(lastQuery).toHaveProperty("challengeId");
    });

    // A .sort() here would throw on Cosmos unless the path is indexed — the
    // failure that took quiz Round 3 down. findOne must stay sort-free.
    it("queries without a sort", async () => {
      await gradeShiftverse(input("milesmorales"));
      expect(lastQuery).not.toHaveProperty("$orderby");
    });
  });
});

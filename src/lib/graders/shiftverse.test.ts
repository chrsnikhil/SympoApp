import { ObjectId } from "mongodb";
import { describe, expect, it, vi } from "vitest";

const slot = {
  teamNumber: 1, plaintextWord: "MILESMORALES", encryptedWord: "PLOHVPRUDOHV",
  startTime: Date.now(), perLetterGuesses: [], teamId: new ObjectId(), claimedAt: new Date(), shiftKey: 3,
};

vi.mock("@/lib/shiftverse/slot", () => ({ claimSlot: async () => slot }));

const { gradeShiftverse } = await import("./shiftverse");

const input = (payload: string) => ({
  challenge: { _id: new ObjectId(), slug: "shiftverse", points: 100, config: {} } as never,
  teamId: slot.teamId,
  participantId: new ObjectId(),
  submissionId: new ObjectId(),
  payload,
  receivedAt: new Date(),
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
});

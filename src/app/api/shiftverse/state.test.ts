import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId, type Collection } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ShiftverseTeam } from "@/lib/db/types";

let mongod: MongoMemoryServer;
let client: MongoClient;
let coll: Collection<ShiftverseTeam>;

vi.mock("@/lib/db/client", () => ({
  collections: { shiftverseTeams: async () => coll },
}));

const { claimSlot } = await import("@/lib/shiftverse/slot");

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  coll = client.db("t").collection<ShiftverseTeam>("shiftverse_teams");
});
afterAll(async () => { await client.close(); await mongod.stop(); });

beforeEach(async () => {
  await coll.deleteMany({});
  await coll.insertOne({
    teamNumber: 1, teamId: null, claimedAt: null,
    plaintextWord: "TESTWORDALPHA", encryptedWord: "WHVWZRUGDOSKD",
    shiftKey: 3, perLetterGuesses: [1, 2, 3], startTime: 0,
  });
});

describe("reading a claimed slot", () => {
  it("does not overwrite saved per-letter progress", async () => {
    const teamId = new ObjectId();
    await claimSlot(teamId);
    await coll.updateOne({ teamId }, { $set: { perLetterGuesses: [7, 7, 7] } });

    const again = await claimSlot(teamId);
    expect(again?.perLetterGuesses).toEqual([7, 7, 7]);
  });
});

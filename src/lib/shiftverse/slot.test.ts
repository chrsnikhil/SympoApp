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

const { claimSlot } = await import("./slot");

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  client = await new MongoClient(mongod.getUri()).connect();
  coll = client.db("t").collection<ShiftverseTeam>("shiftverse_teams");
});

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  await coll.deleteMany({});
  await coll.insertMany([1, 2].map((n) => ({
    teamNumber: n, teamId: null, claimedAt: null,
    plaintextWord: `WORD${n}`, encryptedWord: `XXXX${n}`,
    shiftKey: n, perLetterGuesses: [], startTime: 0,
  })));
});

describe("claimSlot", () => {
  it("claims a free slot on first call", async () => {
    const teamId = new ObjectId();
    const slot = await claimSlot(teamId);
    expect(slot?.teamNumber).toBe(1);
    expect(String(slot?.teamId)).toBe(String(teamId));
  });

  it("returns the SAME slot on repeat calls — never a second word", async () => {
    const teamId = new ObjectId();
    const first = await claimSlot(teamId);
    const second = await claimSlot(teamId);
    expect(second?.teamNumber).toBe(first?.teamNumber);
    expect(await coll.countDocuments({ teamId })).toBe(1);
  });

  it("gives two teams different slots under concurrent claims", async () => {
    const a = new ObjectId();
    const b = new ObjectId();
    const [x, y] = await Promise.all([claimSlot(a), claimSlot(b)]);
    expect(x?.teamNumber).not.toBe(y?.teamNumber);
  });

  it("returns null when every slot is taken", async () => {
    await claimSlot(new ObjectId());
    await claimSlot(new ObjectId());
    expect(await claimSlot(new ObjectId())).toBeNull();
  });
});

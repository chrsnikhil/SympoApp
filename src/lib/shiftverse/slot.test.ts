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

  it("never lets ONE team hold more than one slot under concurrent claims", async () => {
    // Give the race room: 5 concurrent claims for the SAME team need at least
    // 5 free slots on the table, or slot exhaustion — not the bug under test —
    // would explain a low final count on its own.
    await coll.insertMany([3, 4, 5].map((n) => ({
      teamNumber: n, teamId: null, claimedAt: null,
      plaintextWord: `WORD${n}`, encryptedWord: `XXXX${n}`,
      shiftKey: n, perLetterGuesses: [], startTime: 0,
    })));

    const teamId = new ObjectId();
    // Racing two DIFFERENT teamIds (as the test above does) can only ever
    // catch two teams sharing one slot — findOneAndUpdate already prevents
    // that. It says nothing about ONE team being handed two slots, which is
    // exactly what a `findOne` fast-path race allows: concurrent calls can
    // all read null before any write lands, then each atomically wins a
    // DIFFERENT free slot.
    const results = await Promise.all(Array.from({ length: 5 }, () => claimSlot(teamId)));

    // The invariant that matters: however the race interleaves, the team
    // never ends up owning more than one document. (A racing call CAN
    // legitimately return a slot moments before a later concurrent call's own
    // compensation pass reassigns the canonical one — that's a transient
    // read, not a bug; the very next claimSlot() call always returns the one
    // slot that persists here. Asserting every call's return value agrees
    // would require a distributed lock, which isn't available on this
    // collection and isn't what this fix does.)
    expect(results.some((r) => r !== null)).toBe(true);
    expect(await coll.countDocuments({ teamId })).toBe(1);
  });
});

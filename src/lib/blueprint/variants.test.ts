import { describe, expect, it } from "vitest";
import { SECTOR_COUNT, isSectorCode, sectorNumberFor } from "./variants";
import { SECTORS, sectorInfo } from "./sectors";

describe("sectorNumberFor", () => {
  it("matches the original ((n - 1) % 10) + 1, so nobody's sector moves", () => {
    expect(sectorNumberFor(1)).toBe(1);
    expect(sectorNumberFor(10)).toBe(10);
    expect(sectorNumberFor(11)).toBe(1);
    expect(sectorNumberFor(60)).toBe(10);
  });

  it("never returns a sector that does not exist", () => {
    for (let n = -5; n <= 120; n++) {
      const s = sectorNumberFor(n);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(SECTOR_COUNT);
      expect(sectorInfo(s)).toBeDefined();
    }
  });

  it("assigns all sixty teams evenly across the ten sectors", () => {
    const counts = new Map<number, number>();
    for (let n = 1; n <= 60; n++) {
      const s = sectorNumberFor(n);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    expect(counts.size).toBe(SECTOR_COUNT);
    for (const n of counts.values()) expect(n).toBe(6);
  });
});

describe("isSectorCode", () => {
  it("rejects another sector's code", () => {
    // The point of the round: the code is at one physical place, so knowing
    // somebody else's must not help.
    expect(isSectorCode(1, "SPIDER-MAN-2099")).toBe(false);
    expect(isSectorCode(2, "PETER-PARKER-616")).toBe(false);
  });

  it("accepts the right code regardless of case or surrounding space", () => {
    // Read off a card and typed under time pressure. A trailing space is not a
    // wrong answer.
    expect(isSectorCode(1, "peter-parker-616")).toBe(true);
    expect(isSectorCode(1, "  PETER-PARKER-616  ")).toBe(true);
  });

  it("does not normalise the punctuation that is part of a code", () => {
    // SP//DR-14512 — dropping the slashes would silently widen the answer.
    expect(isSectorCode(9, "SPDR-14512")).toBe(false);
    expect(isSectorCode(9, "SP//DR-14512")).toBe(true);
  });

  it("treats an out-of-range sector as wrong rather than throwing", () => {
    expect(isSectorCode(0, "PETER-PARKER-616")).toBe(false);
    expect(isSectorCode(99, "PETER-PARKER-616")).toBe(false);
  });

  it("rejects an empty guess", () => {
    expect(isSectorCode(1, "")).toBe(false);
    expect(isSectorCode(1, "   ")).toBe(false);
  });
});

describe("the public sector table carries no answers", () => {
  it("has one entry per sector and no code-shaped field", () => {
    expect(SECTORS).toHaveLength(SECTOR_COUNT);
    for (const s of SECTORS) {
      const keys = Object.keys(s);
      // If a code ever gets added here it reaches the browser: sectors.ts is
      // imported by the reveal screen, variants.ts is server-only.
      expect(keys).not.toContain("accessCode");
      expect(keys).not.toContain("code");
      expect(JSON.stringify(s)).not.toMatch(/-\d{2,}$/);
    }
  });
});

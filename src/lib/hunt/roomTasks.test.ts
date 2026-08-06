import { describe, expect, it } from "vitest";
import { CODES } from "./codes";
import {
  ROOM_SECTIONS,
  fragmentsOf,
  matchSection,
  normaliseCode,
  sectionFragments,
} from "./roomTasks";

describe("normaliseCode", () => {
  it("upper-cases", () => {
    expect(normaliseCode("lantern")).toBe("LANTERN");
  });

  it("drops the whitespace a fast typist leaves behind", () => {
    expect(normaliseCode("  lantern \n")).toBe("LANTERN");
  });

  it("drops punctuation and separators", () => {
    expect(normaliseCode("web-line")).toBe("WEBLINE");
    expect(normaliseCode("ARCHIVES 88")).toBe("ARCHIVES88");
  });

  it("keeps digits, because the reveal code has some", () => {
    expect(normaliseCode("archives88")).toBe("ARCHIVES88");
  });

  it("reduces a string of pure noise to nothing", () => {
    expect(normaliseCode("   !!! ")).toBe("");
  });
});

describe("matchSection", () => {
  it("opens the section whose code was typed", () => {
    expect(matchSection("LANTERN")?.id).toBe("s1");
    expect(matchSection("GRIMOIRE")?.id).toBe("s2");
    expect(matchSection("WEBLINE")?.id).toBe("s3");
    expect(matchSection("ANTLERS")?.id).toBe("s4");
    expect(matchSection("INKSTAND")?.id).toBe("s5");
  });

  it("does not care about case or stray spacing", () => {
    expect(matchSection("  grimoire ")?.id).toBe("s2");
  });

  it("returns null for a wrong word", () => {
    expect(matchSection("TORCH")).toBeNull();
  });

  // An empty box submitted by a stray Enter must not be treated as a code, and
  // must certainly not match a section whose code normalises to nothing.
  it("returns null for an empty or punctuation-only entry", () => {
    expect(matchSection("")).toBeNull();
    expect(matchSection("   ")).toBeNull();
    expect(matchSection("---")).toBeNull();
  });

  // The room's own reveal code is not a section code. Typing the answer to the
  // whole room into a section console must not open a section.
  it("does not accept the room reveal code", () => {
    expect(matchSection(CODES.room)).toBeNull();
  });
});

describe("ROOM_SECTIONS", () => {
  it("has five sections, because the rail has five slots", () => {
    expect(ROOM_SECTIONS).toHaveLength(5);
  });

  it("gives every section a distinct id", () => {
    expect(new Set(ROOM_SECTIONS.map((s) => s.id)).size).toBe(ROOM_SECTIONS.length);
  });

  // Two sections sharing a code would make one of them unreachable: the first
  // match wins and the second could never be opened.
  it("gives every section a distinct code", () => {
    const codes = ROOM_SECTIONS.map((s) => normaliseCode(s.code));
    expect(new Set(codes).size).toBe(ROOM_SECTIONS.length);
  });

  it("uses codes that survive their own normalisation", () => {
    for (const s of ROOM_SECTIONS) {
      expect(normaliseCode(s.code)).toBe(s.code);
    }
  });

  it("gives every section something to show while it is locked", () => {
    for (const s of ROOM_SECTIONS) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.hints).toHaveLength(2);
      for (const hint of s.hints) expect(hint.length).toBeGreaterThan(0);
    }
  });

  // Two identical lines would be one clue wearing a rail slot twice, and the
  // whole point of the second is that it says a different kind of thing.
  it("gives every section two clues that differ", () => {
    for (const s of ROOM_SECTIONS) {
      expect(s.hints[0]).not.toBe(s.hints[1]);
    }
  });

  // A clue that contains its own answer is a spoiler with extra steps. This is
  // the check that catches a well-meaning edit to a hint years from now.
  it("never puts the answer in the clue", () => {
    for (const s of ROOM_SECTIONS) {
      for (const hint of s.hints) {
        expect(normaliseCode(hint)).not.toContain(normaliseCode(s.code));
      }
    }
  });
});

describe("fragmentsOf", () => {
  it("splits into equal pieces in order", () => {
    expect(fragmentsOf("ARCHIVES88", 5)).toEqual(["AR", "CH", "IV", "ES", "88"]);
  });

  it("refuses a split that would not be even", () => {
    expect(() => fragmentsOf("ABCDE", 2)).toThrow(/does not split evenly/);
  });

  it("refuses a non-positive count rather than dividing by zero", () => {
    expect(() => fragmentsOf("ABCD", 0)).toThrow(/Cannot split/);
  });
});

describe("sectionFragments", () => {
  it("gives one fragment per section", () => {
    expect(sectionFragments()).toHaveLength(ROOM_SECTIONS.length);
  });

  // The lockstep invariant: the rail is only worth reading if the five
  // fragments, in rail order, are the reveal code.
  it("reassembles the reveal code in rail order", () => {
    expect(sectionFragments().join("")).toBe(CODES.room);
  });
});

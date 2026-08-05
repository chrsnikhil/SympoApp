import { describe, expect, it } from "vitest";
import { applyShiftToLetter, caesarDecrypt, caesarEncrypt } from "./cipher";

describe("caesarEncrypt", () => {
  it("shifts uppercase letters and wraps past Z", () => {
    expect(caesarEncrypt("ABCXYZ", 3)).toBe("DEFABC");
  });

  it("leaves non-letters untouched", () => {
    expect(caesarEncrypt("A-B 1", 1)).toBe("B-C 1");
  });

  it("normalises shifts outside 0..25", () => {
    expect(caesarEncrypt("A", 27)).toBe(caesarEncrypt("A", 1));
    expect(caesarEncrypt("A", -1)).toBe("Z");
  });

  it("uppercases its input", () => {
    expect(caesarEncrypt("abc", 1)).toBe("BCD");
  });
});

describe("caesarDecrypt", () => {
  it("round-trips every shift for a real puzzle word", () => {
    for (let shift = 0; shift < 26; shift++) {
      expect(caesarDecrypt(caesarEncrypt("MILESMORALES", shift), shift)).toBe("MILESMORALES");
    }
  });
});

describe("applyShiftToLetter", () => {
  it("is the decrypt direction — undoes caesarEncrypt for the same shift", () => {
    for (let shift = 0; shift < 26; shift++) {
      expect(applyShiftToLetter(caesarEncrypt("Q", shift), shift)).toBe("Q");
    }
  });

  it("agrees with caesarDecrypt on a single letter", () => {
    for (let shift = 0; shift < 26; shift++) {
      expect(applyShiftToLetter("Q", shift)).toBe(caesarDecrypt("Q", shift));
    }
  });
});

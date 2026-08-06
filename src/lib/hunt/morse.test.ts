import { describe, expect, it } from "vitest";
import { isOnAt, toMorse, toSpans, totalUnits, UNITS } from "./morse";

/** What the desk lamp in the Mystery Room blinks. */
const LAMP_MESSAGE = "Welcome to LICET";

describe("toMorse", () => {
  it("encodes single letters", () => {
    expect(toMorse("E")).toBe(".");
    expect(toMorse("T")).toBe("-");
  });

  it("separates letters with a space and words with a slash", () => {
    expect(toMorse("SOS")).toBe("... --- ...");
    expect(toMorse("SO S")).toBe("... --- / ...");
  });

  it("is case insensitive", () => {
    expect(toMorse("sos")).toBe(toMorse("SOS"));
  });

  it("drops characters it cannot encode rather than emitting a gap", () => {
    // A silent gap would read as a letter break and corrupt the message
    // around it, so "H!I" must be "H I", never "H  I".
    expect(toMorse("H!I")).toBe(".... ..");
    expect(toMorse("!!!")).toBe("");
  });

  it("encodes the lamp message", () => {
    expect(toMorse(LAMP_MESSAGE)).toBe(".-- . .-.. -.-. --- -- . / - --- / .-.. .. -.-. . -");
  });
});

describe("toSpans", () => {
  it("uses standard Morse proportions", () => {
    // "E" is one dot, then the trailing word gap that separates repeats.
    expect(toSpans("E")).toEqual([
      { on: true, units: UNITS.dot },
      { on: false, units: UNITS.wordGap },
    ]);
  });

  it("puts a one-unit gap between symbols and three between letters", () => {
    // "AT" is ".- -": dot, gap, dash | letter gap | dash | word gap.
    expect(toSpans("AT")).toEqual([
      { on: true, units: 1 },
      { on: false, units: 1 },
      { on: true, units: 3 },
      { on: false, units: 3 },
      { on: true, units: 3 },
      { on: false, units: 7 },
    ]);
  });

  it("puts a seven-unit gap between words", () => {
    const spans = toSpans("E E");
    expect(spans).toEqual([
      { on: true, units: 1 },
      { on: false, units: 7 },
      { on: true, units: 1 },
      { on: false, units: 7 },
    ]);
  });

  it("always ends dark, so a looping message has an audible start", () => {
    const spans = toSpans(LAMP_MESSAGE);
    expect(spans.at(-1)).toEqual({ on: false, units: UNITS.wordGap });
  });

  it("never emits two spans of the same state in a row", () => {
    // Adjacent same-state spans would merge into one longer blink and change
    // what the message says — a dot plus a dot is a dash to anyone watching.
    const spans = toSpans(LAMP_MESSAGE);
    for (let i = 1; i < spans.length; i += 1) {
      expect(spans[i].on).not.toBe(spans[i - 1].on);
    }
  });

  it("produces nothing for an unencodable message", () => {
    expect(toSpans("")).toEqual([]);
    expect(totalUnits(toSpans(""))).toBe(0);
  });
});

describe("isOnAt", () => {
  const spans = toSpans("AT"); // 1 on, 1 off, 3 on, 3 off, 3 on, 7 off = 18 units

  it("reads the state at a moment in the loop", () => {
    expect(totalUnits(spans)).toBe(18);
    expect(isOnAt(spans, 0)).toBe(true); // dot
    expect(isOnAt(spans, 1.5)).toBe(false); // symbol gap
    expect(isOnAt(spans, 3)).toBe(true); // dash
    expect(isOnAt(spans, 6)).toBe(false); // letter gap
    expect(isOnAt(spans, 9)).toBe(true); // T
    expect(isOnAt(spans, 15)).toBe(false); // word gap
  });

  it("wraps, so the caller can pass a clock that only ever increases", () => {
    expect(isOnAt(spans, 18)).toBe(isOnAt(spans, 0));
    expect(isOnAt(spans, 18 * 7 + 3)).toBe(isOnAt(spans, 3));
  });

  it("handles a rewound clock", () => {
    expect(isOnAt(spans, -18)).toBe(isOnAt(spans, 0));
    expect(isOnAt(spans, -15)).toBe(isOnAt(spans, 3));
  });

  it("is dark when there is no message", () => {
    expect(isOnAt([], 4)).toBe(false);
  });
});

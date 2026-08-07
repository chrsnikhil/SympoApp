import { describe, expect, it } from "vitest";
import { safeRedirectTarget } from "./safeRedirect";

const ORIGIN = "https://ctf.example.com";
const FALLBACK = "/ctf";

describe("safeRedirectTarget", () => {
  it("ignores a foreign absolute URL and falls back", () => {
    expect(safeRedirectTarget("https://example.com/x", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("follows an absolute same-origin URL", () => {
    expect(safeRedirectTarget("http://localhost:3000/quiz", "http://localhost:3000", FALLBACK)).toBe("/quiz");
  });

  it("follows a relative same-origin path", () => {
    expect(safeRedirectTarget("/hunt", ORIGIN, FALLBACK)).toBe("/hunt");
  });

  it("refuses /admin even though it is same-origin", () => {
    expect(safeRedirectTarget("/admin/quiz", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("ignores a protocol-relative URL pointing off-site", () => {
    expect(safeRedirectTarget("//evil.example/x", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("ignores a javascript: scheme", () => {
    expect(safeRedirectTarget("javascript:alert(1)", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back on an empty string", () => {
    expect(safeRedirectTarget("", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("falls back on null", () => {
    expect(safeRedirectTarget(null, ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("preserves the query string on a same-origin redirect", () => {
    expect(safeRedirectTarget("/hunt?clue=3&x=1", ORIGIN, FALLBACK)).toBe("/hunt?clue=3&x=1");
  });

  it("falls back on an unparseable rt", () => {
    expect(safeRedirectTarget("http://[::1", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  // The redirect loop the hand-written checks used to prevent. Without the
  // /enter refusal this target re-enters the same branch on arrival and
  // assigns location.href again, forever.
  it("refuses /enter, which would send the login page back to itself", () => {
    expect(safeRedirectTarget("/enter", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("refuses a self-perpetuating /enter target carrying its own rt", () => {
    expect(safeRedirectTarget("/enter?rt=/enter", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("refuses a percent-encoded /enter", () => {
    expect(safeRedirectTarget("/%65nter", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });

  it("still allows a path that merely starts with the same letters", () => {
    expect(safeRedirectTarget("/entertainment", ORIGIN, FALLBACK)).toBe("/entertainment");
  });

  // The admin guard stays a bare prefix on purpose - narrowing it to segment
  // matching to mirror /enter would start admitting /admin-console.
  it("refuses /admin-console, not just the /admin segment", () => {
    expect(safeRedirectTarget("/admin-console", ORIGIN, FALLBACK)).toBe(FALLBACK);
  });
});

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
});

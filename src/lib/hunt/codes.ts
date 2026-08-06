/**
 * The four reveal codes.
 *
 * Client-safe by design, not by oversight — see spec §2.1. A puzzle needs its
 * code to know when it has been solved, and the anti-cheat model is that the
 * team still has to type it while a coordinator watches.
 *
 * These are hashed by the seed into answerHash; the plaintext never enters a
 * challenge document, so this file is the only copy that ships.
 */
export const CODES = {
  cipher: "WEBSLING",
  grid: "DAYBUGLE",
  circuit: "ARCLIGHT",
  room: "ARCHIVES88",
} as const;

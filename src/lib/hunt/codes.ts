/**
 * The four reveal codes.
 *
 * Client-safe by design, not by oversight — see spec §2.1. A puzzle needs its
 * code to know when it has been solved, and the anti-cheat model is that the
 * team still has to type it while a coordinator watches.
 *
 * These are hashed by the seed into answerHash; the plaintext never enters a
 * challenge document, so this file is the only copy that ships.
 *
 * ONE CODE PER PUZZLE, NOT THE OBJECT. Each code is exported as its own
 * binding, and a puzzle imports only its own.
 *
 * That is the difference between shipping one answer and shipping four. A
 * bundler cannot drop unused properties of an object that is read by member
 * expression, so `import { CODES }` for `CODES.room` put WEBSLING, DAYBUGLE and
 * ARCLIGHT into the chunk alongside it — three answers to puzzles the team has
 * not reached, one devtools search away. Separate `const` bindings are dropped
 * when unused, so the room's chunk now carries ARCHIVES88 and nothing else.
 *
 * `CODES` is kept for server-side callers (the seed hashes all four), and the
 * eslint rule in eslint.config.mjs bans it from `src/app/hunt/puzzles/**` so a
 * client component cannot reach for it again.
 */
export const CIPHER_CODE = "WEBSLING";
export const GRID_CODE = "DAYBUGLE";
export const CIRCUIT_CODE = "ARCLIGHT";
export const ROOM_CODE = "ARCHIVES88";

export const CODES = {
  cipher: CIPHER_CODE,
  grid: GRID_CODE,
  circuit: CIRCUIT_CODE,
  room: ROOM_CODE,
} as const;

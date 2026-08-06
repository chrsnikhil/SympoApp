import { CODES } from "./codes";

/**
 * The five locked sections of the Mystery Room, and the codes that open them.
 *
 * THE SHAPE OF THE ROOM. The player walks an antique room looking for clues.
 * Each clue, when solved, spells a word out *in the room* — on paper, on a
 * page, in a web, in a beam of light. The player reads that word and types it
 * into the console under the viewport. A correct word unlocks the matching
 * section in the task rail, and the section then shows its share of the reveal
 * code. Five sections open, and the room hands `CODES.room` to the shell.
 *
 * Sections are opened BY THE CODE, not in order. A team that stumbles on the
 * stags before they ever find the torch can type ANTLERS and open section 4
 * first; nothing gates anything else. That is deliberate — five people crowded
 * round one laptop will not search in the order the author imagined, and a
 * puzzle that insists on an order mostly produces a queue.
 *
 * WHY THE CODES ARE IN THE BUNDLE. For the same reason `CODES.room` is (see
 * codes.ts and spec 2.1): the anti-cheat model is a team typing an answer while
 * a coordinator watches, not hiding strings from a browser that has to render
 * them. Every one of these words is drawn somewhere in the 3D scene, so it is
 * in the bundle whatever this file does. What makes the room worth playing is
 * the work of finding them.
 */
export type SectionId = "s1" | "s2" | "s3" | "s4" | "s5";

export interface RoomSection {
  id: SectionId;
  /** Shown in the task rail, locked or not. Names the place, not the answer. */
  title: string;
  /**
   * Two clues, in the order they should be read.
   *
   * WHY TWO, AND WHY THEY ARE DIFFERENT KINDS OF CLUE. One line per task was a
   * signpost and nothing more: it told a team which corner of the room to walk
   * to and then abandoned them there. The clue that actually unsticks people is
   * never "where" — it is "what you are looking at is not doing what you think".
   *
   *   [0] WHERE. Names the place. Enough to walk to, useless for solving.
   *   [1] HOW. The one property of the thing that a player will not work out by
   *       clicking harder — that the ink needs a colour of light, that the book
   *       is upside down, that the rack has a spec card, that one stag over is
   *       nothing, that the four faces have an order.
   *
   * Never the answer itself, and never the sequence of clicks. The second clue
   * removes the guessing, not the doing. It matters most on the fluid bench,
   * where a wrong guess destroys a cartridge for good and there is now no visual
   * tell at all — that task is unfair without its second clue and fair with it.
   */
  hints: readonly [string, string];
  /** The word the clue spells out in the room. Typing it opens this section. */
  code: string;
}

export const ROOM_SECTIONS: RoomSection[] = [
  {
    id: "s1",
    title: "The case board",
    hints: [
      "The pinboard on the right-hand wall is buried in paperwork. One sheet is not like the others.",
      "Lamplight lands on it and develops nothing. Some inks only answer to a colour of light you have to build yourself.",
    ],
    code: "LANTERN",
  },
  {
    id: "s2",
    title: "The reading cupboards",
    hints: [
      "Every book on that wall comes off the shelf. Twenty-nine of them are the wrong one.",
      "Whoever hid it put it back in a hurry, and put it back the wrong way up.",
    ],
    code: "GRIMOIRE",
  },
  {
    id: "s3",
    title: "The fluid bench",
    hints: [
      "A wrist shooter and a rack of cartridges, on the wall behind where you came in. Only one batch is still live.",
      "Do not guess — a wrong cartridge is destroyed for good. There is a spec card pinned to the pegboard, and it names the batch and the tint.",
    ],
    code: "WEBLINE",
  },
  {
    id: "s4",
    title: "The two stags",
    hints: [
      "Two heads mounted on opposite walls, staring each other down. Both of them turn.",
      "Their eyes are projectors, and one stag over is worth nothing. Turn them both all the way over.",
    ],
    code: "ANTLERS",
  },
  {
    id: "s5",
    title: "The case items",
    hints: [
      "Four loose things out of one case, dropped in four different corners of the room.",
      "Each is stamped with two letters. They only read as a word in the order the case listed them, not the order you found them.",
    ],
    code: "INKSTAND",
  },
];

/**
 * Strip a typed answer down to comparable letters.
 *
 * Players type into a console on a projector, in a hall, under time pressure.
 * Case, spaces, hyphens and the stray trailing character a fast typist leaves
 * behind are all noise; rejecting "lantern " as wrong would be a bug wearing a
 * puzzle's clothes. Anything that is not a letter or a digit goes.
 */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** The section a typed answer opens, or null if it opens nothing. */
export function matchSection(input: string): RoomSection | null {
  const wanted = normaliseCode(input);
  if (wanted.length === 0) return null;
  return ROOM_SECTIONS.find((s) => normaliseCode(s.code) === wanted) ?? null;
}

/**
 * Split the reveal code into one equal fragment per section.
 *
 * These are NOT read from the server. `/api/hunt/progress` used to ship a
 * `clues` array straight out of the seeded config — `["AR","CH","IV","ES","88"]`
 * — so every client received the whole reveal code, pre-assembled, on page
 * load, before the room was ever opened: `.join("")` was the answer. The leak
 * check in scripts/verify-hunt.ts missed it because it substring-matched the
 * whole code against the served JSON, and the code was fragmented into
 * two-character pieces that never appear as a contiguous match.
 *
 * So this derives the on-face text FROM the already-public constant, in the
 * browser. Nothing about the fragments ever passes through a network response.
 */
export function fragmentsOf(code: string, count: number): string[] {
  if (count <= 0) throw new Error(`Cannot split "${code}" into ${count} fragments`);
  if (code.length % count !== 0) {
    throw new Error(`Reveal code "${code}" does not split evenly into ${count} fragments`);
  }
  const len = code.length / count;
  return Array.from({ length: count }, (_, i) => code.slice(i * len, (i + 1) * len));
}

/** The fragment each section shows once it is open, in rail order. */
export function sectionFragments(): string[] {
  return fragmentsOf(CODES.room, ROOM_SECTIONS.length);
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { ROOM_MANIFEST } from "@/lib/hunt/manifest";
import { CODES } from "@/lib/hunt/codes";
import {
  ROOM_SECTIONS,
  fragmentsOf,
  matchSection,
  sectionFragments,
  type SectionId,
} from "@/lib/hunt/roomTasks";
import Player, { isTypingTarget, type PlayerState } from "./MysteryRoomPlayer";
import Prop from "./MysteryRoomProp";
import RoomScene from "./MysteryRoomScene";
import Board from "./MysteryRoomBoard";
import Books from "./MysteryRoomBooks";
import Deer from "./MysteryRoomDeer";
import Drawers from "./MysteryRoomDrawers";
import WebBench from "./MysteryRoomWebBench";
import RoomBoundary from "./MysteryRoomBoundary";
import { FilmPickup, HeldTorch, HiddenBook, TorchPickup, WallClock } from "./MysteryRoomTools";
import { SpiderLoadingScreen } from "./SpiderLoadingScreen";
import type { PuzzleProps } from "../registry";

/**
 * The Mystery Room.
 *
 * An antique room with five clues hidden in it, a rail of five locked sections
 * down the right-hand side, and a console along the bottom. Every clue, once
 * solved, spells a word out *in the room* — developed on paper, printed on a
 * page, written in a web, thrown on the floor in light. The player reads that
 * word, types it into the console, and the matching section opens and shows
 * its share of the reveal code. All five open, and the room hands
 * `CODES.room` up to the shell.
 *
 * TWO KINDS OF STATE, and the difference matters:
 *
 *   `read`   — the clue has been solved in the world. This is what keeps a
 *              revealed thing revealed: the board stays developed, the book
 *              re-opens straight to its page, the web stays across the bench,
 *              the stags stay lit. It never unlocks anything by itself.
 *   `opened` — the word has been typed into the console. This, and only this,
 *              is what opens a section and what decides whether the room is
 *              solved.
 *
 * Keeping them apart is what makes the console a real step rather than
 * decoration. It also means a team can solve the clues in any order, walk away,
 * and come back to type — and that a coordinator watching the screen can see
 * the difference between "they found it" and "they entered it".
 *
 * Sections are not gated on each other. Five people round one laptop do not
 * search in the order an author imagined, and a puzzle that insists on an order
 * mostly produces a queue.
 */

/** How long a line of feedback stays under the viewport. */
const NOTE_MS = 5200;
/** How long the console stays red after a wrong entry. */
const REJECT_MS = 1800;

export default function MysteryRoom({ onAnswer, onSolve }: PuzzleProps) {
  const fragments = useMemo(() => sectionFragments(), []);
  /** The two letters carried on the face of each loose case item. */
  const itemLetters = useMemo(
    () => fragmentsOf(ROOM_SECTIONS[4].code, ROOM_MANIFEST.length),
    []
  );

  /** Clues solved in the world. */
  const [read, setRead] = useState<SectionId[]>([]);
  /** Sections opened by typing the word into the console. */
  const [opened, setOpened] = useState<SectionId[]>([]);
  /** Loose case items collected. Four of them make up section 5's clue. */
  const [collected, setCollected] = useState<string[]>([]);
  const [held, setHeld] = useState<string | null>(null);

  // Tools. Neither is a task — they are what makes the case board readable.
  // Each is inside a container that has to be opened first, so the two
  // `*Open` flags gate whether the pickup exists in the scene at all rather
  // than merely hiding it: a pickup that is only invisible is still there to
  // be clicked through.
  const [clockOpen, setClockOpen] = useState(false);
  const [torchTaken, setTorchTaken] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [bookOpen, setBookOpen] = useState(false);
  const [filmTaken, setFilmTaken] = useState(false);
  const [filmOn, setFilmOn] = useState(false);

  const [note, setNote] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);
  /** A book is being held open in front of the player. The room dims behind it. */
  const [reading, setReading] = useState(false);
  /** Mouse-look is engaged: the cursor is captured and hidden. See Player. */
  const [locked, setLocked] = useState(false);
  /** The completion card has been closed. It can be brought back from the rail. */
  const [dismissed, setDismissed] = useState(false);

  // Shared between Player and every clickable — see Player's doc comment.
  const dragRef = useRef<PlayerState>({ moved: false });

  const complete = opened.length === ROOM_SECTIONS.length;

  useEffect(() => {
    if (complete) {
      onSolve?.(CODES.room);
      onAnswer?.(CODES.room);
    }
  }, [complete, onSolve, onAnswer]);

  /** Transient line of text under the viewport. Every interaction says something. */
  const say = useCallback((text: string) => setNote(text), []);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), NOTE_MS);
    return () => clearTimeout(t);
  }, [note]);

  useEffect(() => {
    if (!rejected) return;
    const t = setTimeout(() => setRejected(false), REJECT_MS);
    return () => clearTimeout(t);
  }, [rejected]);

  const markRead = useCallback((id: SectionId) => {
    setRead((r) => (r.includes(id) ? r : [...r, id]));
  }, []);

  /**
   * One stable callback per clue.
   *
   * These are handed to components that use them as effect dependencies. Passed
   * as inline arrows they would be a fresh function on every render of this
   * component, which re-runs those effects on every render — and an effect that
   * reports "solved" re-running on every render sets the feedback line back to
   * its own message every time anything at all in the room changes.
   */
  const foundBoard = useCallback(() => {
    markRead("s1");
    say(`The ink develops under the blue beam: ${ROOM_SECTIONS[0].code}.`);
  }, [markRead, say]);

  const foundBooks = useCallback(() => {
    markRead("s2");
    say(`The pages settle on one word: ${ROOM_SECTIONS[1].code}.`);
  }, [markRead, say]);

  const foundBench = useCallback(() => {
    markRead("s3");
    say(`The shooter throws a web across the bench, with a word in it: ${ROOM_SECTIONS[2].code}.`);
  }, [markRead, say]);

  const foundDeer = useCallback(() => {
    markRead("s4");
    say(`The beams cross on the boards and spell it out: ${ROOM_SECTIONS[3].code}.`);
  }, [markRead, say]);

  /**
   * A word typed into the console.
   *
   * Deliberately not gated on `read`. A team that works out the answer without
   * doing the mechanic has still worked out the answer, and refusing it would
   * mean explaining to somebody, out loud, in a hall, that they are right but
   * the room wants them to be right differently.
   */
  const submit = useCallback(
    (entry: string) => {
      const section = matchSection(entry);
      if (!section) {
        setRejected(true);
        say("Nothing in this room answers to that.");
        return false;
      }
      if (opened.includes(section.id)) {
        say(`${section.title} is already open.`);
        return true;
      }
      const index = ROOM_SECTIONS.findIndex((s) => s.id === section.id);
      setOpened((o) => [...o, section.id]);
      say(`${section.title} unlocked. It was holding ${fragments[index]}.`);
      return true;
    },
    [opened, fragments, say]
  );

  const toggleTorch = useCallback(() => {
    if (!torchTaken) return;
    setTorchOn((on) => {
      say(on ? "Torch off." : "Torch on.");
      return !on;
    });
  }, [torchTaken, say]);

  const attachFilm = useCallback(() => {
    if (!filmTaken || filmOn) return;
    setFilmOn(true);
    say("Blue gel clipped over the lens. The beam turns blue.");
  }, [filmTaken, filmOn, say]);

  // Keyboard equivalents for the two torch actions. The button on the model
  // is 3cm across and held at the edge of the view; on a trackpad, in a hall,
  // a key is the difference between playable and fiddly. Both are suppressed
  // while the console has focus, or typing a code would strobe the torch.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const k = e.key.toLowerCase();
      if (k === "f") toggleTorch();
      if (k === "g") attachFilm();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTorch, attachFilm]);

  /**
   * Picking up a loose case item. Four of them, and the fourth completes the
   * clue.
   *
   * The messages are worked out here rather than inside the state updater: a
   * setState updater runs during React's render pass, and calling another
   * setter from in there is an error — React is free to run the updater more
   * than once, and every call would fire again.
   */
  const collect = useCallback(
    (id: string) => {
      setHeld((h) => (h === id ? null : id));
      if (collected.includes(id)) return;

      const count = collected.length + 1;
      setCollected([...collected, id]);
      if (count === ROOM_MANIFEST.length) {
        markRead("s5");
        say("All four. Laid out in order, the letters stamped on their faces spell a word.");
      } else {
        say(`Case item recovered — ${count} of ${ROOM_MANIFEST.length}. Something is stamped on the face.`);
      }
    },
    [collected, markRead, say]
  );

  const itemsDone = collected.length === ROOM_MANIFEST.length;
  const [loading, setLoading] = useState(true);

  if (loading) {
    return <SpiderLoadingScreen onComplete={() => setLoading(false)} durationSeconds={8} />;
  }

  return (
    <div
      className={`relative h-screen w-screen overflow-hidden bg-[#06040d] ${
        locked ? "cursor-none" : ""
      }`}
    >
      <RoomBoundary>
          {/* WHY THIS CANVAS IS CONFIGURED AND NOT LEFT ON DEFAULTS.
              Making the viewport bigger multiplied the cost of every pixel
              decision that had been getting away with it at 640px, and the room
              went from smooth to visibly laggy. Three defaults were doing the
              damage, and all three are wrong for this scene specifically:

              `dpr` defaults to the display's own pixel ratio. On a 2x laptop
              panel that is four times the fragment work for a scene whose art
              is flat-shaded primitives with a halftone screen printed over the
              top — there is no detail in it that survives to reward the extra
              pixels. Capped at 1.5, which still looks sharp on a projector and
              is the single biggest win available here.

              `antialias` defaults to on. MSAA over a canvas this size is not
              cheap, and the halftone overlay is already dithering every edge in
              the room; the aliasing it would fix is not visible through it.

              `powerPreference` defaults to letting the browser choose, which on
              a laptop with switchable graphics means the integrated GPU. This
              is the one thing on the page and it should get the real one. */}
          <Canvas
            shadows
            dpr={[1, 1.5]}
            gl={{ antialias: false, powerPreference: "high-performance" }}
            camera={{ fov: 55, position: [0, 1.62, 3.2] }}
          >
            <color attach="background" args={["#06040d"]} />
            <fogExp2 attach="fog" args={["#150e22", 0.021]} />

            <FreezeShadows />
            <Player dragRef={dragRef} onLockChange={setLocked} />
            <RoomScene />
            <Drawers dragRef={dragRef} onNote={say} />

            {/* Tools, both hidden together behind the wall clock */}
            <WallClock
              open={clockOpen}
              dragRef={dragRef}
              onOpen={() => {
                setClockOpen(true);
                say("The clock swings aside. The torch and the blue gel filter are sitting together in the recess.");
              }}
            />
            {clockOpen && !torchTaken && (
              <TorchPickup
                dragRef={dragRef}
                onPick={() => {
                  setTorchTaken(true);
                  say("Picked up a torch. Click its red button, or press F, to switch it on.");
                }}
              />
            )}
            {clockOpen && !filmTaken && (
              <FilmPickup
                dragRef={dragRef}
                onPick={() => {
                  setFilmTaken(true);
                  say("Picked up a blue gel filter. Click the torch head, or press G, to clip it on.");
                }}
              />
            )}
            {torchTaken && (
              <HeldTorch
                on={torchOn}
                film={filmOn}
                hasFilm={filmTaken}
                dragRef={dragRef}
                onToggle={toggleTorch}
                onAttachFilm={attachFilm}
              />
            )}

            {/* Section 1 — the case board */}
            <Board
              phrase={ROOM_SECTIONS[0].code}
              torchOn={torchOn}
              filmOn={filmOn}
              solved={read.includes("s1")}
              onReveal={foundBoard}
            />

            {/* Section 2 — the reading cupboards */}
            <Books
              dragRef={dragRef}
              found={read.includes("s2")}
              onNote={say}
              onFound={foundBooks}
              onReading={setReading}
            />

            {/* Section 3 — the fluid bench */}
            <WebBench dragRef={dragRef} found={read.includes("s3")} onNote={say} onFound={foundBench} />

            {/* Section 4 — the two stags */}
            <Deer dragRef={dragRef} found={read.includes("s4")} onNote={say} onFound={foundDeer} />

            {/* Section 5 — the four loose case items */}
            {ROOM_MANIFEST.map((slot, i) => (
              <Prop
                key={slot.id}
                slot={slot}
                clue={itemLetters[i] ?? "?"}
                held={held === slot.id}
                found={collected.includes(slot.id)}
                onPick={() => collect(slot.id)}
                dragRef={dragRef}
              />
            ))}
          </Canvas>
        </RoomBoundary>

        <Hud
          fragments={fragments}
          opened={opened}
          read={read}
          torchTaken={torchTaken}
          torchOn={torchOn}
          filmTaken={filmTaken}
          filmOn={filmOn}
          itemLetters={itemsDone ? itemLetters : null}
          note={note}
          rejected={rejected}
          reading={reading}
          locked={locked}
          onSubmit={submit}
        />

        {complete && !dismissed && (
          <Completion fragments={fragments} onClose={() => setDismissed(true)} />
        )}
        {complete && dismissed && (
          <button
            type="button"
            onClick={() => setDismissed(false)}
            className="absolute left-4 top-14 z-20 rounded border border-[#ff2d95]/70 bg-[#2a0a1c]/95 px-3 py-1.5 font-mono text-[0.62rem] tracking-widest text-[#ff9dcb] transition-colors hover:bg-[#43102c]"
          >
            ROOM SOLVED · SHOW CODE
          </button>
        )}
    </div>
  );
}

/**
 * The card that comes up when the fifth section opens.
 *
 * The room used to end without saying so. The last fragment appeared in the
 * rail, the code went up to the shell, and that was it — no moment, no
 * confirmation, nothing to point at. In a hall, with five people round one
 * laptop, that is the difference between a team knowing they have finished and
 * a team asking whether they have finished.
 *
 * It is dismissible and it can be brought back, because the first thing anyone
 * does with a card covering the room is close it, and the second thing is want
 * the code again.
 *
 * `onClose` is what closes it and nothing else: no timer. A congratulation that
 * disappears on its own is a congratulation somebody missed while they were
 * turning round to tell the rest of their team.
 */
function Completion({ fragments, onClose }: { fragments: string[]; onClose: () => void }) {
  const code = fragments.join("");
  return (
    // A full-screen `backdrop-blur` here was the single most expensive thing on
    // the page: it blurs the entire live canvas, and the canvas keeps redrawing
    // underneath it, so the blur is recomputed every frame for as long as the
    // card is up. Exactly the moment the room should feel like a reward. A
    // heavier flat wash reads the same and costs one fill.
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[#06040d]/92 p-6">
      <div className="relative w-full max-w-lg overflow-hidden rounded-xl border-2 border-[#ff2d95] bg-[#120a1e] p-7 text-center shadow-[0_0_60px_rgba(255,45,149,0.35)]">
        {/* Halftone wash and a cyan corner flare, so the card belongs to the
            room it is sitting on top of rather than to the browser. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.14) 1px, transparent 1.2px)",
            backgroundSize: "5px 5px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 12% 0%, rgba(34,224,255,0.32) 0%, transparent 48%), radial-gradient(circle at 92% 100%, rgba(255,45,149,0.3) 0%, transparent 46%)",
          }}
        />

        <div className="relative">
          <p className="font-mono text-[0.62rem] tracking-[0.4em] text-[#22e0ff]">ALL FIVE SECTIONS OPEN</p>
          <h2 className="display-title mt-2 text-3xl text-paper-white">The room is yours</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-paper-white/65">
            Every clue read, every word entered. The sections hand up their fragments in order.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            {fragments.map((fragment, i) => (
              <span
                key={`${fragment}-${i}`}
                className="rounded border border-[#22e0ff]/60 bg-[#062431]/80 px-3 py-2 font-mono text-lg tracking-[0.25em] text-[#bfefff]"
              >
                {fragment}
              </span>
            ))}
          </div>

          <p className="mt-5 font-mono text-[0.62rem] tracking-[0.35em] text-paper-white/45">REVEAL CODE</p>
          <p className="mt-1 font-mono text-4xl tracking-[0.3em] text-[#ff2d95]">{code}</p>

          {/* NO `autoFocus` ON THIS BUTTON, and that is not a style preference.
              The last thing a player does before this card exists is type the
              fifth word into the console and press Enter. Focusing the dismiss
              button the instant the card mounts puts that button under the very
              keystroke that opened it — so the card appeared and closed inside
              one frame, and what the room actually showed was the "ROOM SOLVED"
              badge, as if the celebration had been skipped. Which it had.

              It cost the harness two checks and would have cost a team in a
              hall the only moment the room has. Nothing here is focused now;
              the card is closed by clicking it, deliberately. */}
          <button
            type="button"
            onClick={onClose}
            className="mt-6 rounded border border-[#ff2d95]/70 bg-[#2a0a1c] px-5 py-2 font-mono text-xs tracking-[0.25em] text-[#ff9dcb] transition-colors hover:bg-[#43102c]"
          >
            BACK TO THE ROOM
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the shadow map a few times, then stops.
 *
 * WHAT THIS BUYS. Shadows are a second render of every shadow-casting object in
 * the room, from the light's point of view, and measurement put that at 418 of
 * the room's 1221 draw calls per frame — a third of all the work, repeated
 * sixty times a second to produce an image that is identical every time. The
 * room is a room: the walls, the desk, the cabinets, the crates and the shelves
 * do not move, and the one light that casts shadows is bolted to the ceiling.
 *
 * WHAT IT COSTS, STATED PLAINLY. Things that move after the freeze keep the
 * shadow they had when it happened — an opened drawer casts its closed shadow.
 * That is a real artefact and the reason to know about it. It survives here
 * because of what this particular room looks like: one soft ceiling spot at
 * high penumbra, over furniture, in a scene whose actual light comes from
 * coloured point lights that never cast at all. The moving things are small
 * (a drawer front, a book, a 5cm cartridge) and their shadows are diffuse
 * enough at that penumbra that there is nothing legible to go stale.
 *
 * The warm-up is frames rather than a timer because what has to be finished is
 * a render, not an interval — materials compile lazily on first sight, and a
 * shadow map frozen before the room has been drawn once is a blank one.
 */
function FreezeShadows({ frames = 8 }: { frames?: number }) {
  const drawn = useRef(0);

  // The renderer comes off the frame state rather than out of `useThree`. It is
  // the same object either way, but this hook mutates it, and a value returned
  // from a hook is not ours to mutate as far as the react-hooks lint rules are
  // concerned — correctly, in general. `state` is an argument.
  useFrame((state) => {
    if (drawn.current > frames) return;
    drawn.current += 1;
    if (drawn.current > frames) {
      state.gl.shadowMap.autoUpdate = false;
      // One last update, so what is frozen is the finished room and not
      // whatever the last warm-up frame happened to catch.
      state.gl.shadowMap.needsUpdate = true;
    }
  });

  return null;
}

interface HudProps {
  fragments: string[];
  opened: SectionId[];
  read: SectionId[];
  torchTaken: boolean;
  torchOn: boolean;
  filmTaken: boolean;
  filmOn: boolean;
  /** The four item faces, in order, once all four have been collected. */
  itemLetters: string[] | null;
  note: string | null;
  rejected: boolean;
  /** A book is open in front of the player. */
  reading: boolean;
  /** Mouse-look is engaged. */
  locked: boolean;
  onSubmit: (entry: string) => boolean;
}

/**
 * The 2D overlay: the task rail, the console, what is in hand, one line of
 * feedback.
 *
 * The wrapper takes no pointer events, so drags pass through it to the canvas
 * and looking around still works with the cursor anywhere on screen. Only the
 * console and the rail turn them back on, and only over themselves.
 *
 * Anything revealed in 3D is echoed here in plain DOM. The 3D text is drawn by
 * troika, which fetches its default font over the network — on a locked-down
 * event wifi that can fail silently, and a puzzle whose entire payoff is a line
 * of text must not have a single point of failure that renders nothing and says
 * nothing.
 */
function Hud({
  fragments,
  opened,
  read,
  torchTaken,
  torchOn,
  filmTaken,
  filmOn,
  itemLetters,
  note,
  rejected,
  reading,
  locked,
  onSubmit,
}: HudProps) {
  const [showClues, setShowClues] = useState(false);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col p-4">
      {/* THE SPIDER-VERSE PASS, done here and not in the scene.
          A halftone screen and a chromatic edge fringe are the two things that
          read instantly as comic-book print, and both are properties of the
          image rather than of the room — which means they belong on a DOM layer
          over the canvas, where they cost one composite, than in a post-
          processing chain, where they cost a full-screen pass per frame on
          whatever laptop is wired to the projector on the day.

          Both are kept weak on purpose. Turned up to where they read as an
          effect they also cover a stamped batch number and a word in a web,
          which are the things this room exists to make readable. */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1.15px)",
          backgroundSize: "4px 4px",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 76% 76% at 50% 50%, transparent 52%, rgba(34,224,255,0.12) 100%)",
        }}
      />
      {/* Everything but the open book goes dark.
          A vignette rather than a flat wash, because this overlay sits on top
          of the canvas and a flat one would dim the book along with the room.
          The hole is where the book is held, a little below centre. Done in the
          DOM rather than with a plane in the scene for the reason on
          `onReading` in MysteryRoomBooks. */}
      <div
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-300 ${
          reading ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(ellipse 36% 46% at 42% 54%, rgba(5,7,12,0) 0%, rgba(5,7,12,0.55) 62%, rgba(5,7,12,0.88) 100%)",
        }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowClues((prev) => !prev)}
          className={`pointer-events-auto flex items-center gap-2 rounded border px-3 py-1.5 font-mono text-xs tracking-widest transition-all cursor-pointer ${
            showClues
              ? "border-[#ff2d95] bg-[#ff2d95]/20 text-[#ff9dcb] shadow-[0_0_12px_rgba(255,45,149,0.4)]"
              : "border-[#22e0ff]/40 bg-black/80 text-[#bfefff] hover:border-[#22e0ff] hover:bg-[#062431]"
          }`}
          title={showClues ? "Hide Clues" : "Show Clues"}
        >
          <span className="text-sm">💡</span>
          <span>CLUES</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[0.65rem] font-bold ${
              opened.length === fragments.length
                ? "bg-[#22e0ff]/20 text-[#7fdcff]"
                : "bg-white/10 text-paper-white/80"
            }`}
          >
            {opened.length}/{fragments.length}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleFullscreen}
            className="pointer-events-auto flex items-center gap-1.5 rounded border border-[#22e0ff]/40 bg-black/80 px-2.5 py-1 font-mono text-[0.65rem] tracking-widest text-[#bfefff] transition-all hover:border-[#22e0ff] hover:bg-[#062431] cursor-pointer"
            title="Toggle Browser Fullscreen Mode"
          >
            <span>⛶</span>
            <span>FULLSCREEN</span>
          </button>
          <Chip active={locked} label={locked ? "MOUSE LOOK · CTRL TO RELEASE" : "CTRL · MOUSE LOOK"} />
          <Chip active={torchTaken} label={torchTaken ? (torchOn ? "TORCH · ON" : "TORCH · OFF") : "TORCH · ?"} />
          <Chip active={filmTaken} label={filmTaken ? (filmOn ? "GEL · FITTED" : "GEL · LOOSE") : "GEL · ?"} />
        </div>
      </div>

      {/* `items-stretch`, not `items-center`. Centred, the rail was sized to its
          content and then clipped by this row — so the first and last sections
          were cut in half and the two clues that matter most were the two you
          could not read. Stretched, it gets the full height between the chips
          and the console, which is what all five sections need. */}
      <div className="relative flex min-h-0 flex-1 items-stretch justify-between gap-3 overflow-hidden">
        <div className="flex flex-1 items-center justify-center">
          {/* Crosshair — with a walkable camera, a fixed centre point is what
              makes aiming the beam at a specific sheet of paper possible. It
              grows a ring under mouse-look, where it is the only thing on
              screen telling the player where the pointer has gone.
              `relative` so the centre dot below has something to be absolute
              against — without it, it resolves against the whole HUD. */}
          <div className="relative flex h-6 w-6 items-center justify-center">
            <div
              className={`rounded-full transition-all ${
                locked
                  ? "h-5 w-5 border border-[#22e0ff]/70 bg-[#22e0ff]/10"
                  : "h-1.5 w-1.5 bg-paper-white/45"
              }`}
            />
            {locked && <div className="absolute h-1 w-1 rounded-full bg-[#22e0ff]" />}
          </div>
        </div>

        {/* Slide-in TaskRail Clue Panel */}
        <div
          className={`pointer-events-auto transition-all duration-300 ease-in-out transform flex shrink-0 ${
            showClues
              ? "translate-x-0 opacity-100"
              : "translate-x-full opacity-0 pointer-events-none w-0 overflow-hidden"
          }`}
        >
          <TaskRail
            fragments={fragments}
            opened={opened}
            read={read}
            onClose={() => setShowClues(false)}
          />
        </div>
      </div>

      <div className="relative space-y-2">
        {itemLetters && (
          <p className="mx-auto w-fit rounded border border-[#c39b52] bg-[#2a1f10]/95 px-4 py-1.5 font-mono text-sm tracking-[0.35em] text-[#f0d9a8]">
            {itemLetters.join(" ")}
          </p>
        )}
        {note && (
          <p className="mx-auto w-fit max-w-[46rem] text-center rounded bg-black/85 px-3 py-1.5 text-sm text-paper-white/90">
            {note}
          </p>
        )}
        <CodeConsole rejected={rejected} onSubmit={onSubmit} />
      </div>
    </div>
  );
}

/**
 * The five sections, down the right-hand side.
 *
 * A locked section shows BOTH of its clues, so the rail doubles as the list of
 * what is left to look for — five padlocks with no text would tell a stuck team
 * nothing except that they are stuck. A section whose clue has been solved but
 * whose word has not been typed is marked, because the gap between those two is
 * exactly the thing a player is most likely to lose track of.
 *
 * WHY BOTH CLUES ARE SHOWN AT ONCE rather than the second being bought,
 * unlocked or timed. This is a preview room with no hint economy in it — that
 * lives in the shell (guide §6.2), which is the thing that knows about scores.
 * Building a second gate in here would either duplicate that or, worse, quietly
 * disagree with it. And a stuck team standing in a hall does not need a button
 * that admits they are stuck; they need the sentence. The clues are written so
 * that reading both still leaves all of the doing.
 */
function TaskRail({
  fragments,
  opened,
  read,
  onClose,
}: {
  fragments: string[];
  opened: SectionId[];
  read: SectionId[];
  onClose?: () => void;
}) {
  return (
    <div className="pointer-events-auto flex w-80 max-w-full shrink-0 flex-col justify-between rounded-lg border border-[#22e0ff]/30 bg-black/90 p-2.5 shadow-[0_0_20px_rgba(0,0,0,0.8)] backdrop-blur-md">
      <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-white/10 px-1">
        <span className="font-mono text-xs font-bold tracking-widest text-[#ff9dcb] flex items-center gap-1.5">
          <span>💡</span>
          <span>ROOM CLUES</span>
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded font-mono text-xs text-paper-white/60 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
            title="Hide clues"
          >
            ✕
          </button>
        )}
      </div>

      <ul className="flex flex-col justify-between gap-1 overflow-y-auto max-h-[calc(100vh-14rem)] pr-0.5">
        {ROOM_SECTIONS.map((section, i) => {
          const isOpen = opened.includes(section.id);
          const isRead = read.includes(section.id);
          return (
            <li
              key={section.id}
              className={`rounded border px-2.5 py-2 transition-colors ${
                isOpen
                  ? "border-[#22e0ff]/70 bg-[#062431]/80"
                  : isRead
                    ? "border-[#ff2d95]/60 bg-[#2a0a1c]/70"
                    : "border-white/10 bg-black/35"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={`font-mono text-[0.62rem] tracking-widest ${
                    isOpen ? "text-[#7fdcff]" : "text-paper-white/45"
                  }`}
                >
                  {String(i + 1).padStart(2, "0")} · {section.title.toUpperCase()}
                </span>
                <span className={`font-mono text-sm ${isOpen ? "text-[#bfefff]" : "text-paper-white/30"}`}>
                  {isOpen ? fragments[i] : "──"}
                </span>
              </div>

              {isOpen ? (
                <p className="mt-1 text-[0.68rem] leading-snug text-[#7fdcff]/80">Open.</p>
              ) : isRead ? (
                <p className="mt-1 text-[0.68rem] leading-snug text-[#ff9dcb]">
                  Solved. Type the word into the console.
                </p>
              ) : (
                // Both clues were being drawn at 55% white over a background that
                // is itself over a moving room. That is fine for a label and not
                // fine for the only text in the room a stuck team is going to
                // read — so the clues are now at 85%, and the numbers that index
                // them are a solid accent rather than a tinted one.
                <ol className="mt-1.5 space-y-1">
                  {section.hints.map((hint, h) => (
                    <li key={hint} className="flex gap-1.5">
                      <span className="mt-px shrink-0 font-mono text-[0.55rem] leading-[1.5] tracking-widest text-[#ff2d95]">
                        {h + 1}
                      </span>
                      <span className="text-[0.68rem] leading-[1.35] text-paper-white/85">{hint}</span>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The console along the bottom.
 *
 * A real text input, which is why every key handler in the room checks
 * `isTypingTarget` first: they all listen on `window`, and without that check
 * typing a word in here would also walk the player across the room and flash
 * the torch on and off while they did it.
 *
 * Escape hands focus back to the room, and so does a correct entry — that is
 * the moment the player wants to go and look for the next one, and leaving the
 * caret in the box would leave them with dead movement keys and no idea why.
 */
function CodeConsole({
  rejected,
  onSubmit,
}: {
  rejected: boolean;
  onSubmit: (entry: string) => boolean;
}) {
  const [entry, setEntry] = useState("");
  const input = useRef<HTMLInputElement>(null);

  function send() {
    if (entry.trim().length === 0) return;
    const ok = onSubmit(entry);
    setEntry("");
    if (ok) input.current?.blur();
  }

  return (
    <div
      className={`pointer-events-auto mx-auto flex w-full max-w-2xl items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
        rejected ? "border-[#ff2d95] bg-[#2a0a1c]/95" : "border-[#22e0ff]/30 bg-black/85"
      }`}
    >
      <span aria-hidden className="font-mono text-sm text-[#22e0ff]">
        &gt;
      </span>
      <input
        ref={input}
        value={entry}
        onChange={(e) => setEntry(e.target.value)}
        onKeyDown={(e) => {
          // Stop here rather than letting these reach the window listeners.
          e.stopPropagation();
          if (e.key === "Enter") send();
          if (e.key === "Escape") input.current?.blur();
        }}
        placeholder="Type a code you found in the room"
        aria-label="Code entry"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent font-mono text-sm tracking-[0.2em] text-paper-white outline-none placeholder:tracking-normal placeholder:text-paper-white/35"
      />
      <button
        type="button"
        onClick={send}
        className="shrink-0 rounded bg-[#0d3a4a] px-3 py-1 font-mono text-[0.68rem] tracking-widest text-[#bfefff] transition-colors hover:bg-[#155a72]"
      >
        ENTER
      </button>
    </div>
  );
}

function Chip({ active, label }: { active: boolean; label: string }) {
  return (
    <span
      className={`rounded px-2 py-1 font-mono text-[0.65rem] tracking-widest ${
        active ? "bg-[#062431]/90 text-[#7fdcff]" : "bg-black/70 text-paper-white/50"
      }`}
    >
      {label}
    </span>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import type { Group } from "three";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * The reading cupboards, and the one book worth opening.
 *
 * Five open-fronted cupboards run along the right wall. Each holds two shelves
 * of books, thirty in all, and every one of them can be pulled. A pulled book
 * flies off its shelf, opens in front of the player's face, and either says so
 * or does not:
 *
 *   wrong — the page reads THIS IS NOT THE BOOK YOU ARE SEARCHING FOR, and it
 *           closes itself and goes back where it came from.
 *   right — the pages riffle through under their own power and stop on the
 *           word this cupboard was hiding.
 *
 * THERE IS A TELL, and it matters. Thirty books with no way to choose between
 * them is not a puzzle, it is a queue: five people take turns clicking until
 * one of them gets lucky, and nobody learns anything. So the right book is the
 * only one on the wall shelved upside down — its gilt band sits at the foot of
 * the spine instead of the head. A team that looks along the shelves finds it
 * in seconds. A team that does not can still brute-force all thirty, which is
 * a worse experience but never a stuck one.
 *
 * WHERE THE CUPBOARDS STAND, and why they carry no collision footprint: they
 * are set into the right wall between x = 5.55 and 6.0, and the walk bounds
 * already stop the player at x = 5.16. Their front face is beyond anywhere a
 * body can reach, so a footprint could only ever inflate into the right-hand
 * corridor — which is the artery to the whole back-right corner of the room.
 * See the note beside OBSTACLES in MysteryRoomScene.tsx.
 */

/** What the right book spells out. Must match ROOM_SECTIONS s2 in roomTasks.ts. */
const BOOK_CODE = "GRIMOIRE";

const WRONG_TEXT = "THIS IS NOT\nTHE BOOK YOU\nARE SEARCHING FOR";

/** Centre of the run, on the right wall. Local +X runs along the wall, local +Z into the room. */
const RUN_AT: [number, number, number] = [6, 0, -3.4];

/** Five bays, 40cm each, centred on the run. */
const BAYS = [-0.8, -0.4, 0, 0.4, 0.8];
/** Shelf surfaces the books stand on. */
const SHELVES = [1.0, 1.6];
/** Three books per shelf per bay. */
const SLOTS = [-0.115, 0, 0.115];

/**
 * The one that matters: centre bay, lower shelf, middle slot.
 */
const TARGET_ID = "b2-0-1";

const C = {
  case: "#5b4128",
  caseDark: "#42301d",
  shelf: "#6a4c2f",
  brass: "#c39b52",
  page: "#e8e0c8",
  pageInk: "#3a3128",
};

const SPINES = ["#8c4a3f", "#3f5b7a", "#6b6b52", "#96683a", "#47605a", "#7b4d72", "#5c4230", "#2f4a3f"];

interface BookRef {
  id: string;
  /** Local position of the book's base on its shelf. */
  at: [number, number, number];
  width: number;
  height: number;
  colour: string;
  right: boolean;
}

/** Every book on the wall, laid out once. */
function layout(): BookRef[] {
  const out: BookRef[] = [];
  BAYS.forEach((bx, bay) => {
    SHELVES.forEach((sy, shelf) => {
      SLOTS.forEach((sx, slot) => {
        const i = bay * 6 + shelf * 3 + slot;
        out.push({
          id: `b${bay}-${shelf}-${slot}`,
          at: [bx + sx, sy, 0.22],
          width: 0.062 + ((i * 37) % 4) * 0.008,
          height: 0.22 + ((i * 53) % 5) * 0.018,
          colour: SPINES[i % SPINES.length],
          right: `b${bay}-${shelf}-${slot}` === TARGET_ID,
        });
      });
    });
  });
  return out;
}

/** Cover angle off the spine plane, shut and open. Radians. */
const CLOSED_FOLD = 1.5;
const OPEN_FOLD = 0.22;

type Phase = "opening" | "reading" | "riffling" | "revealed" | "closing";

interface Props {
  dragRef: MutableRefObject<PlayerState>;
  /** True once the right book has been read. Re-opening it goes straight to the page. */
  found: boolean;
  /** A line under the viewport. The 3D page is drawn by troika, which fetches
   *  its font over the network; on locked-down event wifi that can fail
   *  silently, and neither the rebuff nor the code may have a single point of
   *  failure that renders nothing and says nothing. */
  onNote: (text: string) => void;
  /** Fired once, when the right book's pages settle. */
  onFound: () => void;
  /**
   * True while a book is held open in front of the player.
   *
   * The room dims behind it, and that dimming is done in the DOM overlay
   * rather than with a dark plane in the scene. A plane cannot work here: the
   * player has to stand within about half a metre of the cupboards to reach a
   * spine, so the cupboard is at the same depth as the book, and any veil far
   * enough back to be behind the book is also behind the shelf the player is
   * nose-to-nose with. The overlay has no depth to lose to.
   */
  onReading: (open: boolean) => void;
}

export default function Books({ dragRef, found, onNote, onFound, onReading }: Props) {
  const books = useMemo(() => layout(), []);
  const [pulled, setPulled] = useState<BookRef | null>(null);
  const [phase, setPhase] = useState<Phase>("opening");

  useEffect(() => {
    onReading(pulled !== null);
  }, [pulled, onReading]);

  // The pull sequence is a handful of timed steps, not a per-frame quantity, so
  // it is driven by timers rather than by accumulating elapsed time in
  // useFrame. Every branch returns its own cleanup: a player who walks away
  // mid-read and pulls another book must not get the first book's callbacks.
  useEffect(() => {
    if (!pulled) return;

    if (phase === "opening") {
      const t = setTimeout(() => setPhase(pulled.right ? "riffling" : "reading"), 460);
      return () => clearTimeout(t);
    }
    if (phase === "reading") {
      onNote("The page reads: this is not the book you are searching for.");
      // Long enough to read three lines of it on a projector at the back of a
      // hall, and to notice that the page really is blank apart from the
      // rebuff — there is nothing else on a wrong book to find.
      const t = setTimeout(() => setPhase("closing"), 2600);
      return () => clearTimeout(t);
    }
    if (phase === "riffling") {
      const t = setTimeout(() => {
        setPhase("revealed");
        onFound();
      }, 1500);
      return () => clearTimeout(t);
    }
    if (phase === "revealed") {
      const t = setTimeout(() => setPhase("closing"), 5200);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setPulled(null), 420);
    return () => clearTimeout(t);
  }, [phase, pulled, onNote, onFound]);

  function pull(book: BookRef) {
    if (pulled) return; // one at a time, or two books share the same air
    setPulled(book);
    // A book already known to be the right one skips its own reveal animation.
    setPhase(book.right && found ? "revealed" : "opening");
  }

  return (
    <group>
      <group position={RUN_AT} rotation={[0, -Math.PI / 2, 0]}>
        <Cases />
        {books.map((b) => (
          <ShelfBook
            key={b.id}
            book={b}
            hidden={pulled?.id === b.id}
            dragRef={dragRef}
            onPull={() => pull(b)}
          />
        ))}
      </group>

      {pulled && <OpenBook book={pulled} phase={phase} />}
    </group>
  );
}

/** The five carcasses: sides, shelves, a plinth and a run of closed doors below. */
function Cases() {
  return (
    <group>
      {/* Back panel against the wall */}
      <mesh position={[0, 1.2, 0.02]}>
        <boxGeometry args={[2.08, 2.3, 0.04]} />
        <meshStandardMaterial color={C.caseDark} roughness={0.9} />
      </mesh>

      {/* Dividers between the bays, plus the two ends */}
      {[-1.0, -0.6, -0.2, 0.2, 0.6, 1.0].map((x) => (
        <mesh key={x} position={[x, 1.2, 0.24]} castShadow>
          <boxGeometry args={[0.04, 2.3, 0.44]} />
          <meshStandardMaterial color={C.case} roughness={0.85} />
        </mesh>
      ))}

      {/* Shelf boards, and the cornice and plinth that top and tail the run */}
      {[0.95, 1.55, 2.25].map((y) => (
        <mesh key={y} position={[0, y, 0.24]} receiveShadow>
          <boxGeometry args={[2.04, 0.05, 0.44]} />
          <meshStandardMaterial color={C.shelf} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 2.36, 0.26]} castShadow>
        <boxGeometry args={[2.16, 0.12, 0.5]} />
        <meshStandardMaterial color={C.shelf} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.12, 0.26]}>
        <boxGeometry args={[2.16, 0.24, 0.5]} />
        <meshStandardMaterial color={C.shelf} roughness={0.85} />
      </mesh>

      {/* Cupboard doors under the shelves. Solid, and they stay solid — the
          twelve drawers elsewhere already carry the "containers open" lesson,
          and five more empty compartments would only be five more places to
          rule out. */}
      {BAYS.map((x) => (
        <group key={x} position={[x, 0.6, 0.44]}>
          <mesh castShadow>
            <boxGeometry args={[0.36, 0.62, 0.03]} />
            <meshStandardMaterial color={C.case} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0, 0.018]}>
            <boxGeometry args={[0.26, 0.5, 0.01]} />
            <meshStandardMaterial color={C.caseDark} roughness={0.9} />
          </mesh>
          <mesh position={[0.13, 0, 0.03]}>
            <sphereGeometry args={[0.018, 10, 10]} />
            <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
          </mesh>
        </group>
      ))}

      {/* Brass plate on each bay, so the run reads as catalogued rather than
          dumped. None of them names the book. */}
      {BAYS.map((x, i) => (
        <mesh key={`plate${x}`} position={[x, 2.3, 0.5]}>
          <boxGeometry args={[0.2, 0.05, 0.01]} />
          <meshStandardMaterial color={i === 0 ? "#a8873f" : C.brass} metalness={0.65} roughness={0.4} />
        </mesh>
      ))}

      {/* Two lamps inside the run. Without them the far bay is genuinely too
          dark to see a spine in, and "I could not see it" is a different
          failure from "I did not notice it" — this task asks a player to spot
          one gilt band in the wrong place across thirty books, which is only a
          fair question if all thirty are legible. Reach is kept to the depth of
          the case so they light the shelves and not the corridor. */}
      {[-0.6, 0.6].map((x) => (
        <pointLight key={x} position={[x, 1.85, 0.4]} intensity={4.2} distance={2.4} decay={1.8} color="#ffdca8" />
      ))}
    </group>
  );
}

/** One book on its shelf. The spine itself is the click target. */
function ShelfBook({
  book,
  hidden,
  dragRef,
  onPull,
}: {
  book: BookRef;
  hidden: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onPull: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [x, y, z] = book.at;

  return (
    <group position={[x, y + book.height / 2, z]} visible={!hidden}>
      <mesh castShadow>
        <boxGeometry args={[book.width, book.height, 0.16]} />
        <meshStandardMaterial color={hovered ? "#d9a441" : book.colour} roughness={0.95} />
      </mesh>

      {/* Gilt band. On the right book it sits at the foot of the spine rather
          than the head, because that book is shelved upside down — the only
          thing on this wall that is not where it should be. */}
      <mesh position={[0, book.right ? -book.height * 0.32 : book.height * 0.32, 0.081]}>
        <planeGeometry args={[book.width * 0.66, 0.016]} />
        <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh position={[0, book.right ? -book.height * 0.14 : book.height * 0.14, 0.081]}>
        <planeGeometry args={[book.width * 0.5, 0.01]} />
        <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.45} />
      </mesh>

      {/* Click target, wider than the spine. A 6cm spine seen edge-on from a
          metre away is a couple of dozen pixels on a projector. */}
      <mesh
        position={[0, 0, 0.12]}
        onClick={(e) => {
          e.stopPropagation();
          // A look-drag that starts and ends over this book would otherwise
          // arrive here as a click — see Player's doc comment.
          if (dragRef.current.moved) return;
          onPull();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[book.width + 0.03, book.height, 0.1]} />
        <meshBasicMaterial transparent opacity={hovered ? 0.2 : 0} color="#ffd479" />
      </mesh>
    </group>
  );
}

/**
 * The pulled book, held open in front of the player.
 *
 * Not parented to the camera object — it copies the camera's transform every
 * frame and offsets from there, the same trick the held torch uses. Same
 * result, but the book stays a normal member of the scene graph rather than
 * moving into view space, where pointer events and lighting both get fiddly.
 *
 * Everything that moves here moves imperatively. The open angle, the fly-in and
 * the riffle are all per-frame quantities; routing any of them through React
 * state would re-render the whole book sixty times a second to change one
 * rotation.
 */
function OpenBook({ book, phase }: { book: BookRef; phase: Phase }) {
  const { camera } = useThree();
  const rig = useRef<Group>(null);
  const leftLeaf = useRef<Group>(null);
  const rightLeaf = useRef<Group>(null);
  const pages = useRef<Group>(null);
  const open = useRef(0);
  const riffle = useRef(0);

  const closing = phase === "closing";
  const riffling = phase === "riffling";
  const showText = phase === "reading" || phase === "revealed";

  useFrame((state, delta) => {
    const g = rig.current;
    if (!g) return;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    // Offset to the left, because the writing is always on the RIGHT-hand page
    // and the task rail covers the right quarter of the viewport. Centred, the
    // word ran under the rail and came out as "GRIMO".
    g.translateX(-0.15);
    g.translateY(-0.1);
    g.translateZ(-0.58);
    // A slow drift, so a book hanging in mid-air reads as held rather than
    // pinned to the screen.
    g.rotateX(0.34 + Math.sin(state.clock.elapsedTime * 0.8) * 0.012);
    g.rotateZ(Math.sin(state.clock.elapsedTime * 0.6) * 0.014);

    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 9);
    open.current += ((closing ? 0 : 1) - open.current) * k;

    const t = open.current;
    // Tops out just under life size at 58cm from the eye, which fills most of
    // the viewport without either page running off the edge of it.
    g.scale.setScalar(0.5 + t * 0.4);
    // Both covers start edge-on to the reader and swing round to face them,
    // stopping just short of flat. Going the other way — from flat to a wide
    // angle — is the obvious reading of "opening" and it is wrong: it leaves
    // the two pages pointing at each other, and the page with the writing on
    // it ends up a white wedge seen from the side.
    const fold = CLOSED_FOLD - t * (CLOSED_FOLD - OPEN_FOLD);
    if (leftLeaf.current) leftLeaf.current.rotation.y = -fold;
    if (rightLeaf.current) rightLeaf.current.rotation.y = fold;

    riffle.current = riffling ? riffle.current + delta * 5.4 : 0;
    if (pages.current) {
      pages.current.children.forEach((leaf, i) => {
        if (!riffling) {
          leaf.rotation.y = 0;
          return;
        }
        // A wave of pages turning over: each leaf lags the one before it, and
        // the whole wave cycles until the riffle stops. Each leaf pivots about
        // the spine, so it sweeps across the gutter the way a page does rather
        // than spinning about its own middle.
        const local = (((riffle.current - i * 0.14) % 1.6) + 1.6) % 1.6;
        leaf.rotation.y = -Math.PI * Math.min(1, Math.max(0, local));
      });
    }

  });

  return (
    <group ref={rig}>
      {/* Spine */}
      <mesh>
        <boxGeometry args={[0.05, 0.44, 0.03]} />
        <meshStandardMaterial color={book.colour} roughness={0.9} />
      </mesh>

      {/* Left leaf: cover plus a block of pages, hinged at the spine */}
      <group ref={leftLeaf} position={[-0.024, 0, 0]}>
        <mesh position={[-0.16, 0, -0.012]} castShadow>
          <boxGeometry args={[0.32, 0.44, 0.014]} />
          <meshStandardMaterial color={book.colour} roughness={0.9} />
        </mesh>
        <mesh position={[-0.155, 0, 0.002]}>
          <boxGeometry args={[0.3, 0.42, 0.012]} />
          <meshStandardMaterial color={C.page} roughness={1} />
        </mesh>
        {/* Ruled lines. Never the message — the left page is always just paper,
            so there is exactly one place on the book worth reading. */}
        {[0.16, 0.11, 0.06, 0.01, -0.04, -0.09, -0.14].map((y) => (
          <mesh key={y} position={[-0.155, y, 0.009]}>
            <planeGeometry args={[0.22, 0.006]} />
            <meshBasicMaterial color="#b3a98c" />
          </mesh>
        ))}
      </group>

      {/* Right leaf: the page the book is trying to show you */}
      <group ref={rightLeaf} position={[0.024, 0, 0]}>
        <mesh position={[0.16, 0, -0.012]} castShadow>
          <boxGeometry args={[0.32, 0.44, 0.014]} />
          <meshStandardMaterial color={book.colour} roughness={0.9} />
        </mesh>
        <mesh position={[0.155, 0, 0.002]}>
          <boxGeometry args={[0.3, 0.42, 0.012]} />
          <meshStandardMaterial color={C.page} roughness={1} />
        </mesh>

        {showText && (
          // Clear of the riffle stack below, which is nine leaves deep and
          // would otherwise sit on top of the writing once it settles flat.
          <Text
            position={[0.155, 0, 0.022]}
            fontSize={book.right ? 0.052 : 0.028}
            maxWidth={0.26}
            lineHeight={1.35}
            textAlign="center"
            anchorX="center"
            anchorY="middle"
            color={book.right ? "#2a1c6b" : C.pageInk}
            outlineWidth={book.right ? 0.0022 : 0}
            outlineColor="#e8e0c8"
          >
            {book.right ? BOOK_CODE : WRONG_TEXT}
          </Text>
        )}

        {/* The leaves that riffle. They live inside the right-hand leaf so they
            ride with the cover as it opens, and each is a group hinged at the
            spine with its page hung off to the side — rotating the group turns
            the page about the gutter, which is what a page does. Parked flat
            against the right page when nothing is riffling, so they cost
            nothing to leave mounted and there is no frame where a stack of
            paper pops into being. */}
        <group ref={pages} position={[0, 0, 0.009]}>
          {Array.from({ length: 9 }, (_, i) => (
            <group key={i}>
              <mesh position={[0.155, 0, i * 0.0006]}>
                <planeGeometry args={[0.3, 0.42]} />
                <meshStandardMaterial color={i % 2 ? "#efe8d2" : C.page} roughness={1} side={2} />
              </mesh>
            </group>
          ))}
        </group>
      </group>

      {/* A reading light, so the page is legible whatever corner it was pulled in */}
      <pointLight position={[0, 0.1, 0.42]} intensity={2.6} distance={1.6} decay={2} color="#fff3d8" />
    </group>
  );
}

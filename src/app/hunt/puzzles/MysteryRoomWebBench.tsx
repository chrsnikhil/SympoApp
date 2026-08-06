"use client";

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial } from "three";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * The fluid bench: a wrist shooter, and a rack of twelve cartridges.
 *
 * WHAT CHANGED, AND WHY IT MATTERS. This rack used to hold eight cartridges of
 * which exactly one had anything in it — a column of pale fluid with a bright
 * meniscus, sitting among seven tubes with a smear of dry residue in the
 * bottom. The intended lesson was "look before you click". The actual lesson
 * was nothing at all, because the answer was visible from the doorway. There
 * was no puzzle; there was a spot-the-full-one, and the punishment for not
 * bothering was losing a cartridge nobody wanted.
 *
 * So now EVERY cartridge is full, and every one is a different colour, and
 * there is no visual difference between the live batch and the eleven
 * condemned ones. The rack is deliberately, completely unsolvable by looking at
 * it.
 *
 * What makes it solvable is the SPEC CARD pinned to the pegboard behind the
 * bench, which names the batch number and the tint of the one live charge. Each
 * cartridge carries its batch number, stamped on the rack in front of its clip.
 * Both facts are load-bearing: three cartridges share the tint the card names,
 * and only one of those three is the batch it names.
 *
 * That turns the task from "spot the odd one out" into "find the document,
 * read the document, cross-reference the document" — which is the thing an
 * escape room is for, and it is also why this task's second clue in
 * roomTasks.ts points at the pegboard rather than at the rack. A WRONG PICK IS
 * STILL PERMANENT. It has to be, or the card is optional; and with the card it
 * is fair, because nobody is being asked to guess any more.
 */

/** What the web spells out. Must match ROOM_SECTIONS s3 in roomTasks.ts. */
const WEB_CODE = "WEBLINE";

/**
 * Where the bench stands: flat against the front wall, behind the spawn point.
 *
 * Behind, specifically. The player starts at (0, 3.2) facing the back of the
 * room, so this is the one clue in the room that nobody finds without turning
 * round — which is the first thing a search should teach them to do.
 *
 * Turned to face into the room, so local +Z is the side the player stands on.
 */
const BENCH_AT: [number, number, number] = [-1.3, 0, 4.12];

/** The four tints in circulation. Each is used by exactly three cartridges. */
const TINTS = {
  AMBER: { fill: "#ffb347", glow: "#c26a12" },
  VIOLET: { fill: "#c084ff", glow: "#6b2fc9" },
  CYAN: { fill: "#5fe3ff", glow: "#1273a8" },
  CRIMSON: { fill: "#ff6b85", glow: "#b01e3a" },
} as const;

type TintName = keyof typeof TINTS;

interface Slot {
  /** Batch number, stamped on the rack in front of the clip. Two digits. */
  batch: string;
  tint: TintName;
  x: number;
  /** Height of this row's step. Derived from the row, never set by hand. */
  y: number;
  z: number;
}

/** Column and row spacing. Wide enough that neighbouring click targets do not touch. */
const COLS = [-0.27, -0.09, 0.09, 0.27];
/** Local +Z is the side the player stands on, so ROWS[2] is the front row. */
const ROWS = [-0.13, 0, 0.13];

/**
 * How far each row is raised above the one in front of it.
 *
 * THE RACK IS RAKED, LIKE A SPICE RACK, AND IT HAS TO BE. Flat, the three rows
 * sat at one height and the back two were unclickable: a ray aimed at a
 * cartridge in the middle row, from a player standing at the bench where they
 * are supposed to stand, passed straight through the click target of the
 * cartridge directly in front of it. The front row ate every click meant for
 * anything behind it — which, on a rack where a wrong click destroys a
 * cartridge for good, meant the task could delete the answer while the player
 * was aiming at something else entirely.
 *
 * 5.5cm per step clears the 8.5cm half-height of a click target by a
 * comfortable margin at every distance a player can stand and still reach. It
 * also happens to be the only way all twelve batch numbers are legible at once,
 * which is what the spec card cross-reference needs.
 */
const ROW_LIFT = [0.11, 0.055, 0];
/** Depth of one step of the rake. */
const STEP_DEPTH = 0.14;

/**
 * Twelve cartridges, four to a row.
 *
 * The tints are dealt so that no row is a giveaway and the live batch is not at
 * an end, in a corner, or in the obvious middle. Three cartridges are VIOLET —
 * 03, 07 and 12 — so reading only the tint off the spec card leaves a one in
 * three guess, and reading only the batch number leaves you asking which of
 * twelve. Both, and it is certain.
 */
/**
 * The one live charge.
 *
 * Declared on its own and then spliced into the rack below, rather than picked
 * back out of the array with a `find`. Everything that has to agree about which
 * cartridge is the answer — the rack, the spec card, the one in flight, the
 * click handler — reads this object, so there is no version of this file where
 * the card names a batch the rack does not have.
 */
const LIVE: Slot = { batch: "07", tint: "VIOLET", x: COLS[2], y: ROW_LIFT[1], z: ROWS[1] };
const LIVE_BATCH = LIVE.batch;

/** One row of four, at the row's own height. Keeps y and z in step by hand-off. */
const row = (r: number, cells: [string, TintName][]): Slot[] =>
  cells.map(([batch, tint], c) => ({ batch, tint, x: COLS[c], y: ROW_LIFT[r], z: ROWS[r] }));

const SLOTS: Slot[] = [
  ...row(0, [
    ["01", "AMBER"],
    ["02", "CYAN"],
    ["03", "VIOLET"],
    ["04", "CRIMSON"],
  ]),
  ...row(1, [
    ["05", "CRIMSON"],
    ["06", "AMBER"],
    ["07", "VIOLET"],
    ["08", "CYAN"],
  ]).map((s) => (s.batch === LIVE_BATCH ? LIVE : s)),
  ...row(2, [
    ["09", "CYAN"],
    ["10", "CRIMSON"],
    ["11", "AMBER"],
    ["12", "VIOLET"],
  ]),
];

/** Local frame of the rack, the shooter, and where a seated cartridge sits. */
const RACK_AT: [number, number, number] = [-0.46, 0.9, 0];
const SHOOTER_AT: [number, number, number] = [0.62, 0.9, -0.1];
const SEAT_AT = new Vector3(0, 0.055, -0.02);
/** Centre of the web on the bench top. Clear of the rack by about 7cm. */
const WEB_AT: [number, number, number] = [0.24, 0.925, 0.16];

/**
 * The timeline every cartridge runs when it is picked up, in seconds.
 *
 * BOTH OUTCOMES SHARE THE FIRST TWO BEATS, and that is the point of having a
 * timeline at all. Before this, a wrong cartridge vanished on the same frame it
 * was clicked — which does not read as "you destroyed it", it reads as "the
 * click did not register and something glitched". Now every pick lifts the
 * cartridge clear of the rack and turns it over in front of you first, so the
 * player watches the thing they chose being checked, and only then finds out.
 * The two outcomes diverge at `checked`.
 */
const T = {
  /** Rising clear of the clip. */
  lift: 0.34,
  /** Turning over, batch number toward the player. */
  checked: 0.74,
  /** Wrong: the fluid drains away. */
  drained: 1.14,
  /** Wrong: the tube collapses and is gone. */
  crumbled: 1.6,
  /** Right: it has crossed the bench and is over the receiver. */
  arrived: 1.34,
  /** Right: seated, after the bounce. */
  seated: 1.52,
};

/** After it seats, how long the shooter charges before it fires. */
const CHARGE_MS = 900;

const C = {
  wood: "#5e4231",
  woodPale: "#7d5942",
  metal: "#5b6178",
  metalDark: "#33384b",
  brass: "#c9963f",
  glass: "#9fbdd0",
  web: "#e8f1f8",
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** 0..1 eased at both ends. Used for every beat of the timeline above. */
const ease = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

interface Props {
  dragRef: MutableRefObject<PlayerState>;
  /** True once the web has been read. The bench comes back webbed, not reset. */
  found: boolean;
  onNote: (text: string) => void;
  onFound: () => void;
}

type Phase = "idle" | "loading" | "charging" | "fired";

export default function WebBench({ dragRef, found, onNote, onFound }: Props) {
  /** Cartridges picked wrongly. They do not come back. */
  const [gone, setGone] = useState<Set<string>>(() => new Set());
  /** Of those, the ones still playing their destruction animation. */
  const [dying, setDying] = useState<Set<string>>(() => new Set());
  const [phase, setPhase] = useState<Phase>(found ? "fired" : "idle");

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
    };
  }, []);

  // Load, then charge, then fire. Three states rather than one, because the
  // whole reason the shooter has a charge lamp is so that seating a cartridge
  // and firing the thing are visibly separate events — a shooter that webs the
  // bench on the same frame the cartridge lands has no cause and effect in it.
  useEffect(() => {
    if (phase !== "loading") return;
    const t = setTimeout(() => setPhase("charging"), T.seated * 1000);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "charging") return;
    const t = setTimeout(() => {
      setPhase("fired");
      onFound();
    }, CHARGE_MS);
    return () => clearTimeout(t);
  }, [phase, onFound]);

  /**
   * Picking a cartridge out of the rack.
   *
   * The note fires here, on the click, rather than at the end of the animation.
   * A player who has just destroyed something needs to be told immediately —
   * a message that arrives a second and a half later reads as a message about
   * whatever they did next.
   */
  const take = useCallback(
    (slot: Slot) => {
      if (slot.batch === LIVE_BATCH) {
        if (phase !== "idle") return;
        setPhase("loading");
        onNote(
          `Batch ${slot.batch} lifts clear of the rack, still live. The cartridge seats in the shooter with a click.`
        );
        return;
      }
      if (gone.has(slot.batch)) return;

      // Both Sets are computed before either setter runs. A setState updater
      // executes during React's render pass and may run more than once, so a
      // second setter called from inside one is an error waiting for a
      // StrictMode double-invoke to find it.
      const nextGone = new Set(gone).add(slot.batch);
      const nextDying = new Set(dying).add(slot.batch);
      setGone(nextGone);
      setDying(nextDying);
      onNote(
        `Batch ${slot.batch} was condemned years ago. The ${slot.tint.toLowerCase()} charge drains and the cartridge crumbles to nothing.`
      );

      timers.current.push(
        setTimeout(() => {
          setDying((prev) => {
            const next = new Set(prev);
            next.delete(slot.batch);
            return next;
          });
        }, T.crumbled * 1000 + 200)
      );
    },
    [phase, gone, dying, onNote]
  );

  return (
    <group position={BENCH_AT} rotation={[0, Math.PI, 0]}>
      <Bench />
      <SpecCard />

      {/* The rack: three steps, one per row, each one taller than the one in
          front of it. See ROW_LIFT for why it is raked rather than flat. */}
      <group position={RACK_AT}>
        {ROW_LIFT.map((lift, r) => (
          <group key={lift}>
            <mesh position={[0, (lift + 0.04) / 2, ROWS[r]]} receiveShadow castShadow>
              <boxGeometry args={[0.7, lift + 0.04, STEP_DEPTH]} />
              <meshStandardMaterial color={C.wood} roughness={0.9} />
            </mesh>
            {/* Lip along the front of each step, so the rake reads as steps and
                not as one wedge seen end-on. */}
            <mesh position={[0, lift + 0.045, ROWS[r] + STEP_DEPTH / 2 - 0.006]}>
              <boxGeometry args={[0.7, 0.012, 0.012]} />
              <meshStandardMaterial color={C.woodPale} roughness={0.85} />
            </mesh>
          </group>
        ))}
        {SLOTS.map((s) => {
          const isGone = gone.has(s.batch);
          const isDying = dying.has(s.batch);
          const removed = s.batch === LIVE_BATCH && phase !== "idle";
          return (
            <group key={s.batch} position={[s.x, s.y + 0.04, s.z]}>
              {/* The clip stays whether or not the cartridge does. An empty clip
                  is how a player knows they have already been here. */}
              <mesh position={[0, 0.03, 0]}>
                <torusGeometry args={[0.032, 0.005, 6, 14]} />
                <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.55} />
              </mesh>
              <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <circleGeometry args={[0.03, 14]} />
                <meshStandardMaterial color={isGone ? "#241d2e" : "#332a3d"} roughness={1} />
              </mesh>

              {/* Batch number, stamped flat on the rack in front of the clip.
                  Laying text flat rotates it -90 about X, which sends the top
                  of the lettering to local -Z; the bench itself is turned to
                  face the room (Y = pi), so that comes out as world +Z — away
                  from a player on the near side, which is the way up they read
                  it from. */}
              <Text
                position={[0, 0.003, 0.052]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.03}
                anchorX="center"
                anchorY="middle"
                color={isGone ? "#5c5470" : "#efe7d5"}
                outlineWidth={0.003}
                outlineColor="#1b1526"
              >
                {s.batch}
              </Text>

              {!isGone && !removed && <Cartridge slot={s} dragRef={dragRef} onTake={() => take(s)} />}
              {isDying && <DyingCartridge slot={s} />}
            </group>
          );
        })}
      </group>

      {/* The shooter, and the cartridge once it is on its way in */}
      <group position={SHOOTER_AT}>
        <Shooter phase={phase} />
      </group>
      {phase !== "idle" && (
        <FlyingCartridge
          from={[RACK_AT[0] + LIVE.x, RACK_AT[1] + LIVE.y + 0.105, RACK_AT[2] + LIVE.z]}
          to={[SHOOTER_AT[0] + SEAT_AT.x, SHOOTER_AT[1] + SEAT_AT.y, SHOOTER_AT[2] + SEAT_AT.z]}
          instant={found}
        />
      )}

      {phase === "fired" && <Web instant={found} />}
    </group>
  );
}

/**
 * The spec card pinned to the pegboard — the second clue for this task, and the
 * only thing in the room that makes the rack solvable.
 *
 * Deliberately behind the bench rather than on it. A player who walks up and
 * starts clicking cartridges never looks past them; the card is at eye height
 * on the wall a metre back, so finding it costs a step and a look up, which is
 * exactly the behaviour the rest of this room rewards.
 *
 * It states the batch, the tint AND that everything else is condemned. That
 * last line is not flavour: it is the warning that a wrong pick is destructive,
 * and it has to be readable BEFORE the first mistake or the task is a trap
 * rather than a puzzle.
 */
function SpecCard() {
  return (
    <group position={[0.55, 1.43, -0.408]}>
      {/* Card, its backing board, and a bulldog clip holding it on */}
      <mesh position={[0, 0, -0.004]}>
        <planeGeometry args={[0.46, 0.54]} />
        <meshStandardMaterial color="#1d1a2e" roughness={1} />
      </mesh>
      <mesh>
        <planeGeometry args={[0.42, 0.5]} />
        <meshStandardMaterial color="#f2ebda" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.19, 0.002]}>
        <planeGeometry args={[0.42, 0.08]} />
        <meshBasicMaterial color="#ff2d95" />
      </mesh>
      <Text position={[0, 0.19, 0.004]} fontSize={0.042} anchorX="center" anchorY="middle" color="#12101c">
        WEB-FLUID SPEC
      </Text>

      {[
        ["BATCH", LIVE_BATCH],
        ["TINT", LIVE.tint],
        ["STATUS", "LIVE"],
      ].map(([label, value], i) => (
        <group key={label} position={[0, 0.09 - i * 0.075, 0.004]}>
          <Text position={[-0.17, 0, 0]} fontSize={0.036} anchorX="left" anchorY="middle" color="#5a5470">
            {label}
          </Text>
          <Text position={[0.17, 0, 0]} fontSize={0.044} anchorX="right" anchorY="middle" color="#1b1526">
            {value}
          </Text>
        </group>
      ))}

      <mesh position={[0, -0.105, 0.003]}>
        <planeGeometry args={[0.36, 0.004]} />
        <meshBasicMaterial color="#a09a8c" />
      </mesh>
      <Text
        position={[0, -0.165, 0.004]}
        fontSize={0.031}
        maxWidth={0.36}
        textAlign="center"
        anchorX="center"
        anchorY="middle"
        lineHeight={1.25}
        color="#a8261f"
      >
        ALL OTHER BATCHES CONDEMNED — DESTROY ON HANDLING
      </Text>

      {/* Bulldog clip */}
      <mesh position={[0, 0.255, 0.01]}>
        <boxGeometry args={[0.09, 0.03, 0.02]} />
        <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** Workbench: top, legs, a vice, and a pegboard of tools on the wall behind. */
function Bench() {
  return (
    <group>
      <mesh position={[0, 0.88, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.8, 0.06, 0.7]} />
        <meshStandardMaterial color={C.woodPale} roughness={0.9} />
      </mesh>
      {/* Scarred second layer, so the top is not one clean plank */}
      <mesh position={[0.1, 0.913, 0.06]} rotation={[-Math.PI / 2, 0, 0.02]}>
        <planeGeometry args={[1.4, 0.4]} />
        <meshStandardMaterial color="#6d4c37" roughness={1} />
      </mesh>

      {[-0.8, 0.8].map((x) =>
        [-0.28, 0.28].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.43, z]} castShadow>
            <boxGeometry args={[0.08, 0.86, 0.08]} />
            <meshStandardMaterial color={C.wood} roughness={0.9} />
          </mesh>
        ))
      )}
      {/* Stretchers and a lower shelf with tins on it */}
      <mesh position={[0, 0.22, 0]}>
        <boxGeometry args={[1.7, 0.05, 0.62]} />
        <meshStandardMaterial color={C.wood} roughness={0.9} />
      </mesh>
      {[-0.5, -0.28, 0.62].map((x) => (
        <mesh key={x} position={[x, 0.31, -0.02]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 0.12, 12]} />
          <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.55} />
        </mesh>
      ))}

      {/* Bench vice, bolted to the near left corner */}
      <group position={[-0.72, 0.94, 0.24]} rotation={[0, 0.3, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.16, 0.1, 0.1]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.11, 0.01, 0]} castShadow>
          <boxGeometry args={[0.06, 0.12, 0.11]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
        </mesh>
        <mesh position={[0.22, 0.01, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.012, 0.012, 0.18, 8]} />
          <meshStandardMaterial color={C.metal} metalness={0.65} roughness={0.4} />
        </mesh>
      </group>

      {/* Pegboard on the wall behind. Its right-hand third is left clear of
          tools on purpose — that is where the spec card hangs, and a card
          buried among spanners is a card nobody reads. */}
      <group position={[0, 1.55, -0.44]}>
        <mesh>
          <boxGeometry args={[1.6, 0.9, 0.03]} />
          <meshStandardMaterial color="#3b3350" roughness={0.95} />
        </mesh>
        {Array.from({ length: 5 }, (_, i) => (
          <mesh key={i} position={[-0.6 + i * 0.2, 0.24, 0.03]} castShadow>
            <boxGeometry args={[0.02, 0.26 + (i % 3) * 0.06, 0.02]} />
            <meshStandardMaterial color={i % 2 ? C.metal : C.brass} metalness={0.6} roughness={0.45} />
          </mesh>
        ))}
        {[-0.5, -0.16].map((x) => (
          <mesh key={x} position={[x, -0.18, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.07, 0.008, 6, 16]} />
            <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
      </group>

      {/* A lamp clamped to the bench. Brighter than it was: the room around it
          came down by more than half in the retheme, and this is the light that
          has to make twelve small coloured tubes tell each other apart. */}
      <pointLight position={[0.1, 1.34, 0.12]} intensity={5.2} distance={2.8} decay={2} color="#ffe6bc" />
      {/* A second, tight one straight over the rack. Without it the far row sat
          in the shadow of the pegboard and read as three empty clips. */}
      <pointLight position={[-0.46, 1.22, 0.1]} intensity={3.4} distance={1.5} decay={2} color="#e8ecff" />
    </group>
  );
}

/**
 * One cartridge in the rack.
 *
 * Every one of these is full and every one is a different colour. There is no
 * tell here on purpose — see the note at the top of the file. What the player
 * gets is the batch number stamped on the rack in front of it, which is the
 * half of the answer the spec card completes.
 */
function Cartridge({
  slot,
  dragRef,
  onTake,
}: {
  slot: Slot;
  dragRef: MutableRefObject<PlayerState>;
  onTake: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={[0, 0.065, 0]}
      onClick={(e) => {
        e.stopPropagation();
        // A look-drag that starts and ends over this cartridge would otherwise
        // arrive here as a click — see Player's doc comment.
        if (dragRef.current.moved) return;
        onTake();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <CartridgeModel tint={slot.tint} />
      {/* Click target. The glass is 5cm across and this is played on a trackpad. */}
      <mesh>
        <cylinderGeometry args={[0.045, 0.045, 0.17, 10]} />
        <meshBasicMaterial transparent opacity={hovered ? 0.18 : 0} color="#ffd479" />
      </mesh>
    </group>
  );
}

/**
 * The cartridge body, shared by the rack copy, the one in flight and the one
 * being destroyed.
 *
 * `fill` scales the column of fluid down its own axis, which is what the drain
 * animation animates; `fade` takes the whole thing out. Both are driven from
 * useFrame by the parent through refs rather than props, because they change
 * every frame and nothing outside this file cares where they have got to.
 */
function CartridgeModel({ tint }: { tint: TintName }) {
  const { fill, glow } = TINTS[tint];
  return (
    <group>
      {/* Glass. Thin enough to see the charge through — the contents are the
          whole point, and at the opacity glass "should" have they were a grey
          blur. */}
      <mesh castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.13, 14]} />
        <meshStandardMaterial color={C.glass} transparent opacity={0.18} roughness={0.1} metalness={0.1} />
      </mesh>
      {/* The charge. Self-lit, because this bench lives in the darkest corner
          of the room and twelve tubes lit only by a clamp lamp came out as
          twelve shades of the same grey. */}
      <mesh name="fluid" position={[0, -0.012, 0]}>
        <cylinderGeometry args={[0.0245, 0.0245, 0.098, 14]} />
        <meshStandardMaterial color={fill} emissive={glow} emissiveIntensity={0.85} roughness={0.12} />
      </mesh>
      {/* The meniscus: a bright disc where the fluid stops. */}
      <mesh name="meniscus" position={[0, 0.038, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.0245, 16]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.85} side={2} />
      </mesh>
      {/* Collars top and bottom */}
      {[-0.062, 0.062].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.031, 0.031, 0.016, 14]} />
          <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {/* Paper band round the middle. Blank — the batch number is stamped on
          the rack in front of the clip instead, where it can be read without
          walking round the bench to find which way the tube happens to face. */}
      <mesh>
        <cylinderGeometry args={[0.0285, 0.0285, 0.024, 14, 1, true]} />
        <meshStandardMaterial color="#ded2b6" roughness={1} side={2} />
      </mesh>
    </group>
  );
}

/**
 * A wrongly chosen cartridge, being destroyed.
 *
 * Lifts out of the clip, turns over so the player sees what they picked, then
 * the charge drains out of the bottom and the tube collapses in on itself.
 *
 * The whole thing takes a second and a half, and that duration is the entire
 * design. This used to happen instantly — the cartridge was simply not there
 * on the next frame — and instant deletion does not read as a consequence. It
 * reads as a bug. A player has to see their own mistake happen or they learn
 * nothing from it and, worse, do not believe it happened.
 */
function DyingCartridge({ slot }: { slot: Slot }) {
  const ref = useRef<Group>(null);
  const t = useRef(0);
  /**
   * Each material's opacity as it was authored, captured on the first frame.
   *
   * Needed because the parts of this thing do not start from the same place:
   * the glass is at 0.18 and the meniscus at 0.85. Fading everything toward a
   * single number would make the tube snap to fully opaque on the frame the
   * player clicks it, which is a flash of white exactly where they are looking.
   * Materials are per-mesh instances in R3F, so this map never collides with
   * the eleven cartridges still in the rack.
   */
  const bases = useRef(new Map<MeshStandardMaterial | MeshBasicMaterial, number>());

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    t.current += Math.min(delta, 0.1);
    const time = t.current;

    const rise = ease(time / T.lift);
    g.position.set(0, 0.065 + rise * 0.09, 0);
    // Turn it over between lift and checked, then let it sag.
    g.rotation.y = ease((time - T.lift * 0.4) / (T.checked - T.lift * 0.4)) * Math.PI * 1.5;
    g.rotation.z = ease((time - T.checked) / (T.crumbled - T.checked)) * 0.5;

    // Drain: the column of fluid shrinks toward the bottom of the tube, and the
    // meniscus rides down with it.
    const drain = 1 - ease((time - T.checked) / (T.drained - T.checked));
    const collapse = 1 - ease((time - T.drained) / (T.crumbled - T.drained));

    g.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.name === "fluid") {
        mesh.scale.y = Math.max(0.001, drain);
        mesh.position.y = -0.012 - (1 - drain) * 0.049;
      }
      if (mesh.name === "meniscus") {
        mesh.position.y = 0.038 - (1 - drain) * 0.098;
      }
      const m = mesh.material as MeshStandardMaterial | MeshBasicMaterial | undefined;
      if (m && "opacity" in m) {
        if (!bases.current.has(m)) bases.current.set(m, m.transparent ? m.opacity : 1);
        m.transparent = true;
        m.opacity = (bases.current.get(m) ?? 1) * collapse;
      }
    });

    // Squashes vertically as it goes, rather than just fading — a tube that
    // only fades looks like it was switched off, not broken.
    g.scale.set(1 + (1 - collapse) * 0.25, Math.max(0.01, collapse), 1 + (1 - collapse) * 0.25);
  });

  return (
    <group ref={ref} position={[0, 0.065, 0]}>
      <CartridgeModel tint={slot.tint} />
    </group>
  );
}

/**
 * The live cartridge crossing the bench.
 *
 * Four beats rather than one ease: it rises out of the clip, turns over to be
 * checked, arcs across the bench, then drops the last centimetre with a small
 * overshoot so it lands rather than arriving. Driven from useFrame, because it
 * is a position that changes every frame and nothing outside this file has any
 * reason to know where it has got to.
 *
 * `instant` drops it straight into the seat for a bench that was already solved
 * before this component mounted.
 */
function FlyingCartridge({
  from,
  to,
  instant,
}: {
  from: [number, number, number];
  to: [number, number, number];
  instant: boolean;
}) {
  const ref = useRef<Group>(null);
  const t = useRef(instant ? T.seated : 0);

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    t.current += Math.min(delta, 0.1);
    const time = t.current;

    // Straight up out of the clip, held while it turns, then across.
    const rise = ease(time / T.lift) * 0.11;
    const cross = ease((time - T.checked) / (T.arrived - T.checked));
    // The last beat: a short drop past the seat and back, so it settles.
    const settle = ease((time - T.arrived) / (T.seated - T.arrived));
    const bounce = Math.sin(settle * Math.PI) * 0.022;

    g.position.set(
      from[0] + (to[0] - from[0]) * cross,
      from[1] + rise + (to[1] - (from[1] + 0.11)) * cross + Math.sin(cross * Math.PI) * 0.14 - bounce,
      from[2] + (to[2] - from[2]) * cross
    );
    // Turned over to be read on the way up, spinning on the way across, and
    // square to the receiver by the time it lands.
    const check = ease((time - T.lift * 0.4) / (T.checked - T.lift * 0.4)) * Math.PI * 2;
    g.rotation.y = check + cross * Math.PI * 2;
    g.rotation.z = (1 - cross) * 0.9 * ease(time / T.lift);
  });

  return (
    <group ref={ref}>
      <CartridgeModel tint={LIVE.tint} />
    </group>
  );
}

/**
 * The wrist shooter: a cuff, a receiver for the cartridge, and a nozzle.
 *
 * Three visible states, all driven imperatively. Dead while the rack is
 * untouched; a fast amber blink that climbs in frequency while it charges; and
 * a steady green with a physical recoil kick on the frame it fires. The kick is
 * a tenth of a second and it is the single thing that sells the shooter as
 * having done something rather than the web having appeared.
 */
function Shooter({ phase }: { phase: Phase }) {
  const body = useRef<Group>(null);
  const led = useRef<Mesh>(null);
  // Well past the recoil, so a bench that was already solved when this mounted
  // does not kick on its first frame for no reason a player can see.
  const since = useRef(phase === "fired" ? 10 : 0);
  const wasFired = useRef(phase === "fired");

  useFrame((state, delta) => {
    if (phase === "fired" && !wasFired.current) {
      wasFired.current = true;
      since.current = 0;
    }
    since.current += Math.min(delta, 0.1);

    const m = led.current?.material as MeshStandardMaterial | undefined;
    if (m) {
      if (phase === "charging") {
        // Blink rate climbs as it fills, so "nearly there" is legible.
        const rate = 12 + (since.current / (CHARGE_MS / 1000)) * 26;
        m.emissiveIntensity = (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * rate)) * 3.2;
        m.emissive.set("#ffb347");
      } else if (phase === "fired") {
        m.emissiveIntensity = 2.6;
        m.emissive.set("#5cff9d");
      } else {
        m.emissiveIntensity = 0;
        m.emissive.set("#ff3b30");
      }
    }

    // Recoil: back hard, return over about a fifth of a second.
    const g = body.current;
    if (g && wasFired.current) {
      const kick = Math.max(0, 1 - since.current / 0.22);
      g.position.z = -kick * kick * 0.05;
      g.rotation.x = -kick * kick * 0.22;
    }
  });

  return (
    <group ref={body} rotation={[0, -0.34, 0]}>
      {/* Cuff, lying open on the bench */}
      <mesh position={[0, 0.02, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.062, 0.016, 8, 20, Math.PI * 1.35]} />
        <meshStandardMaterial color="#332430" roughness={0.9} />
      </mesh>
      {/* Receiver block the cartridge seats into */}
      <mesh position={[0, 0.05, -0.02]} castShadow>
        <boxGeometry args={[0.09, 0.06, 0.07]} />
        <meshStandardMaterial color={C.metalDark} metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.082, -0.02]}>
        <cylinderGeometry args={[0.032, 0.032, 0.012, 14]} />
        <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Nozzle, pointing across the bench */}
      <mesh position={[0, 0.05, 0.05]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.014, 0.02, 0.08, 12]} />
        <meshStandardMaterial color={C.metal} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Charge lamp */}
      <mesh ref={led} position={[0.05, 0.06, 0.0]}>
        <sphereGeometry args={[0.011, 8, 8]} />
        <meshStandardMaterial color="#2a2f36" emissive="#ff3b30" emissiveIntensity={0} roughness={0.4} />
      </mesh>
      {/* Trigger paddle under the palm */}
      <mesh position={[0, 0.012, 0.03]} rotation={[0.3, 0, 0]}>
        <boxGeometry args={[0.03, 0.008, 0.03]} />
        <meshStandardMaterial color="#2a2f36" roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * The web the shooter puts across the bench, with the word in it.
 *
 * TWO BEATS, not one fade. First a single strand travels from the nozzle to
 * where the web will be — fast, about a fifth of a second — and only then does
 * the web open out from that point and the word settle into it. A web that
 * simply grows in place has nothing to do with the shooter that supposedly
 * threw it; a strand that leaves the nozzle first is the whole causal link, and
 * it costs one scaled box.
 *
 * Drawn lying on the bench top and read from above, which is how the player is
 * already standing.
 */
function Web({ instant }: { instant: boolean }) {
  const strand = useRef<Group>(null);
  const strands = useRef<Group>(null);
  const word = useRef<Group>(null);
  const t = useRef(instant ? 3 : 0);

  /** From the nozzle to the middle of the web, in bench-local coordinates. */
  const shot = {
    dx: WEB_AT[0] - (SHOOTER_AT[0] + 0.02),
    dz: WEB_AT[2] - (SHOOTER_AT[2] + 0.05),
  };
  const shotLength = Math.hypot(shot.dx, shot.dz);
  const shotAngle = Math.atan2(shot.dz, shot.dx);

  useFrame((_state, delta) => {
    t.current += Math.min(delta, 0.1);
    const time = t.current;

    // Beat one: the strand crosses.
    const thrown = ease(time / 0.22);
    if (strand.current) {
      strand.current.scale.x = Math.max(0.001, thrown);
      const m = (strand.current.children[0] as Mesh | undefined)?.material as
        | MeshBasicMaterial
        | undefined;
      // Fades out once the web has taken over, so it does not stay as a bar
      // lying across the bench for the rest of the game.
      if (m) m.opacity = thrown * (1 - ease((time - 0.9) / 0.6)) * 0.85;
    }

    // Beat two: the web opens out from where the strand landed.
    const open = ease((time - 0.2) / 1.0);
    if (strands.current) {
      strands.current.scale.setScalar(0.15 + open * 0.85);
      strands.current.rotation.z = (1 - open) * 0.5;
      strands.current.traverse((o) => {
        const m = (o as Mesh).material as MeshBasicMaterial | undefined;
        if (m && "opacity" in m) m.opacity = open * 0.9;
      });
    }

    // Beat three: the word settles in.
    if (word.current) {
      const w = ease((time - 0.75) / 0.5);
      word.current.scale.setScalar(0.7 + w * 0.3);
      word.current.visible = w > 0.02;
    }
  });

  return (
    <group>
      {/* The strand, hinged at the nozzle and scaled out along its own length */}
      <group
        ref={strand}
        position={[SHOOTER_AT[0] + 0.02, WEB_AT[1], SHOOTER_AT[2] + 0.05]}
        rotation={[0, -shotAngle, 0]}
        scale={[0.001, 1, 1]}
      >
        <mesh position={[shotLength / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[shotLength, 0.012]} />
          <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

      <group position={WEB_AT}>
        {/* Strand widths are 8 to 10mm, not the 3 or 4 a web would really be.
            Sub-centimetre geometry seen at a glancing angle from a metre and a
            half away lands on well under a pixel and simply is not there. */}
        <group ref={strands} rotation={[-Math.PI / 2, 0, 0]}>
          {/* Radials */}
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <mesh key={i} position={[(Math.cos(a) * 0.3) / 2, (Math.sin(a) * 0.3) / 2, 0]} rotation={[0, 0, a]}>
                <planeGeometry args={[0.3, 0.009]} />
                <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} />
              </mesh>
            );
          })}
          {/* Rings */}
          {[0.08, 0.15, 0.22, 0.29].map((r) => (
            <mesh key={r}>
              <ringGeometry args={[r - 0.005, r + 0.005, 10]} />
              <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} side={2} />
            </mesh>
          ))}
          {/* Anchor lines, thrown out past the web to the edges of the bench */}
          {[0.7, 2.2, 3.9, 5.3].map((a) => (
            <mesh key={a} position={[(Math.cos(a) * 0.56) / 2, (Math.sin(a) * 0.56) / 2, 0]} rotation={[0, 0, a]}>
              <planeGeometry args={[0.56, 0.007]} />
              <meshBasicMaterial color={C.web} transparent opacity={0} depthWrite={false} />
            </mesh>
          ))}
        </group>

        {/* The word, written in the web and read from above.
            Laying text flat means rotating it -90 degrees about X, which sends
            the top of the lettering to local -Z. The bench group is turned to
            face the room (Y = pi), so local -Z is world +Z — away from a player
            standing on the near side, which is the way up they need. */}
        <group ref={word} rotation={[-Math.PI / 2, 0, 0]}>
          <Text
            position={[0, 0, 0.006]}
            fontSize={0.078}
            anchorX="center"
            anchorY="middle"
            color="#ffffff"
            outlineWidth={0.005}
            outlineColor="#5c1a4a"
          >
            {WEB_CODE}
          </Text>
        </group>
      </group>
    </group>
  );
}

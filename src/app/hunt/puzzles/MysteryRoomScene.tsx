"use client";

import { memo, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Color } from "three";
import type { Group, Mesh, MeshBasicMaterial, PointLight } from "three";
import { isOnAt, toSpans } from "@/lib/hunt/morse";

/**
 * The room itself — everything that is NOT interactive.
 *
 * Kept separate from MysteryRoom.tsx for one reason: scenery is the part that
 * gets reworked over and over (move a shelf, add a cabinet, change where
 * something hides), while the puzzle state machine is the part that must not
 * drift. Rearranging the room can never change what counts as solved.
 *
 * All of it is primitives, so there is no art dependency and nothing to
 * download. It reads as a room because of proportion, clutter and lighting,
 * not because of detail.
 *
 * COORDINATES. The player walks the floor at eye height 1.62, looking freely.
 *
 *   x  -6 (left wall) .... 0 (centre) .... +6 (right wall)
 *   y   0 (floor) ................. 5 (ceiling)
 *   z  -6 (back wall) ............ +4.6 (front wall, behind the spawn)
 */

export const ROOM = {
  halfWidth: 6,
  height: 5,
  backZ: -6,
  frontZ: 4.6,
};

/** Where the player may stand. A body radius is subtracted from this by the controller. */
export const WALK_BOUNDS = {
  minX: -ROOM.halfWidth + 0.5,
  maxX: ROOM.halfWidth - 0.5,
  minZ: ROOM.backZ + 0.5,
  maxZ: ROOM.frontZ - 0.5,
};

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Furniture footprints, in floor coordinates.
 *
 * The controller pushes the player out of these rather than running a physics
 * engine — this is a look-and-search room, not a platformer, and a solved
 * collision bug is worth less here than a player who can never clip into a
 * desk in front of a hall of people. Keep this list in step with the geometry
 * below; it lives in this file precisely so moving a shelf means editing one
 * place.
 *
 * ADDING ONE IS NOT FREE. Every footprint is inflated by the body radius, so
 * two pieces of furniture 0.6m apart leave no gap at all, and a footprint laid
 * across a corridor can seal off a whole corner of the room — including a
 * corner something is hidden in. The left-hand corridor at z ~= 0.5, between
 * the filing cabinets and the crates, is the only route to the window end;
 * nothing may be placed in it.
 */
export const OBSTACLES: Footprint[] = [
  { minX: -3.7, maxX: -0.7, minZ: -3.8, maxZ: -2.2 }, // desk
  // Sized to the chair itself. It was a metre wide for a half-metre chair,
  // and once the body radius was added on top it walled off the gap between
  // the desk and the filing cabinets completely — the only route from that
  // corner back into the room.
  { minX: -3.0, maxX: -2.36, minZ: -2.1, maxZ: -1.4 }, // desk chair
  { minX: 1.1, maxX: 3.7, minZ: -3.4, maxZ: -2.4 }, // bookcase
  { minX: -4.1, maxX: -1.1, minZ: 1.1, maxZ: 2.7 }, // crates and barrel
  { minX: -1.3, maxX: 1.7, minZ: -5.0, maxZ: -3.6 }, // terminal table
  // Runs to -3.95 rather than the cabinet carcass at -4.2 so the player cannot
  // walk through the one drawer that is pulled out.
  { minX: -6.0, maxX: -3.95, minZ: -4.4, maxZ: -0.2 }, // filing cabinets
  { minX: 4.7, maxX: 6.0, minZ: 1.4, maxZ: 3.2 }, // radiator + plant
  // In the back-right corner, not out in the room. Parked where it used to be
  // (z -5.2..-4.2) its inflated footprint came within 12cm of the bookcase's,
  // and that 12cm was the whole width of the only lane from the front of the
  // room to the back wall. Nothing was technically unreachable, which is
  // exactly why it took walking it to notice.
  { minX: 4.1, maxX: 5.3, minZ: -5.8, maxZ: -4.8 }, // step ladder
  { minX: -5.6, maxX: -4.6, minZ: 2.2, maxZ: 3.4 }, // coat stand
  // Against the back wall rather than the right one. On the right wall it ate
  // the 1.1m corridor between the bookcase and the wall, which is the artery
  // the whole right-hand half of the room hangs off.
  { minX: -2.8, maxX: -1.6, minZ: -5.9, maxZ: -4.9 }, // stove
  // Stops short of x=3.94 so the front-right corner stays walkable past it.
  { minX: 2.2, maxX: 3.6, minZ: 3.1, maxZ: 3.9 }, // steamer trunk
  { minX: 0.7, maxX: 1.7, minZ: 3.5, maxZ: 4.2 }, // sack barrow
  // Shoved flat against the front wall on purpose. Inflated it reaches back to
  // z = 3.56, which still leaves half a metre of lane in front of the crates
  // (they stop at 3.04 inflated) for getting to the front-left corner.
  { minX: -2.2, maxX: -0.4, minZ: 3.9, maxZ: 4.35 }, // web-fluid bench
  // The reading cupboards on the right wall have NO footprint here, and want
  // none. They stand at x 5.55..6.0, and the walk bounds already stop the
  // player at x = 5.16 (5.5 less a body radius) — their front face is 39cm
  // beyond anywhere a body can be. An entry here would only inflate into the
  // right-hand corridor, which is the artery to the whole back-right corner.
];

/**
 * Where the desk and the filing cabinets stand.
 *
 * Exported because their drawers are interactive and therefore live in
 * MysteryRoomDrawers.tsx, which has to place itself in exactly the same frame
 * as the carcass drawn here. One constant each, imported by both, so a drawer
 * cannot end up floating a hand's width off the front of its own cabinet.
 */
export const DESK_AT: [number, number, number] = [-2.2, 0, -3.0];
export const DESK_YAW = 0.18;
export const CABINETS_AT: [number, number, number] = [-5.1, 0, -2.2];
export const CABINETS_YAW = 0.06;

/**
 * One shared palette, so a new piece of furniture doesn't invent its own browns.
 *
 * SPIDER-VERSE, NOT SEPIA. The room used to be lit like a museum: warm greys,
 * mid browns, everything roughly the same value. It read as tasteful and it
 * played badly, because a search room needs a player to be able to tell "there
 * is nothing here" from "I cannot see whether there is anything here", and a
 * flat mid-tone gives you neither.
 *
 * So: the base drops most of the way to black and swings violet, and the room
 * is picked back out by two hard accent colours that never appear in the base —
 * `magenta` and `cyan`. Everything a player is meant to notice sits in front of
 * one or the other. That is the whole trick of the look and it is also the
 * reason it is worth having: colour is now load-bearing, not decoration.
 *
 * `paper` and `paperAged` deliberately did NOT come down with everything else.
 * They are the brightest things in the room by a wide margin now, which is what
 * makes a sheet of paper on a dark board the thing your eye goes to — and every
 * word this room has to say is written on one.
 */
const C = {
  floor: "#221d30",
  floorBoard: "#2a243a",
  rug: "#40203a",
  rugTrim: "#542948",
  wallLower: "#28243c",
  wallUpper: "#312b48",
  ceiling: "#1e1b2e",
  skirting: "#18162c",
  wood: "#5e4231",
  woodDark: "#402c22",
  woodPale: "#7d5942",
  metal: "#5b6178",
  metalDark: "#33384b",
  paper: "#f2ebda",
  paperAged: "#dccfb2",
  brass: "#c9963f",
  green: "#2f6b56",
  screen: "#22e0ff",
  glass: "#8fb6cc",
  ink: "#141322",
  rust: "#8a3a4a",
  enamel: "#262b3d",
  cloth: "#3c2547",
  jar: "#7fb0aa",
  magenta: "#ff2d95",
  cyan: "#22e0ff",
};

interface BoxProps {
  position: [number, number, number];
  size: [number, number, number];
  colour: string;
  rotation?: [number, number, number];
  roughness?: number;
  metalness?: number;
}

/** A plain box. Most furniture in here is boxes arranged into a shape. */
function Box({ position, size, colour, rotation, roughness = 0.85, metalness = 0 }: BoxProps) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={size} />
      <meshStandardMaterial color={colour} roughness={roughness} metalness={metalness} />
    </mesh>
  );
}

/** Floor, ceiling, four walls, skirting, dado rail, picture rail. */
function Structure() {
  const { halfWidth, height, backZ, frontZ } = ROOM;
  const depth = frontZ - backZ;
  const midZ = (frontZ + backZ) / 2;

  const boards = useMemo(
    () => Array.from({ length: 13 }, (_, i) => -halfWidth + 0.45 + i * 0.92),
    [halfWidth]
  );
  // Short cross-joints, so the planks read as boards laid end to end rather
  // than thirteen strips running the whole length of the room.
  const joints = useMemo(
    () =>
      boards.flatMap((x, i) =>
        [-4.1, -0.6, 2.4].map((z) => ({ x, z: z + ((i * 31) % 7) * 0.28 }))
      ),
    [boards]
  );

  return (
    <group>
      {/* Floor, with plank seams so it is not one flat sheet */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, midZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, depth]} />
        <meshStandardMaterial color={C.floor} roughness={0.9} />
      </mesh>
      {boards.map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, midZ]} receiveShadow>
          <planeGeometry args={[0.06, depth]} />
          <meshStandardMaterial color={C.floorBoard} roughness={1} />
        </mesh>
      ))}
      {joints.map((j) => (
        <mesh
          key={`${j.x}:${j.z}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[j.x + 0.46, 0.005, j.z]}
        >
          <planeGeometry args={[0.86, 0.05]} />
          <meshStandardMaterial color={C.floorBoard} roughness={1} />
        </mesh>
      ))}

      {/* Rug, with a border and a worn centre */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, -0.4]} receiveShadow>
        <planeGeometry args={[6.4, 4.6]} />
        <meshStandardMaterial color={C.rug} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, -0.4]} receiveShadow>
        <planeGeometry args={[5.6, 3.8]} />
        <meshStandardMaterial color={C.rugTrim} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.022, -0.4]} receiveShadow>
        <planeGeometry args={[4.2, 2.6]} />
        <meshStandardMaterial color="#63503e" roughness={1} />
      </mesh>
      {/* Fringe at both ends */}
      {[-2.72, 2.72].map((z) => (
        <mesh key={z} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, -0.4 + z]}>
          <planeGeometry args={[6.3, 0.12]} />
          <meshStandardMaterial color="#7a6450" roughness={1} />
        </mesh>
      ))}

      {/* Ceiling, with joists */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, height, midZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, depth]} />
        <meshStandardMaterial color={C.ceiling} roughness={1} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => backZ + 0.9 + i * 1.5).map((z) => (
        <Box key={z} position={[0, height - 0.06, z]} size={[halfWidth * 2, 0.12, 0.16]} colour="#464d5c" />
      ))}

      {/* Back wall, two-tone with a dado rail — a flat wall reads as a backdrop, a split one as a room */}
      <mesh position={[0, 0.9, backZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, 1.8]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.96} />
      </mesh>
      <mesh position={[0, 3.4, backZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, 3.2]} />
        <meshStandardMaterial color={C.wallUpper} roughness={0.96} />
      </mesh>
      <Box position={[0, 1.8, backZ + 0.06]} size={[halfWidth * 2, 0.12, 0.12]} colour={C.woodDark} />
      <Box position={[0, 0.1, backZ + 0.06]} size={[halfWidth * 2, 0.2, 0.14]} colour={C.skirting} />
      {/* Picture rail near the top, and panelling below the dado */}
      <Box position={[0, 3.9, backZ + 0.05]} size={[halfWidth * 2, 0.07, 0.1]} colour={C.woodDark} />
      {Array.from({ length: 8 }, (_, i) => -5.25 + i * 1.5).map((x) => (
        <Box key={x} position={[x, 0.95, backZ + 0.04]} size={[1.2, 1.3, 0.04]} colour="#565f72" />
      ))}

      {/* Left wall */}
      <mesh rotation={[0, Math.PI / 2, 0]} position={[-halfWidth, height / 2, midZ]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.96} />
      </mesh>
      <Box position={[-halfWidth + 0.07, 0.1, midZ]} size={[0.14, 0.2, depth]} colour={C.skirting} />
      <Box position={[-halfWidth + 0.06, 3.9, midZ]} size={[0.1, 0.07, depth]} colour={C.woodDark} />

      {/* Right wall */}
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[halfWidth, height / 2, midZ]} receiveShadow>
        <planeGeometry args={[depth, height]} />
        <meshStandardMaterial color={C.wallLower} roughness={0.96} />
      </mesh>
      <Box position={[halfWidth - 0.07, 0.1, midZ]} size={[0.14, 0.2, depth]} colour={C.skirting} />
      <Box position={[halfWidth - 0.06, 3.9, midZ]} size={[0.1, 0.07, depth]} colour={C.woodDark} />

      {/* Front wall, behind the spawn — needed now that the player can turn all the way round */}
      <mesh rotation={[0, Math.PI, 0]} position={[0, height / 2, frontZ]} receiveShadow>
        <planeGeometry args={[halfWidth * 2, height]} />
        <meshStandardMaterial color={C.wallUpper} roughness={0.96} />
      </mesh>
      <Box position={[0, 0.1, frontZ - 0.07]} size={[halfWidth * 2, 0.2, 0.14]} colour={C.skirting} />
      <Box position={[0, 3.9, frontZ - 0.05]} size={[halfWidth * 2, 0.07, 0.1]} colour={C.woodDark} />
    </group>
  );
}

/** The message the desk lamp blinks, on a loop, for anyone patient enough to read it. */
const LAMP_MESSAGE = "Welcome to LICET";
/** Seconds per Morse unit. Slow enough to read, fast enough that the loop comes round. */
const LAMP_UNIT_SECONDS = 0.19;

const LAMP_DARK = new Color("#3a2f1e");
const LAMP_LIT = new Color("#ffe9c4");

/**
 * The banker's lamp, blinking Morse.
 *
 * Driven imperatively from useFrame rather than from React state. A blink is a
 * change every few frames; routing that through setState would re-render this
 * subtree for the entire life of the room and buy nothing, since the only
 * things that change are one material colour and one light intensity.
 *
 * The transition is eased rather than switched, because a hard on/off looks
 * like a rendering glitch while a filament that takes a moment to come up and
 * die away reads as a lamp. The easing is fast enough (~40ms to most of the
 * way) that a dot is still plainly a dot.
 *
 * What it says is in @/lib/hunt/morse, with tests. See that file for why the
 * encoding is not just an array of numbers written out by hand here.
 */
function MorseLamp() {
  const bulb = useRef<Mesh>(null);
  const light = useRef<PointLight>(null);
  const level = useRef(0);
  const spans = useMemo(() => toSpans(LAMP_MESSAGE), []);

  useFrame((state, delta) => {
    const on = isOnAt(spans, state.clock.elapsedTime / LAMP_UNIT_SECONDS);
    // Frame-rate independent approach, so the lamp looks the same at 30fps and
    // at 144, and cannot overshoot at a long frame the way a fixed lerp does.
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 26);
    level.current += ((on ? 1 : 0) - level.current) * k;

    const material = bulb.current?.material as MeshBasicMaterial | undefined;
    if (material) material.color.lerpColors(LAMP_DARK, LAMP_LIT, level.current);
    if (light.current) light.current.intensity = 0.5 + level.current * 6.5;
  });

  return (
    <group>
      {/* Base, stem and shade */}
      <Box position={[-1.0, 0.63, -0.3]} size={[0.24, 0.04, 0.24]} colour={C.metalDark} />
      <Box position={[-1.0, 0.66, -0.3]} size={[0.19, 0.03, 0.19]} colour={C.brass} metalness={0.6} roughness={0.35} />
      <mesh position={[-1.0, 0.85, -0.3]} rotation={[0, 0, 0.35]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.44, 8]} />
        <meshStandardMaterial color={C.metalDark} roughness={0.6} metalness={0.4} />
      </mesh>
      <mesh position={[-0.86, 1.03, -0.3]} rotation={[Math.PI, 0, 0.5]} castShadow>
        <coneGeometry args={[0.17, 0.2, 14, 1, true]} />
        <meshStandardMaterial color={C.green} roughness={0.5} metalness={0.3} side={2} />
      </mesh>
      {/* Shade rim, so the cone has an edge rather than fading to nothing */}
      <mesh position={[-0.878, 0.945, -0.3]} rotation={[Math.PI / 2, 0, 0.5]}>
        <torusGeometry args={[0.168, 0.008, 6, 20]} />
        <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
      </mesh>
      {/* Pull chain */}
      <mesh position={[-0.72, 0.86, -0.3]}>
        <cylinderGeometry args={[0.004, 0.004, 0.18, 5]} />
        <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.4} />
      </mesh>

      <mesh ref={bulb} position={[-0.86, 0.94, -0.3]}>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshBasicMaterial color={LAMP_DARK} />
      </mesh>
      <pointLight ref={light} position={[-0.86, 0.9, -0.3]} intensity={0.5} distance={4.5} color="#ffcf8f" />
    </group>
  );
}

/** A typewriter, because a desk with nothing on it is a table. */
function Typewriter() {
  return (
    <group position={[0.05, 0.6, 0.06]} rotation={[0, -0.22, 0]}>
      {/* Body, sloping toward the keys */}
      <Box position={[0, 0.09, -0.06]} size={[0.44, 0.18, 0.3]} colour={C.ink} roughness={0.5} />
      <Box position={[0, 0.05, 0.14]} size={[0.42, 0.06, 0.14]} colour={C.ink} roughness={0.5} />
      {/* Platen and its knobs */}
      <mesh position={[0, 0.21, -0.12]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.035, 0.035, 0.42, 14]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.75} />
      </mesh>
      {[-0.23, 0.23].map((x) => (
        <mesh key={x} position={[x, 0.21, -0.12]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.05, 0.05, 0.03, 12]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.45} />
        </mesh>
      ))}
      {/* A sheet still in it */}
      <Box position={[0, 0.31, -0.14]} size={[0.3, 0.22, 0.004]} colour={C.paper} rotation={[0.22, 0, 0]} />
      {/* Three rows of round keys */}
      {[0, 1, 2].map((row) =>
        Array.from({ length: 9 }, (_, i) => (
          <mesh
            key={`${row}:${i}`}
            position={[-0.16 + i * 0.04, 0.09 + row * 0.018, 0.16 - row * 0.035]}
          >
            <cylinderGeometry args={[0.014, 0.014, 0.012, 8]} />
            <meshStandardMaterial color={row === 2 ? "#d9d2c4" : "#c9c2b4"} roughness={0.6} />
          </mesh>
        ))
      )}
      {/* Carriage return lever */}
      <mesh position={[-0.26, 0.24, -0.1]} rotation={[0, 0, 0.9]}>
        <cylinderGeometry args={[0.008, 0.008, 0.16, 6]} />
        <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/** A candlestick telephone on the corner of the desk. */
function Telephone() {
  return (
    <group position={[0.95, 0.6, -0.3]} rotation={[0, 0.4, 0]}>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.13, 0.04, 16]} />
        <meshStandardMaterial color={C.ink} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.16, 0]} castShadow>
        <cylinderGeometry args={[0.022, 0.035, 0.26, 12]} />
        <meshStandardMaterial color={C.ink} roughness={0.5} />
      </mesh>
      {/* Mouthpiece */}
      <mesh position={[0, 0.3, 0.03]} rotation={[Math.PI / 2.4, 0, 0]}>
        <coneGeometry args={[0.055, 0.08, 14, 1, true]} />
        <meshStandardMaterial color={C.ink} roughness={0.5} side={2} />
      </mesh>
      {/* Handset resting across the cradle */}
      <mesh position={[0, 0.33, -0.04]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.018, 0.018, 0.2, 10]} />
        <meshStandardMaterial color={C.ink} roughness={0.55} />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 0.33, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.035, 0.05, 12]} />
          <meshStandardMaterial color={C.ink} roughness={0.55} />
        </mesh>
      ))}
      {/* Dial */}
      <mesh position={[0, 0.05, 0.1]} rotation={[Math.PI / 2.6, 0, 0]}>
        <torusGeometry args={[0.05, 0.012, 8, 20]} />
        <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Cord, coiled on the desk */}
      {[0.05, 0.09, 0.13].map((r) => (
        <mesh key={r} position={[-0.16, 0.004, 0.14]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r, 0.008, 5, 18]} />
          <meshStandardMaterial color="#1a1d22" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Writing desk, chair, Morse lamp, typewriter, telephone, paperwork.
 *
 * The three drawers in the right-hand pedestal are not drawn here — they open
 * when clicked, so they live in MysteryRoomDrawers.tsx along with the cabinet
 * drawers. What is left here is the carcass they slide into.
 */
function Desk() {
  return (
    <group position={DESK_AT} rotation={[0, DESK_YAW, 0]}>
      {/* Top surface lands at exactly y=0.6 */}
      <Box position={[0, 0.55, 0]} size={[2.6, 0.1, 1.1]} colour={C.wood} />
      {/* Moulded lip along the front edge */}
      <Box position={[0, 0.52, 0.56]} size={[2.6, 0.05, 0.04]} colour={C.woodPale} />
      <Box position={[-1.15, 0.25, 0]} size={[0.12, 0.5, 1.0]} colour={C.woodDark} />
      <Box position={[0.72, 0.25, 0]} size={[0.8, 0.5, 1.0]} colour={C.woodDark} />
      {/* Modesty panel, so the desk is not four legs and a floating slab */}
      <Box position={[-0.25, 0.34, -0.48]} size={[1.9, 0.32, 0.04]} colour={C.woodDark} />
      {/* Dark mouths cut into the pedestal front, one per drawer. Without them
          a drawer slides out and leaves a slab of polished walnut behind it,
          which reads as a sticker peeling off rather than a drawer opening.
          The fronts themselves are in MysteryRoomDrawers.tsx. */}
      {[0.12, 0.3, 0.46].map((y) => (
        <mesh key={y} position={[0.72, y, 0.501]}>
          <planeGeometry args={[0.68, 0.12]} />
          <meshStandardMaterial color="#1d1710" roughness={1} />
        </mesh>
      ))}

      {/* Leather blotter, paperwork, inkwell, pen */}
      <Box position={[-0.5, 0.605, 0.08]} size={[0.78, 0.012, 0.5]} colour="#4a3a30" roughness={1} />
      {[-0.34, 0.34].map((x) => (
        <Box key={x} position={[-0.5 + x, 0.61, 0.08]} size={[0.09, 0.016, 0.5]} colour={C.woodDark} />
      ))}
      <Box position={[-0.55, 0.62, 0.1]} size={[0.5, 0.02, 0.36]} colour={C.paper} rotation={[0, 0.3, 0]} />
      <Box position={[-0.45, 0.64, 0.02]} size={[0.44, 0.02, 0.32]} colour={C.paperAged} rotation={[0, -0.15, 0]} />
      <mesh position={[-0.9, 0.63, 0.22]} castShadow>
        <cylinderGeometry args={[0.045, 0.05, 0.06, 12]} />
        <meshStandardMaterial color="#1b2430" roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh position={[-0.86, 0.7, 0.24]} rotation={[0.5, 0, 0.6]}>
        <cylinderGeometry args={[0.004, 0.012, 0.2, 6]} />
        <meshStandardMaterial color="#c8c2b4" roughness={0.6} />
      </mesh>
      {/* Mug, with a handle */}
      <mesh position={[-0.05, 0.66, -0.32]} castShadow>
        <cylinderGeometry args={[0.07, 0.06, 0.12, 14]} />
        <meshStandardMaterial color={C.paper} roughness={0.5} />
      </mesh>
      <mesh position={[0.03, 0.66, -0.32]} rotation={[0, Math.PI / 2, 0]}>
        <torusGeometry args={[0.04, 0.009, 6, 14]} />
        <meshStandardMaterial color={C.paper} roughness={0.5} />
      </mesh>
      <mesh position={[-0.05, 0.715, -0.32]}>
        <cylinderGeometry args={[0.062, 0.062, 0.005, 14]} />
        <meshStandardMaterial color="#4a3524" roughness={0.3} />
      </mesh>

      <MorseLamp />
      <Typewriter />
      <Telephone />

      {/* Chair, pushed out from the desk */}
      <group position={[-0.7, 0, 1.15]} rotation={[0, -0.35, 0]}>
        <Box position={[0, 0.46, 0]} size={[0.52, 0.07, 0.52]} colour={C.woodPale} />
        {/* Cushion */}
        <Box position={[0, 0.51, 0.01]} size={[0.46, 0.05, 0.44]} colour={C.cloth} roughness={1} />
        <Box position={[0, 0.76, -0.24]} size={[0.5, 0.55, 0.06]} colour={C.woodPale} />
        {/* Spindles in the back */}
        {[-0.16, 0, 0.16].map((x) => (
          <mesh key={x} position={[x, 0.72, -0.21]}>
            <cylinderGeometry args={[0.018, 0.018, 0.42, 8]} />
            <meshStandardMaterial color={C.woodDark} roughness={0.8} />
          </mesh>
        ))}
        {[
          [-0.21, -0.21],
          [0.21, -0.21],
          [-0.21, 0.21],
          [0.21, 0.21],
        ].map(([x, z]) => (
          <Box key={`${x}:${z}`} position={[x, 0.22, z]} size={[0.05, 0.44, 0.05]} colour={C.woodDark} />
        ))}
        {/* Stretchers between the legs */}
        {[-0.21, 0.21].map((z) => (
          <Box key={z} position={[0, 0.14, z]} size={[0.42, 0.035, 0.035]} colour={C.woodDark} />
        ))}
      </group>
    </group>
  );
}

/** Four-shelf bookcase, uneven ledgers, a globe, a card box and floor stacks. */
function Bookcase() {
  const shelfYs = [0.35, 1.065, 1.85, 2.6];
  return (
    <group position={[2.4, 0, -2.9]} rotation={[0, -0.22, 0]}>
      <Box position={[0, 1.55, -0.28]} size={[2.2, 3.1, 0.08]} colour={C.woodDark} />
      <Box position={[-1.06, 1.55, 0]} size={[0.08, 3.1, 0.56]} colour={C.woodDark} />
      <Box position={[1.06, 1.55, 0]} size={[0.08, 3.1, 0.56]} colour={C.woodDark} />
      <Box position={[0, 3.06, 0]} size={[2.2, 0.1, 0.56]} colour={C.wood} />
      {/* Cornice and plinth */}
      <Box position={[0, 3.15, 0.02]} size={[2.34, 0.09, 0.64]} colour={C.woodPale} />
      <Box position={[0, 0.08, 0.02]} size={[2.26, 0.16, 0.6]} colour={C.woodPale} />
      {shelfYs.map((y) => (
        <Box key={y} position={[0, y, 0]} size={[2.04, 0.07, 0.56]} colour={C.wood} />
      ))}
      {/* Shelf edge beading */}
      {shelfYs.map((y) => (
        <Box key={`lip-${y}`} position={[0, y + 0.05, 0.27]} size={[2.04, 0.03, 0.02]} colour={C.woodPale} />
      ))}
      <Ledgers y={0.35} />
      <Ledgers y={1.85} skip />
      <Ledgers y={2.6} />

      {/* Globe on the top shelf */}
      <group position={[0.62, 2.79, 0.02]}>
        <mesh castShadow>
          <sphereGeometry args={[0.16, 18, 18]} />
          <meshStandardMaterial color="#3d6b8a" roughness={0.7} />
        </mesh>
        {/* Suggestion of land masses */}
        {[
          [0.4, 0.6],
          [-0.9, 0.2],
          [2.1, -0.5],
        ].map(([a, b]) => (
          <mesh
            key={`${a}:${b}`}
            position={[Math.cos(b) * Math.sin(a) * 0.161, Math.sin(b) * 0.161, Math.cos(b) * Math.cos(a) * 0.161]}
            rotation={[-b, a, 0]}
          >
            <circleGeometry args={[0.06, 8]} />
            <meshStandardMaterial color="#6b7f52" roughness={0.9} />
          </mesh>
        ))}
        <mesh rotation={[0, 0, 0.4]}>
          <torusGeometry args={[0.19, 0.012, 8, 24]} />
          <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.07, 0.09, 0.03, 12]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.8} />
        </mesh>
      </group>

      {/* Wind-up clock on the second shelf */}
      <group position={[0.7, 1.24, 0.05]} rotation={[0, -0.25, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.07, 20]} />
          <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.11, 0.11, 0.02, 20]} />
          <meshStandardMaterial color={C.paper} roughness={0.9} />
        </mesh>
        {/* Bells and feet */}
        {[-0.11, 0.11].map((x) => (
          <mesh key={x} position={[x, 0.09, 0]}>
            <sphereGeometry args={[0.045, 10, 10]} />
            <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
      </group>

      {/* Books lying flat and leaning, so no shelf is a solid painted block */}
      <Box position={[-0.55, 1.94, 0.04]} size={[0.32, 0.05, 0.24]} colour="#7b4d72" />
      <Box position={[-0.53, 1.99, 0.05]} size={[0.28, 0.04, 0.22]} colour="#47605a" />
      <Box position={[-0.2, 1.99, 0.03]} size={[0.06, 0.34, 0.22]} colour="#8c4a3f" rotation={[0, 0, 0.42]} />

      {/* Card box on the bottom shelf */}
      <group position={[-0.7, 0.52, 0.06]}>
        <Box position={[0, 0, 0]} size={[0.42, 0.2, 0.3]} colour={C.woodDark} />
        <Box position={[0, 0.02, 0.16]} size={[0.2, 0.06, 0.01]} colour={C.paper} />
      </group>

      {/* Stacks of books on the floor beside it — inside the bookcase footprint,
          so they never become something to walk into */}
      {[
        { x: -0.75, z: 0.22, n: 4, tilt: 0.06 },
        { x: 1.0, z: 0.16, n: 3, tilt: -0.09 },
      ].map((stack) => (
        <group key={stack.x} position={[stack.x, 0, stack.z]} rotation={[0, stack.tilt * 4, 0]}>
          {Array.from({ length: stack.n }, (_, i) => (
            <Box
              key={i}
              position={[0, 0.03 + i * 0.055, 0]}
              size={[0.26, 0.05, 0.19]}
              colour={["#8c4a3f", "#3f5b7a", "#6b6b52", "#96683a"][i % 4]}
              rotation={[0, i * stack.tilt, 0]}
            />
          ))}
        </group>
      ))}
    </group>
  );
}

/** A run of book spines along one shelf. */
function Ledgers({ y, skip = false }: { y: number; skip?: boolean }) {
  const spines = useMemo(() => {
    const colours = ["#8c4a3f", "#3f5b7a", "#6b6b52", "#96683a", "#47605a", "#7b4d72"];
    const out: { x: number; h: number; w: number; colour: string; tilt: number }[] = [];
    let x = -0.92;
    let i = 0;
    while (x < 0.9) {
      const w = 0.07 + ((i * 37) % 5) * 0.012;
      const h = 0.42 + ((i * 53) % 7) * 0.02;
      // Leave a gap mid-shelf on the "skip" run, so the shelf does not read as
      // a solid painted block.
      if (!(skip && x > -0.25 && x < 0.35)) {
        out.push({ x: x + w / 2, h, w, colour: colours[i % colours.length], tilt: i % 9 === 0 ? 0.14 : 0 });
      }
      x += w + 0.012;
      i += 1;
    }
    return out;
  }, [skip]);

  return (
    <group>
      {spines.map((s) => (
        <group key={`${y}-${s.x}`}>
          <Box
            position={[s.x, y + 0.04 + s.h / 2, 0.02]}
            size={[s.w, s.h, 0.34]}
            colour={s.colour}
            rotation={[0, 0, s.tilt]}
            roughness={0.95}
          />
          {/* Gilt band on the spine — the detail that makes a coloured box a book */}
          <mesh position={[s.x, y + 0.04 + s.h * 0.78, 0.191]} rotation={[0, 0, s.tilt]}>
            <planeGeometry args={[s.w * 0.62, 0.018]} />
            <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.45} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** A slatted crate, built as a frame rather than a solid cube. */
function Crate({
  position,
  rotation = 0,
  size = 0.7,
  colour = C.wood,
}: {
  position: [number, number, number];
  rotation?: number;
  size?: number;
  colour?: string;
}) {
  const h = size;
  const t = size * 0.07;
  const half = size / 2;
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Corner posts */}
      {[
        [-half + t / 2, -half + t / 2],
        [half - t / 2, -half + t / 2],
        [-half + t / 2, half - t / 2],
        [half - t / 2, half - t / 2],
      ].map(([x, z]) => (
        <Box key={`${x}:${z}`} position={[x, h / 2, z]} size={[t, h, t]} colour={C.woodDark} />
      ))}
      {/* Slats on all four sides */}
      {[-half + t / 2, 0, half - t / 2].map((y) =>
        [
          { p: [0, y + h / 2, -half + t / 2] as [number, number, number], s: [size, t * 1.6, t] as [number, number, number] },
          { p: [0, y + h / 2, half - t / 2] as [number, number, number], s: [size, t * 1.6, t] as [number, number, number] },
          { p: [-half + t / 2, y + h / 2, 0] as [number, number, number], s: [t, t * 1.6, size] as [number, number, number] },
          { p: [half - t / 2, y + h / 2, 0] as [number, number, number], s: [t, t * 1.6, size] as [number, number, number] },
        ].map((slat) => (
          <Box key={`${y}:${slat.p.join()}`} position={slat.p} size={slat.s} colour={colour} />
        ))
      )}
      {/* Lid, with a stencilled band */}
      <Box position={[0, h, 0]} size={[size + t, t * 1.4, size + t]} colour={C.woodDark} />
      <mesh position={[0, h + t * 0.75, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[size * 0.5, size * 0.16]} />
        <meshStandardMaterial color="#3a3129" roughness={1} />
      </mesh>
    </group>
  );
}

/**
 * Crates, an open barrel, a pallet and a rope coil in the near-left corner.
 *
 * Pushed left of the room's centre line on purpose: parked in the middle it
 * sat a metre and a half from the spawn point and filled the opening view,
 * which is the first thing anyone sees of the puzzle.
 */
function Storage() {
  return (
    <group position={[-2.6, 0, 1.9]}>
      {/* Pallet the satchel prop rests on: its top face is y=0.1 */}
      <Box position={[0, 0.05, 0]} size={[1.5, 0.1, 1.2]} colour={C.woodDark} />
      {[-0.55, 0, 0.55].map((z) => (
        <Box key={z} position={[0, 0.11, z]} size={[1.45, 0.03, 0.22]} colour={C.woodPale} />
      ))}
      {[-0.6, 0, 0.6].map((x) => (
        <Box key={x} position={[x, 0.02, 0]} size={[0.14, 0.04, 1.18]} colour={C.woodDark} />
      ))}

      <Crate position={[1.2, 0, -0.35]} rotation={0.42} size={0.72} />
      <Crate position={[1.15, 0.79, -0.3]} rotation={-0.2} size={0.5} colour={C.woodPale} />
      <Crate position={[-1.3, 0, 0.25]} rotation={-0.3} size={0.62} colour={C.woodPale} />

      {/* Barrel, open at the top with sacking stuffed in it */}
      <group position={[-1.35, 0, -0.8]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.34, 0.31, 0.84, 18, 1, true]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.9} side={2} />
        </mesh>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.31, 18]} />
          <meshStandardMaterial color="#4a3524" roughness={1} />
        </mesh>
        {[0.16, 0.42, 0.68, 0.83].map((y) => (
          <mesh key={y} position={[0, y, 0]}>
            <torusGeometry args={[0.335, 0.02, 6, 20]} />
            <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.4} />
          </mesh>
        ))}
        {/* Sacking */}
        {[
          [0.0, 0.0, 0.2],
          [0.14, 0.1, 0.15],
          [-0.12, -0.08, 0.13],
        ].map(([x, z, r]) => (
          <mesh key={`${x}:${z}`} position={[x, 0.72, z]} castShadow>
            <sphereGeometry args={[r, 10, 8]} />
            <meshStandardMaterial color="#8b7a5e" roughness={1} />
          </mesh>
        ))}
      </group>

      {/* Coil of rope */}
      <group position={[0.15, 0, 0.44]}>
        {[0.2, 0.15, 0.1].map((r, i) => (
          <mesh key={r} position={[0, 0.13 + i * 0.05, 0]} rotation={[Math.PI / 2, 0, i * 0.4]}>
            <torusGeometry args={[r, 0.026, 6, 22]} />
            <meshStandardMaterial color="#9a8462" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/**
 * Filing cabinets along the left wall.
 *
 * Nine drawers, all of which open when clicked — they are in
 * MysteryRoomDrawers.tsx, since they have pointer handlers and nothing in this
 * file may. What stays here is the carcasses, the dark mouths the drawers
 * slide out of, and the boxes stacked on top.
 *
 * The middle cabinet's top drawer starts open. It used to be where the blue
 * gel sat; it now holds nothing that matters and stands open purely as a
 * decoy, because the obvious hiding place being obviously empty is what sends
 * a player looking upward — which is where the book actually is (see
 * MysteryRoomTools.tsx).
 */
function FilingCabinets() {
  return (
    <group position={CABINETS_AT} rotation={[0, CABINETS_YAW, 0]}>
      {[-1.3, 0, 1.3].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <Box position={[0, 0.8, 0]} size={[1.4, 1.6, 1.15]} colour={C.metal} metalness={0.35} roughness={0.55} />
          {/* Plinth, so the carcass is not sunk into the floor */}
          <Box position={[0, 0.03, 0]} size={[1.32, 0.06, 1.08]} colour={C.metalDark} />
          {/* Drawer mouths */}
          {[0.35, 0.8, 1.25].map((y) => (
            <mesh key={y} position={[0.701, y, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[1.02, 0.38]} />
              <meshStandardMaterial color="#1b1f26" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Boxes of files stacked on top. The gap between them is where the book
          sits — see BOOK_HOME in MysteryRoomTools.tsx. */}
      <Box position={[0, 1.78, -1.3]} size={[0.9, 0.36, 0.7]} colour={C.paperAged} rotation={[0, 0.3, 0]} roughness={1} />
      <Box position={[0, 1.97, -1.3]} size={[0.94, 0.04, 0.74]} colour="#c9bc9e" rotation={[0, 0.3, 0]} roughness={1} />
      <Box position={[0.1, 1.76, 1.2]} size={[0.8, 0.32, 0.6]} colour={C.woodDark} rotation={[0, -0.2, 0]} />
      <Box position={[0.05, 1.96, 1.24]} size={[0.6, 0.08, 0.45]} colour={C.paper} rotation={[0, -0.1, 0]} />
      {/* A dead pot plant on the far end, because every office has one */}
      <group position={[-0.1, 1.6, 1.9]}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.08, 0.2, 12]} />
          <meshStandardMaterial color="#8a5a44" roughness={0.9} />
        </mesh>
        {[0.4, 2.1, 4.0].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.04, 0.3, Math.sin(a) * 0.04]} rotation={[0.5, a, 0.4]}>
            <cylinderGeometry args={[0.004, 0.012, 0.26, 5]} />
            <meshStandardMaterial color="#6b6047" roughness={1} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Metal table, CRT terminal, tape deck, punch cards, cable runs. */
function TerminalDesk() {
  return (
    <group position={[0.2, 0, -4.3]}>
      {/* Top surface lands at exactly y=0.7 */}
      <Box position={[0, 0.66, 0]} size={[2.4, 0.08, 1.0]} colour={C.metalDark} />
      <Box position={[-1.08, 0.31, 0]} size={[0.08, 0.62, 0.9]} colour={C.metal} />
      <Box position={[1.08, 0.31, 0]} size={[0.08, 0.62, 0.9]} colour={C.metal} />
      <Box position={[0, 0.16, -0.4]} size={[2.2, 0.06, 0.2]} colour={C.metal} />
      {/* Cross-brace and levelling feet */}
      <Box position={[0, 0.58, -0.42]} size={[2.2, 0.05, 0.05]} colour={C.metal} />
      {[-1.08, 1.08].map((x) =>
        [-0.4, 0.4].map((z) => (
          <mesh key={`${x}:${z}`} position={[x, 0.02, z]}>
            <cylinderGeometry args={[0.04, 0.05, 0.04, 10]} />
            <meshStandardMaterial color={C.ink} roughness={0.9} />
          </mesh>
        ))
      )}

      <group position={[-0.8, 0.7, -0.05]} rotation={[0, 0.5, 0]}>
        <Box position={[0, 0.34, 0]} size={[0.78, 0.66, 0.66]} colour={C.metalDark} />
        <Box position={[0, 0.34, 0.34]} size={[0.7, 0.58, 0.04]} colour="#20262c" />
        {/* Vent slots in the top of the casing */}
        {[-0.18, -0.06, 0.06, 0.18].map((z) => (
          <Box key={z} position={[0, 0.68, z]} size={[0.5, 0.01, 0.03]} colour="#171b20" />
        ))}
        <mesh position={[0, 0.36, 0.37]}>
          <planeGeometry args={[0.58, 0.44]} />
          <meshStandardMaterial color={C.screen} emissive={C.screen} emissiveIntensity={1.1} roughness={0.4} />
        </mesh>
        {/* Scanlines */}
        {[-0.14, -0.07, 0, 0.07, 0.14].map((y) => (
          <mesh key={y} position={[0, 0.36 + y, 0.375]}>
            <planeGeometry args={[0.5, 0.012]} />
            <meshBasicMaterial color="#0d3f38" />
          </mesh>
        ))}
        {/* Bezel controls */}
        {[-0.22, -0.14].map((x) => (
          <mesh key={x} position={[x, 0.06, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.02, 10]} />
            <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {/* The terminal's screen glow was a real point light. It is not any
            more: the screen face is already a `meshBasicMaterial`, so it is
            self-lit and reads as switched on regardless, and a 3m light thrown
            into the room off a monitor was a whole per-fragment light in every
            material's shader in exchange for a faint teal smear on one desk. */}
        <Box position={[0, 0.02, 0.62]} size={[0.72, 0.05, 0.26]} colour={C.metal} />
        {/* Keys on the keyboard slab */}
        {[0, 1, 2, 3].map((row) =>
          Array.from({ length: 12 }, (_, i) => (
            <Box
              key={`${row}:${i}`}
              position={[-0.31 + i * 0.056, 0.05, 0.55 + row * 0.045]}
              size={[0.04, 0.012, 0.033]}
              colour="#39414a"
            />
          ))
        )}
        {/* Cable from the CRT down the back of the table */}
        <mesh position={[0, -0.3, -0.3]} rotation={[0.2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.7, 6]} />
          <meshStandardMaterial color="#22262c" roughness={0.9} />
        </mesh>
      </group>

      {/* Tape deck: two reels behind glass */}
      <group position={[0.15, 0.7, -0.2]} rotation={[0, -0.15, 0]}>
        <Box position={[0, 0.16, 0]} size={[0.5, 0.32, 0.3]} colour={C.enamel} roughness={0.5} />
        {[-0.11, 0.11].map((x) => (
          <group key={x} position={[x, 0.2, 0.16]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.075, 0.075, 0.015, 16]} />
              <meshStandardMaterial color="#5a5f68" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0.008]}>
              <cylinderGeometry args={[0.055, 0.055, 0.012, 16]} />
              <meshStandardMaterial color="#2b2f36" roughness={0.8} />
            </mesh>
          </group>
        ))}
        {[-0.15, -0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, 0.05, 0.16]}>
            <cylinderGeometry args={[0.012, 0.012, 0.01, 8]} />
            <meshStandardMaterial
              color={x === -0.15 ? "#c8352f" : "#3f7bff"}
              emissive={x === -0.15 ? "#c8352f" : "#1f4fbf"}
              emissiveIntensity={0.8}
            />
          </mesh>
        ))}
      </group>

      {/* Card index box on the other end */}
      <group position={[0.85, 0.7, 0.28]} rotation={[0, -0.3, 0]}>
        <Box position={[0, 0.11, 0]} size={[0.5, 0.22, 0.34]} colour={C.woodDark} />
        {[-0.09, -0.03, 0.03, 0.09].map((z) => (
          <Box key={z} position={[0, 0.24, z]} size={[0.42, 0.06, 0.02]} colour={C.paper} rotation={[0.12, 0, 0]} />
        ))}
      </group>
      {/* A spilled fan of punch cards */}
      {[0, 1, 2, 3, 4].map((i) => (
        <Box
          key={i}
          position={[0.5 - i * 0.05, 0.71 + i * 0.004, 0.02 + i * 0.03]}
          size={[0.19, 0.003, 0.08]}
          colour={i % 2 ? C.paperAged : C.paper}
          rotation={[0, 0.3 + i * 0.14, 0]}
        />
      ))}
    </group>
  );
}

/** Door on the back wall, closed, with light spilling underneath. */
function Doorway() {
  return (
    <group position={[-4.3, 0, ROOM.backZ + 0.08]}>
      <Box position={[0, 1.15, 0]} size={[1.3, 2.3, 0.1]} colour={C.woodDark} />
      {/* Panelled, not a slab */}
      {[
        [0, 1.72],
        [0, 0.72],
      ].map(([x, y]) => (
        <Box key={y} position={[x, y, 0.06]} size={[0.9, 0.8, 0.03]} colour={C.wood} />
      ))}
      <Box position={[0, 2.36, 0.02]} size={[1.5, 0.12, 0.16]} colour={C.woodPale} />
      <Box position={[-0.72, 1.2, 0.02]} size={[0.14, 2.5, 0.16]} colour={C.woodPale} />
      <Box position={[0.72, 1.2, 0.02]} size={[0.14, 2.5, 0.16]} colour={C.woodPale} />
      <mesh position={[0.48, 1.05, 0.1]} castShadow>
        <sphereGeometry args={[0.07, 12, 12]} />
        <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.3} />
      </mesh>
      {/* Escutcheon, hinges and a letter slot */}
      <Box position={[0.48, 0.88, 0.07]} size={[0.07, 0.12, 0.02]} colour={C.brass} metalness={0.7} roughness={0.35} />
      {[0.45, 1.15, 1.95].map((y) => (
        <Box key={y} position={[-0.63, y, 0.06]} size={[0.06, 0.16, 0.03]} colour={C.brass} metalness={0.7} roughness={0.4} />
      ))}
      <Box position={[0, 1.24, 0.07]} size={[0.5, 0.06, 0.02]} colour={C.brass} metalness={0.65} roughness={0.4} />
      {/* Light under the door — somewhere else exists, which makes this a room and not a box */}
      <mesh position={[0, 0.03, 0.12]}>
        <planeGeometry args={[1.2, 0.06]} />
        <meshBasicMaterial color="#ffd9a0" />
      </mesh>
      {/* Key hooks beside the frame */}
      <group position={[1.15, 1.5, 0.04]}>
        <Box position={[0, 0, 0]} size={[0.3, 0.22, 0.03]} colour={C.woodDark} />
        {[-0.09, 0, 0.09].map((x) => (
          <mesh key={x} position={[x, -0.04, 0.03]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.006, 0.006, 0.05, 6]} />
            <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
          </mesh>
        ))}
        <Box position={[-0.09, -0.11, 0.04]} size={[0.03, 0.09, 0.008]} colour={C.brass} metalness={0.7} roughness={0.4} />
      </group>
      {/* Light switch */}
      <group position={[1.15, 1.15, 0.03]}>
        <Box position={[0, 0, 0]} size={[0.11, 0.13, 0.02]} colour="#d8d2c4" />
        <Box position={[0, 0.01, 0.02]} size={[0.04, 0.05, 0.015]} colour="#b8b2a4" />
      </group>
    </group>
  );
}

/** Tall window on the left wall with night outside, curtains and a sill. */
function Window() {
  return (
    <group position={[-ROOM.halfWidth + 0.09, 2.3, 1.6]} rotation={[0, Math.PI / 2, 0]}>
      <Box position={[0, 0, -0.05]} size={[2.2, 2.6, 0.08]} colour="#121722" />
      {/* Glass */}
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[2.0, 2.4]} />
        <meshStandardMaterial color={C.glass} emissive="#2c4a6b" emissiveIntensity={0.55} roughness={0.25} />
      </mesh>
      {/* Rain streaks on the outside */}
      {Array.from({ length: 14 }, (_, i) => (
        <mesh key={i} position={[-0.9 + i * 0.14, ((i * 37) % 9) * 0.2 - 0.8, 0.005]} rotation={[0, 0, 0.06]}>
          <planeGeometry args={[0.012, 0.3 + ((i * 53) % 5) * 0.12]} />
          <meshBasicMaterial color="#b6cfe0" transparent opacity={0.2} />
        </mesh>
      ))}
      {/* Frame and glazing bars */}
      <Box position={[0, 1.34, 0.03]} size={[2.36, 0.16, 0.14]} colour={C.woodPale} />
      <Box position={[0, -1.34, 0.03]} size={[2.36, 0.16, 0.18]} colour={C.woodPale} />
      <Box position={[-1.1, 0, 0.03]} size={[0.16, 2.84, 0.14]} colour={C.woodPale} />
      <Box position={[1.1, 0, 0.03]} size={[0.16, 2.84, 0.14]} colour={C.woodPale} />
      <Box position={[0, 0, 0.04]} size={[0.08, 2.4, 0.06]} colour={C.woodPale} />
      <Box position={[0, 0, 0.04]} size={[2.0, 0.08, 0.06]} colour={C.woodPale} />
      {/* Sill, with a jar and a stone on it */}
      <Box position={[0, -1.44, 0.12]} size={[2.5, 0.08, 0.3]} colour={C.woodPale} />
      <mesh position={[-0.75, -1.28, 0.14]} castShadow>
        <cylinderGeometry args={[0.07, 0.07, 0.22, 12]} />
        <meshStandardMaterial color={C.jar} transparent opacity={0.55} roughness={0.15} />
      </mesh>
      <mesh position={[0.8, -1.34, 0.14]} castShadow>
        <dodecahedronGeometry args={[0.09, 0]} />
        <meshStandardMaterial color="#6b6e75" roughness={0.95} />
      </mesh>
      {/* Curtains, drawn back to either side */}
      {[-1.42, 1.42].map((x) => (
        <group key={x} position={[x, 0.06, 0.16]}>
          {[-0.13, 0, 0.13].map((o) => (
            <mesh key={o} position={[o * 0.6, 0, o * 0.5]} castShadow>
              <cylinderGeometry args={[0.09, 0.12, 2.6, 8]} />
              <meshStandardMaterial color={C.cloth} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Curtain pole */}
      <mesh position={[0, 1.52, 0.16]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 3.0, 10]} />
        <meshStandardMaterial color={C.woodDark} roughness={0.7} />
      </mesh>
      {[-1.5, 1.5].map((x) => (
        <mesh key={x} position={[x, 1.52, 0.16]} rotation={[0, 0, Math.PI / 2]}>
          <sphereGeometry args={[0.055, 10, 10]} />
          <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * A pot-bellied stove with its flue.
 *
 * It earns its place twice over: it fills the back-right corner, which was
 * bare floor, and its firebox is the room's one warm light at floor level —
 * which matters more now the ceiling lamps have been taken down a notch.
 */
function Stove() {
  return (
    <group position={[-2.2, 0, -5.45]} rotation={[0, 0.25, 0]}>
      {/* Legs */}
      {[0.6, 2.0, 3.5, 4.9].map((a) => (
        <mesh key={a} position={[Math.cos(a) * 0.3, 0.11, Math.sin(a) * 0.3]} rotation={[0.12, 0, 0.12]}>
          <cylinderGeometry args={[0.03, 0.045, 0.22, 8]} />
          <meshStandardMaterial color={C.ink} roughness={0.7} metalness={0.3} />
        </mesh>
      ))}
      {/* Belly */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <sphereGeometry args={[0.42, 18, 14]} />
        <meshStandardMaterial color={C.enamel} roughness={0.6} metalness={0.35} />
      </mesh>
      <mesh position={[0, 0.9, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.36, 0.3, 18]} />
        <meshStandardMaterial color={C.enamel} roughness={0.6} metalness={0.35} />
      </mesh>
      <mesh position={[0, 1.07, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 0.05, 18]} />
        <meshStandardMaterial color={C.ink} roughness={0.55} metalness={0.4} />
      </mesh>
      {/* Firebox door, ajar, with the fire behind it */}
      <mesh position={[0, 0.5, 0.4]} rotation={[0, 0.5, 0]}>
        <circleGeometry args={[0.17, 16]} />
        <meshStandardMaterial color={C.rust} roughness={0.8} metalness={0.25} side={2} />
      </mesh>
      <mesh position={[0, 0.5, 0.415]}>
        <circleGeometry args={[0.14, 16]} />
        <meshBasicMaterial color="#ff7a2f" />
      </mesh>
      {[0.06, -0.05].map((y) => (
        <mesh key={y} position={[y * 1.4, 0.5 + y, 0.42]}>
          <planeGeometry args={[0.2, 0.02]} />
          <meshBasicMaterial color={C.ink} />
        </mesh>
      ))}
      <pointLight position={[0, 0.5, 0.55]} intensity={5} distance={4.5} decay={2} color="#ff9440" />
      {/* Flue, up and into the ceiling */}
      <mesh position={[0, 2.05, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 1.9, 12]} />
        <meshStandardMaterial color={C.ink} roughness={0.7} metalness={0.35} />
      </mesh>
      {[1.3, 2.4].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[0.125, 0.125, 0.06, 12]} />
          <meshStandardMaterial color={C.metalDark} roughness={0.6} metalness={0.45} />
        </mesh>
      ))}
      {/* Carries on into the ceiling — a flue that stops in mid-air says the
          room has no outside. */}
      <mesh position={[0, 4.05, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.11, 2.1, 12]} />
        <meshStandardMaterial color={C.ink} roughness={0.7} metalness={0.35} />
      </mesh>
      {/* Coal scuttle beside it */}
      <group position={[0.62, 0, 0.15]} rotation={[0, 0.7, 0]}>
        <mesh position={[0, 0.16, 0]} castShadow>
          <cylinderGeometry args={[0.2, 0.14, 0.32, 12]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.55} />
        </mesh>
        {[
          [0.05, 0.03],
          [-0.04, 0.06],
          [0.02, -0.06],
        ].map(([x, z]) => (
          <mesh key={`${x}:${z}`} position={[x, 0.33, z]}>
            <dodecahedronGeometry args={[0.05, 0]} />
            <meshStandardMaterial color="#1a1a1e" roughness={0.95} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A banded steamer trunk against the front wall. */
function Trunk() {
  return (
    <group position={[2.9, 0, 3.5]} rotation={[0, 0.16, 0]}>
      <Box position={[0, 0.26, 0]} size={[1.3, 0.52, 0.72]} colour="#5c4230" />
      {/* Domed lid */}
      <mesh position={[0, 0.52, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, 1.3, 16, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#5c4230" roughness={0.85} />
      </mesh>
      {/* Straps and corner caps */}
      {[-0.42, 0.42].map((x) => (
        <group key={x}>
          <Box position={[x, 0.26, 0]} size={[0.09, 0.54, 0.74]} colour={C.woodDark} />
          <Box position={[x, 0.53, 0]} size={[0.09, 0.36, 0.76]} colour={C.woodDark} />
        </group>
      ))}
      <Box position={[0, 0.51, 0]} size={[1.32, 0.05, 0.74]} colour={C.metalDark} metalness={0.5} roughness={0.5} />
      {/* Latches and a leather handle */}
      {[-0.28, 0.28].map((x) => (
        <Box key={x} position={[x, 0.46, 0.37]} size={[0.1, 0.12, 0.03]} colour={C.brass} metalness={0.7} roughness={0.35} />
      ))}
      <mesh position={[0.68, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.09, 0.018, 6, 14, Math.PI]} />
        <meshStandardMaterial color="#4a3524" roughness={0.9} />
      </mesh>
      {/* Shipping labels */}
      {[
        [-0.18, 0.3, 0.1],
        [0.14, 0.18, -0.24],
      ].map(([x, y, r]) => (
        <mesh key={x} position={[x, y, 0.362]} rotation={[0, 0, r]}>
          <planeGeometry args={[0.22, 0.16]} />
          <meshStandardMaterial color={C.paperAged} roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** A sack barrow parked against the front wall. */
function SackBarrow() {
  return (
    <group position={[1.2, 0, 3.85]} rotation={[0, 0.25, 0]}>
      {/* Frame, leaning back against the wall */}
      <group rotation={[0.16, 0, 0]}>
        {[-0.22, 0.22].map((x) => (
          <mesh key={x} position={[x, 0.62, 0]} castShadow>
            <boxGeometry args={[0.05, 1.24, 0.05]} />
            <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        {[0.3, 0.75, 1.18].map((y) => (
          <Box key={y} position={[0, y, 0]} size={[0.44, 0.04, 0.04]} colour={C.metalDark} metalness={0.5} />
        ))}
        {/* Toe plate */}
        <Box position={[0, 0.06, 0.14]} size={[0.46, 0.03, 0.26]} colour={C.metal} metalness={0.5} roughness={0.5} />
      </group>
      {/* Wheels */}
      {[-0.27, 0.27].map((x) => (
        <mesh key={x} position={[x, 0.14, -0.06]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.14, 0.14, 0.06, 14]} />
          <meshStandardMaterial color="#25282e" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

/** A bracket shelf of preserving jars, high on the back wall. */
function JarShelf() {
  return (
    <group position={[-1.4, 2.35, ROOM.backZ + 0.18]}>
      <Box position={[0, 0, 0]} size={[1.7, 0.06, 0.28]} colour={C.wood} />
      {[-0.7, 0.7].map((x) => (
        <mesh key={x} position={[x, -0.12, -0.02]} rotation={[0, 0, Math.PI / 4]}>
          <boxGeometry args={[0.04, 0.24, 0.04]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.4} roughness={0.6} />
        </mesh>
      ))}
      {[
        { x: -0.6, r: 0.08, h: 0.24, fill: "#7a6a4a" },
        { x: -0.3, r: 0.07, h: 0.18, fill: "#5b6f52" },
        { x: 0.02, r: 0.09, h: 0.26, fill: "#6b5340" },
        { x: 0.34, r: 0.065, h: 0.16, fill: "#4d5f6b" },
        { x: 0.62, r: 0.08, h: 0.22, fill: "#6a5a6b" },
      ].map((j) => (
        <group key={j.x} position={[j.x, 0.03 + j.h / 2, 0]}>
          <mesh castShadow>
            <cylinderGeometry args={[j.r, j.r, j.h, 12]} />
            <meshStandardMaterial color={C.jar} transparent opacity={0.42} roughness={0.12} />
          </mesh>
          <mesh position={[0, -j.h * 0.22, 0]}>
            <cylinderGeometry args={[j.r * 0.88, j.r * 0.88, j.h * 0.5, 12]} />
            <meshStandardMaterial color={j.fill} roughness={0.9} />
          </mesh>
          <mesh position={[0, j.h / 2 + 0.012, 0]}>
            <cylinderGeometry args={[j.r * 0.9, j.r * 0.9, 0.03, 12]} />
            <meshStandardMaterial color={C.brass} metalness={0.5} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/** Radiator, potted plant, coat stand, step ladder, wastebasket, newspapers. */
function Clutter() {
  return (
    <group>
      {/* Radiator on the right wall, with its valve and pipe */}
      <group position={[ROOM.halfWidth - 0.22, 0.5, 2.3]}>
        {Array.from({ length: 9 }, (_, i) => (
          <mesh key={i} position={[0, 0, -0.6 + i * 0.15]} castShadow>
            <boxGeometry args={[0.14, 0.8, 0.1]} />
            <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} />
          </mesh>
        ))}
        <Box position={[0, 0.44, 0]} size={[0.16, 0.06, 1.4]} colour={C.metal} metalness={0.5} />
        <Box position={[0, -0.44, 0]} size={[0.16, 0.06, 1.4]} colour={C.metal} metalness={0.5} />
        <mesh position={[0.02, -0.3, -0.7]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.4, 8]} />
          <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.45} />
        </mesh>
        <mesh position={[0.02, -0.06, -0.7]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
        </mesh>
      </group>

      {/* Potted plant */}
      <group position={[5.2, 0, 2.0]}>
        <mesh position={[0, 0.26, 0]} castShadow>
          <cylinderGeometry args={[0.3, 0.22, 0.52, 16]} />
          <meshStandardMaterial color="#8a5a44" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.33, 0.33, 0.07, 16]} />
          <meshStandardMaterial color="#7d4f3c" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.53, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.05, 16]} />
          <meshStandardMaterial color="#2f2a22" roughness={1} />
        </mesh>
        {Array.from({ length: 9 }, (_, i) => {
          const a = (i / 9) * Math.PI * 2;
          const lean = 0.4 + (i % 3) * 0.18;
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.16, 0.9 + (i % 3) * 0.1, Math.sin(a) * 0.16]}
              rotation={[Math.cos(a) * lean, a, Math.sin(a) * lean]}
              castShadow
            >
              <coneGeometry args={[0.11, 0.8 + (i % 2) * 0.2, 5]} />
              <meshStandardMaterial color={i % 3 === 0 ? "#4e7d5c" : C.green} roughness={0.8} />
            </mesh>
          );
        })}
      </group>

      {/* Coat stand, with a coat, a hat and an umbrella */}
      <group position={[-5.1, 0, 2.8]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.8, 10]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.34, 0.38, 0.1, 14]} />
          <meshStandardMaterial color={C.woodDark} roughness={0.85} />
        </mesh>
        {[0, 1.6, 3.1, 4.7].map((a) => (
          <mesh key={a} position={[Math.cos(a) * 0.16, 1.72, Math.sin(a) * 0.16]} rotation={[0, -a, 0.7]}>
            <cylinderGeometry args={[0.025, 0.025, 0.3, 8]} />
            <meshStandardMaterial color={C.woodDark} />
          </mesh>
        ))}
        {/* A coat hanging on it, with shoulders and a collar */}
        <Box position={[0.14, 1.15, 0.1]} size={[0.4, 1.0, 0.22]} colour="#3f4a5c" roughness={1} />
        <mesh position={[0.14, 1.62, 0.1]} rotation={[0, 0, 0]}>
          <cylinderGeometry args={[0.06, 0.21, 0.16, 10]} />
          <meshStandardMaterial color="#3f4a5c" roughness={1} />
        </mesh>
        <Box position={[0.14, 1.68, 0.1]} size={[0.2, 0.06, 0.2]} colour="#333d4c" roughness={1} />
        {/* Hat on the top hook */}
        <group position={[-0.15, 1.78, -0.02]} rotation={[0.2, 0, 0.15]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.13, 0.14, 0.03, 14]} />
            <meshStandardMaterial color="#43382f" roughness={0.95} />
          </mesh>
          <mesh position={[0, 0.06, 0]}>
            <cylinderGeometry args={[0.085, 0.09, 0.11, 14]} />
            <meshStandardMaterial color="#43382f" roughness={0.95} />
          </mesh>
        </group>
        {/* Umbrella leaning in the base */}
        <group position={[0.2, 0, 0.18]} rotation={[0.14, 0, -0.1]}>
          <mesh position={[0, 0.44, 0]} castShadow>
            <cylinderGeometry args={[0.035, 0.02, 0.88, 8]} />
            <meshStandardMaterial color="#2f3a4a" roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.94, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.05, 0.012, 6, 12, Math.PI]} />
            <meshStandardMaterial color={C.woodDark} roughness={0.8} />
          </mesh>
        </group>
      </group>

      {/* Step ladder folded into the back-right corner */}
      <group position={[4.7, 0, -5.3]} rotation={[0, 2.5, 0]}>
        {[-0.28, 0.28].map((x) => (
          <mesh key={x} position={[x, 0.9, 0]} rotation={[0.12, 0, 0]} castShadow>
            <boxGeometry args={[0.08, 1.8, 0.08]} />
            <meshStandardMaterial color={C.woodPale} roughness={0.85} />
          </mesh>
        ))}
        {[0.3, 0.7, 1.1, 1.5].map((y) => (
          <Box key={y} position={[0, y, y * 0.12 - 0.11]} size={[0.62, 0.05, 0.2]} colour={C.wood} />
        ))}
        {/* Back legs and the spreader between them */}
        {[-0.24, 0.24].map((x) => (
          <mesh key={`b${x}`} position={[x, 0.86, -0.3]} rotation={[-0.2, 0, 0]} castShadow>
            <boxGeometry args={[0.06, 1.76, 0.06]} />
            <meshStandardMaterial color={C.woodPale} roughness={0.85} />
          </mesh>
        ))}
        <mesh position={[0.28, 0.9, -0.16]} rotation={[0, 0, 0.5]}>
          <cylinderGeometry args={[0.01, 0.01, 0.36, 6]} />
          <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Paint tin on the top step */}
        <mesh position={[0, 1.6, -0.1]} castShadow>
          <cylinderGeometry args={[0.09, 0.09, 0.14, 12]} />
          <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} />
        </mesh>
      </group>

      {/* Wastebasket and dropped newspapers near the desk */}
      <group position={[-3.9, 0, -2.0]}>
        <mesh position={[0, 0.2, 0]} castShadow>
          <cylinderGeometry args={[0.22, 0.17, 0.4, 12, 1, true]} />
          <meshStandardMaterial color={C.metalDark} metalness={0.4} roughness={0.6} side={2} />
        </mesh>
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.17, 12]} />
          <meshStandardMaterial color={C.ink} roughness={0.9} />
        </mesh>
        {[
          [0.06, 0.04],
          [-0.05, -0.03],
          [0.0, 0.09],
        ].map(([x, z]) => (
          <mesh key={`${x}:${z}`} position={[x, 0.36, z]} castShadow>
            <dodecahedronGeometry args={[0.07, 0]} />
            <meshStandardMaterial color={C.paperAged} roughness={1} />
          </mesh>
        ))}
      </group>
      <Box position={[-3.55, 0.03, -1.35]} size={[0.5, 0.05, 0.36]} colour={C.paperAged} rotation={[0, 0.5, 0]} />
      <Box position={[-3.45, 0.08, -1.3]} size={[0.46, 0.04, 0.34]} colour={C.paper} rotation={[0, 0.2, 0]} />
      <mesh position={[-3.45, 0.11, -1.3]} rotation={[-Math.PI / 2, 0, 0.2]}>
        <planeGeometry args={[0.3, 0.06]} />
        <meshStandardMaterial color="#8f8878" roughness={1} />
      </mesh>
    </group>
  );
}

/** The ceiling fan, turning slowly. */
function CeilingFan() {
  const blades = useRef<Group>(null);
  useFrame((_state, delta) => {
    if (blades.current) blades.current.rotation.y += delta * 0.55;
  });

  return (
    <group position={[0, 0, 1.0]}>
      <mesh position={[0, 4.78, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 0.44, 8]} />
        <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
      </mesh>
      <mesh position={[0, 4.54, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.16, 0.14, 14]} />
        <meshStandardMaterial color={C.woodDark} roughness={0.6} metalness={0.2} />
      </mesh>
      <group ref={blades} position={[0, 4.46, 0]}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, a, 0]}>
              <Box position={[0.16, 0, 0]} size={[0.16, 0.02, 0.06]} colour={C.metalDark} metalness={0.5} />
              <Box position={[0.62, -0.01, 0]} size={[0.78, 0.02, 0.24]} colour="#7a6248" rotation={[0.1, 0, 0]} />
            </group>
          );
        })}
      </group>
      {/* Pull cord */}
      <mesh position={[0, 4.3, 0]}>
        <cylinderGeometry args={[0.004, 0.004, 0.32, 5]} />
        <meshStandardMaterial color="#b8ad96" roughness={0.9} />
      </mesh>
    </group>
  );
}

/**
 * Ceiling lamps, pipes, fuse box, framed notices.
 *
 * The wall clock used to live here. It is now interactive — it swings aside to
 * show what is behind it — so it moved to MysteryRoomTools.tsx, which is the
 * only file allowed to hold things with an onClick. Nothing in this file
 * responds to a pointer, which is what makes "clicking a filing cabinet does
 * nothing" a property of the code rather than a thing to remember.
 */
function Fittings() {
  return (
    <group>
      {/* Three pendant lamps down the room.
          All three keep their shade and their lit bulb; only the middle one
          carries a point light. Three overlapping 10m lights reached the whole
          room three times over — the room has one general wash and it does not
          need to be summed three times per fragment to arrive at it. The two
          outer shades still read as lit, because the bulb inside them is a
          `meshBasicMaterial` sphere and always has been. */}
      {[-3.2, -0.4, 2.4].map((z) => (
        <group key={z} position={[0, 0, z]}>
          <mesh position={[0, 4.86, 0]}>
            <cylinderGeometry args={[0.08, 0.08, 0.06, 10]} />
            <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 4.72, 0]}>
            <cylinderGeometry args={[0.03, 0.03, 0.56, 6]} />
            <meshStandardMaterial color={C.metalDark} />
          </mesh>
          <mesh position={[0, 4.34, 0]} castShadow>
            <coneGeometry args={[0.55, 0.42, 20, 1, true]} />
            <meshStandardMaterial color="#2c3540" roughness={0.5} metalness={0.4} side={2} />
          </mesh>
          {/* Enamel underside — a shade lit from inside is a different colour to its outside */}
          <mesh position={[0, 4.145, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.16, 0.55, 20]} />
            <meshStandardMaterial color="#d9cdb4" roughness={0.6} side={2} />
          </mesh>
          <mesh position={[0, 4.2, 0]}>
            <sphereGeometry args={[0.14, 12, 12]} />
            <meshBasicMaterial color="#fff0d4" />
          </mesh>
          {/* Down from 20. The base light dropped by more than half in the
              retheme, and a pendant left at its old value stopped being a lamp
              in a dim room and became the only thing in the room. Raised again
              now that it is carrying the wash the other two used to share. */}
          {z === -0.4 && (
            <pointLight position={[0, 4.0, 0]} intensity={20} distance={13} decay={2} color="#ffd9ae" />
          )}
        </group>
      ))}

      {/* Pipes across the ceiling, with brackets */}
      {[-3.6, 3.4].map((x) => (
        <group key={x}>
          <mesh position={[x, 4.78, -1]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.11, 0.11, 9.5, 10]} />
            <meshStandardMaterial color={C.metal} roughness={0.5} metalness={0.55} />
          </mesh>
          {[-4.6, -2.2, 0.4, 2.8].map((z) => (
            <mesh key={z} position={[x, 4.9, z]}>
              <boxGeometry args={[0.05, 0.2, 0.05]} />
              <meshStandardMaterial color={C.metalDark} metalness={0.5} roughness={0.5} />
            </mesh>
          ))}
          {/* A flanged joint partway along */}
          <mesh position={[x, 4.78, -1.6]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.14, 0.14, 0.1, 10]} />
            <meshStandardMaterial color={C.rust} roughness={0.8} metalness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Fuse box on the back wall */}
      <group position={[-0.2, 2.3, ROOM.backZ + 0.12]}>
        <Box position={[0, 0, 0]} size={[0.5, 0.62, 0.16]} colour="#3a4450" roughness={0.6} metalness={0.3} />
        <Box position={[-0.16, 0, 0.09]} size={[0.16, 0.58, 0.02]} colour="#2e3742" />
        {[0.18, 0.06, -0.06, -0.18].map((y) => (
          <group key={y}>
            <Box position={[0.09, y, 0.09]} size={[0.22, 0.06, 0.03]} colour="#c4bca8" />
            <Box position={[0.16, y + 0.01, 0.11]} size={[0.05, 0.04, 0.02]} colour="#8b2b2b" />
          </group>
        ))}
        {/* Conduit running up to the ceiling */}
        <mesh position={[0, 1.32, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 2.0, 8]} />
          <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.55} />
        </mesh>
      </group>

      {/* Framed notices on the back wall */}
      {NOTICES.map((f) => (
        <Notice key={`${f.x}-${f.y}`} notice={f} />
      ))}
    </group>
  );
}

/**
 * The framed notices on the back wall.
 *
 * These used to be four brown rectangles containing five grey stripes each,
 * standing in for text nobody would ever read. That was a fair trade when they
 * were background — but at a metre and a half away they are the biggest flat
 * surfaces in the room after the case board, and four rectangles of grey
 * stripes is exactly what a player walks up to, squints at, and files under
 * "the room is unfinished".
 *
 * So they say things now. Nothing in them is a clue and nothing in them is
 * needed — they are here to make the room feel like a place that was used by
 * someone, and to give the eye somewhere to land that ISN'T a puzzle. The
 * departmental voice is the joke: a room full of impossible objects, run by
 * people who put up a laminate about fire doors.
 *
 * Each has a coloured header band in one of the two accents, so the back wall
 * carries the palette rather than sitting outside it.
 */
interface NoticeSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  /** Header band colour. One of the two accents, never a third. */
  band: string;
  title: string;
  /** Body lines. Kept short — this is read from across a room, at an angle. */
  lines: string[];
  /** A rubber stamp across the corner, if this one has been dealt with. */
  stamp?: string;
}

const NOTICES: NoticeSpec[] = [
  {
    // Clear of the stove flue, which now rises past x = -2.2.
    x: -3.4,
    y: 3.2,
    w: 1.0,
    h: 1.2,
    tilt: 0,
    band: C.magenta,
    title: "ARCHIVE RULES",
    lines: ["1. SIGN THE LEDGER", "2. ONE CASE AT A TIME", "3. RETURN WHAT YOU OPEN", "4. NO NAKED FLAME"],
  },
  {
    x: -0.7,
    y: 3.05,
    w: 0.86,
    h: 0.66,
    tilt: 0.09,
    band: C.cyan,
    title: "FIRE DOOR",
    lines: ["KEEP CLEAR AT", "ALL TIMES"],
  },
  {
    x: 3.6,
    y: 2.6,
    w: 0.9,
    h: 1.1,
    tilt: -0.05,
    band: C.cyan,
    title: "INVENTORY",
    lines: ["CASE 88 — 4 ITEMS", "SIGNED OUT", "NOT RETURNED", "SEE FLOOR SUPERVISOR"],
    stamp: "OVERDUE",
  },
  {
    x: 4.7,
    y: 3.3,
    w: 0.7,
    h: 0.9,
    tilt: 0.06,
    band: C.magenta,
    title: "NOTICE",
    lines: ["THIS ROOM IS", "UNDER OBSERVATION"],
  },
];

function Notice({ notice: f }: { notice: NoticeSpec }) {
  const inner = { w: f.w - 0.14, h: f.h - 0.14 };
  return (
    <group position={[f.x, f.y, ROOM.backZ + 0.07]} rotation={[0, 0, f.tilt]}>
      {/* Frame, with a lighter inner bevel so it is a moulding and not a slab */}
      <Box position={[0, 0, 0]} size={[f.w, f.h, 0.05]} colour={C.woodDark} />
      <Box position={[0, 0, 0.018]} size={[f.w - 0.05, f.h - 0.05, 0.02]} colour={C.woodPale} />
      {/* Mount board, then the notice itself sitting on it */}
      <mesh position={[0, 0, 0.032]}>
        <planeGeometry args={[inner.w + 0.05, inner.h + 0.05]} />
        <meshStandardMaterial color="#1d1a2e" roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.034]}>
        <planeGeometry args={[inner.w, inner.h]} />
        <meshStandardMaterial color={C.paper} roughness={0.95} />
      </mesh>

      {/* Header band, and the title reversed out of it */}
      <mesh position={[0, inner.h / 2 - 0.075, 0.036]}>
        <planeGeometry args={[inner.w, 0.15]} />
        <meshBasicMaterial color={f.band} />
      </mesh>
      <Text
        position={[0, inner.h / 2 - 0.075, 0.038]}
        fontSize={Math.min(0.075, inner.w / (f.title.length * 0.62))}
        anchorX="center"
        anchorY="middle"
        color="#11101c"
      >
        {f.title}
      </Text>

      {/* Body. Left-aligned off the inner edge, like something typed. */}
      {f.lines.map((line, i) => (
        <Text
          key={line}
          position={[-inner.w / 2 + 0.05, inner.h / 2 - 0.24 - i * 0.13, 0.037]}
          fontSize={Math.min(0.056, (inner.w - 0.1) / (line.length * 0.6))}
          anchorX="left"
          anchorY="middle"
          color="#2c2740"
        >
          {line}
        </Text>
      ))}

      {/* Rubber stamp across the bottom corner, at an angle, half off the page */}
      {f.stamp && (
        <group position={[0.08, -inner.h / 2 + 0.16, 0.039]} rotation={[0, 0, 0.22]}>
          <mesh>
            <planeGeometry args={[inner.w * 0.72, 0.13]} />
            <meshBasicMaterial color="#a8261f" transparent opacity={0.22} />
          </mesh>
          <Text fontSize={0.06} anchorX="center" anchorY="middle" color="#a8261f">
            {f.stamp}
          </Text>
        </group>
      )}

      {/* Glass: a single pale streak across the top corner. Enough to say
          "there is glass in this frame" without hiding what is behind it. */}
      <mesh position={[-inner.w * 0.18, inner.h * 0.12, 0.041]} rotation={[0, 0, 0.5]}>
        <planeGeometry args={[inner.w * 0.28, inner.h * 1.3]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.05} depthWrite={false} />
      </mesh>
      {/* Nail and hanging wire */}
      <mesh position={[0, f.h / 2 + 0.05, 0]}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Neon tubes clamped to the walls.
 *
 * The one piece of set dressing added purely for the look, and the reason the
 * palette above can afford to be as dark as it is. Two magenta, two cyan, at
 * picture-rail height on opposite walls, so that every vertical surface in the
 * room gets a hard coloured edge down one side and falls away to near-black on
 * the other. That edge is what stops a dark room reading as an underlit one.
 *
 * Each tube is a `meshBasicMaterial` bar — unlit, so it stays the accent colour
 * exactly rather than being dragged toward whatever is illuminating it. Two of
 * the four also carry a short-range point light for the spill; see `lit` below
 * for why only two. `distance` is kept tight on purpose: unbounded lights would
 * wash the whole room back to flat.
 */
function NeonTubes() {
  /**
   * `lit` is what separates a tube that costs almost nothing from one that
   * costs real frame time.
   *
   * The bar itself is a `meshBasicMaterial` cylinder: unlit, one draw call, and
   * it looks identical whether or not there is a light inside it — a neon tube
   * IS a bright bar, and that is the whole read. What costs is the spill, and
   * spill is a point light, and every point light in this scene is evaluated
   * per fragment by every lit material in the room whether or not it reaches
   * them. Four of these were four such lights bought purely for atmosphere.
   *
   * Two of them carry the spill now, one per accent colour, placed at opposite
   * ends of the room so the magenta/cyan clash across the middle survives. The
   * other two keep their bar and lose their light: they still read as neon,
   * because a bright bar in a dark room always does, and nothing in the room is
   * lit by them that is not already reached by their partner.
   */
  const tubes: {
    at: [number, number, number];
    length: number;
    colour: string;
    axis: "x" | "z";
    lit: boolean;
  }[] = [
    { at: [-ROOM.halfWidth + 0.16, 3.55, -3.2], length: 3.4, colour: C.magenta, axis: "z", lit: true },
    { at: [-ROOM.halfWidth + 0.16, 3.55, 2.2], length: 2.6, colour: C.cyan, axis: "z", lit: true },
    { at: [ROOM.halfWidth - 0.16, 3.55, -3.6], length: 2.8, colour: C.cyan, axis: "z", lit: false },
    { at: [0.6, 3.7, ROOM.backZ + 0.18], length: 4.2, colour: C.magenta, axis: "x", lit: false },
  ];

  return (
    <group>
      {tubes.map((t) => (
        <group key={`${t.at.join()}`} position={t.at}>
          <mesh rotation={t.axis === "z" ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, t.length, 8]} />
            <meshBasicMaterial color={t.colour} />
          </mesh>
          {/* Bracket at each end, so a tube is fixed to something */}
          {[-1, 1].map((s) => (
            <Box
              key={s}
              position={
                t.axis === "z"
                  ? [0, 0.07, (s * t.length) / 2 - s * 0.1]
                  : [(s * t.length) / 2 - s * 0.1, 0.07, 0]
              }
              size={[0.05, 0.16, 0.05]}
              colour={C.metalDark}
            />
          ))}
          {t.lit && <pointLight intensity={9} distance={5.2} decay={2} color={t.colour} />}
        </group>
      ))}
    </group>
  );
}

/**
 * Lighting.
 *
 * DARK, AND DELIBERATELY SO — but never dark enough to hide a clue. The rule
 * this is built to has not changed: a player must always be able to tell
 * "nothing here" from "too dark to tell", because a search room that fails that
 * test turns into a team clicking every pixel. What changed is how the light
 * gets there. Instead of one bright neutral wash, it is now a dim violet base
 * plus hard coloured accents — so contrast does the work that brightness used
 * to, and the torch beam finally reads as a beam.
 *
 * Every fixture that matters to a puzzle keeps its own local light and is
 * unaffected by this: the bench lamp over the cartridge rack, the two stag
 * lamps, the pendant over the reading cupboards. Turning the room down can
 * therefore never turn a task off.
 *
 * Only the ceiling spot casts shadows. Every additional shadow-casting light
 * is a full depth pass per frame, and this runs on whatever laptop is wired
 * to the projector.
 */
function Lighting() {
  return (
    <group>
      <ambientLight intensity={0.32} />
      <hemisphereLight args={["#7b6bd6", "#241a33", 0.48]} />
      <spotLight
        position={[0, 4.7, -1.0]}
        angle={1.0}
        penumbra={0.75}
        intensity={36}
        distance={16}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* Soft atmospheric accents */}
      <pointLight position={[-4.4, 2.6, 1.6]} intensity={14} distance={10} decay={2} color="#22e0ff" />
      <pointLight position={[2.8, 2.6, 3.9]} intensity={10} distance={8} decay={2} color="#ffdcb4" />
      <pointLight position={[0, 2.8, 3.4]} intensity={6} distance={8} color="#ffe8c8" />
      {/* Strong spotlight focused directly on the Wall Clock area in warm golden amber so the clock & torch stand out with high contrast */}
      <pointLight position={[2.0, 2.4, -5.2]} intensity={20} distance={6} decay={1.5} color="#ffa826" />
    </group>
  );
}

/**
 * Everything non-interactive, in one component.
 *
 * Nothing in here has an onClick, so scenery can never be mistaken for a
 * pickup — clicking a filing cabinet does nothing at all.
 *
 * MEMOISED, AND IT MATTERS MORE HERE THAN ALMOST ANYWHERE. This component takes
 * no props and its output never changes, but it is mounted inside MysteryRoom,
 * which holds a feedback line, a console entry, the lock flag and the section
 * state. Every one of those updates — every message, every keystroke in the
 * console, every Ctrl press — re-rendered this entire tree, and this tree is
 * the whole room: something on the order of a thousand elements, reconciled
 * from scratch to produce byte-for-byte identical output.
 *
 * That is what made the room feel like it was sticking rather than running
 * slowly. Typing into the console re-reconciled the scenery on every character.
 * `memo` on a component with no props reduces that to a reference check.
 */
function RoomSceneImpl(): ReactNode {
  return (
    <group>
      <Lighting />
      <Structure />
      <Desk />
      <Bookcase />
      <Storage />
      <FilingCabinets />
      <TerminalDesk />
      <Doorway />
      <Window />
      <Stove />
      <Trunk />
      <SackBarrow />
      <JarShelf />
      <Clutter />
      <CeilingFan />
      <Fittings />
      <NeonTubes />
    </group>
  );
}

const RoomScene = memo(RoomSceneImpl);
RoomScene.displayName = "RoomScene";
export default RoomScene;

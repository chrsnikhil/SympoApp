"use client";

import { useCallback, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { CABINETS_AT, CABINETS_YAW, DESK_AT, DESK_YAW } from "./MysteryRoomScene";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * Every drawer in the room, and what is in it.
 *
 * Twelve of them: three in the desk pedestal, nine in the filing cabinets.
 * All twelve open when clicked, and close again on a second click.
 *
 * NONE OF THEM HIDES ANYTHING, and that is the point of building all twelve.
 * The two things worth finding are behind the wall clock and inside a hollowed
 * book (MysteryRoomTools.tsx), and neither of those is a fair puzzle in a room
 * where drawers are painted shut: "some scenery is openable" is only a rule a
 * player can reason about once they have opened a dozen ordinary drawers and
 * found ordinary drawer contents. The twelve dead ends are what turn the clock
 * into a deduction instead of a lucky click.
 *
 * The carcasses these slide into are in MysteryRoomScene.tsx, which has no
 * pointer handlers at all. Both files place themselves from the same exported
 * anchors, so a drawer cannot drift off the front of its own cabinet.
 */

const C = {
  woodPale: "#a5825a",
  woodDark: "#6a4c2f",
  brass: "#c39b52",
  metal: "#818995",
  metalDark: "#4d545f",
  paper: "#efe7d5",
  paperAged: "#ded2b6",
  felt: "#3b3128",
};

/** What is lying in a given drawer. Flavour only — nothing here is collectable. */
type Fill = "nibs" | "papers" | "keys" | "files" | "cards" | "fuses" | "rolls" | "dust";

interface DrawerSpec {
  id: string;
  /** Which carcass it belongs to. */
  host: "desk" | "cabinet";
  /** Position of the drawer mouth, in that carcass's local frame. */
  at: [number, number, number];
  fill: Fill;
  /** The line printed under the viewport when it is pulled open. */
  note: string;
  /** True for the one drawer that is already standing open when the room loads. */
  startOpen?: boolean;
}

/**
 * Drawer travel and proportions, per carcass.
 *
 * The desk drawers stop at 24cm rather than pulling right out. The desk's
 * footprint ends 26cm in front of its own drawer fronts, so a longer pull would
 * put a solid drawer through a place the player is allowed to stand — and a
 * collision box that lies is worse than no drawer at all.
 */
const DESK_DRAWER = { width: 0.7, height: 0.13, depth: 0.85, travel: 0.24 };
const CABINET_DRAWER = { width: 1.0, height: 0.36, depth: 0.95, travel: 0.42 };

const DRAWERS: DrawerSpec[] = [
  // Desk pedestal, top to bottom. Local x = 0.72, front face at z = 0.51.
  {
    id: "desk-top",
    host: "desk",
    at: [0.72, 0.46, 0.51],
    fill: "nibs",
    note: "Spare nibs, a dried-up inkwell and a brass letter opener.",
  },
  {
    id: "desk-mid",
    host: "desk",
    at: [0.72, 0.3, 0.51],
    fill: "papers",
    note: "Carbon paper, and a ream of forms nobody ever filled in.",
  },
  {
    id: "desk-low",
    host: "desk",
    at: [0.72, 0.12, 0.51],
    fill: "keys",
    note: "A ring of keys. None of them fits anything in this room.",
  },

  // Filing cabinets. Three carcasses at local z = -1.3, 0, 1.3; three drawers
  // each; every front face at local x = 0.71.
  {
    id: "cab-a-top",
    host: "cabinet",
    at: [0.71, 1.25, -1.3],
    fill: "papers",
    note: "Correspondence, 1961 to 1964. Filed by nobody in particular.",
  },
  {
    id: "cab-a-mid",
    host: "cabinet",
    at: [0.71, 0.8, -1.3],
    fill: "cards",
    note: "Index cards, edge-worn, in an order that made sense to someone.",
  },
  {
    id: "cab-a-low",
    host: "cabinet",
    at: [0.71, 0.35, -1.3],
    fill: "dust",
    note: "Dust, a dead moth, and the smell of old metal.",
  },
  {
    id: "cab-b-top",
    host: "cabinet",
    at: [0.71, 1.25, 0],
    fill: "files",
    note: "Hanging files, every one of them empty. Somebody got here first.",
    startOpen: true,
  },
  {
    id: "cab-b-mid",
    host: "cabinet",
    at: [0.71, 0.8, 0],
    fill: "fuses",
    note: "Spare fuses and a coil of fuse wire.",
  },
  {
    id: "cab-b-low",
    host: "cabinet",
    at: [0.71, 0.35, 0],
    fill: "rolls",
    note: "Rolled blueprints, gone soft with damp.",
  },
  {
    id: "cab-c-top",
    host: "cabinet",
    at: [0.71, 1.25, 1.3],
    fill: "cards",
    note: "Punch cards, still boxed, still banded.",
  },
  {
    id: "cab-c-mid",
    host: "cabinet",
    at: [0.71, 0.8, 1.3],
    fill: "dust",
    note: "Empty. Somebody cleared this one out in a hurry.",
  },
  {
    id: "cab-c-low",
    host: "cabinet",
    at: [0.71, 0.35, 1.3],
    fill: "papers",
    note: "Requisition slips, unsigned, going back further than anyone here.",
  },
];

interface Props {
  dragRef: MutableRefObject<PlayerState>;
  /** One line under the viewport, each time a drawer is pulled open. */
  onNote: (text: string) => void;
}

/**
 * Which drawers are open is local state and stays local state.
 *
 * Nothing in the room's task machine depends on a drawer, so lifting this into
 * MysteryRoom would put twelve booleans next to the five that decide whether
 * the puzzle is solved, and invite exactly the confusion this file exists to
 * avoid.
 */
export default function Drawers({ dragRef, onNote }: Props) {
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(DRAWERS.filter((d) => d.startOpen).map((d) => d.id))
  );

  // The note is decided out here rather than inside the updater. A setState
  // updater runs during React's render pass, and calling another component's
  // setter from in there is an error — React is free to run the updater more
  // than once, and the note would be set once per run.
  const toggle = useCallback(
    (spec: DrawerSpec) => {
      const wasOpen = open.has(spec.id);
      const next = new Set(open);
      if (wasOpen) next.delete(spec.id);
      else next.add(spec.id);
      setOpen(next);
      if (!wasOpen) onNote(spec.note);
    },
    [open, onNote]
  );

  return (
    <group>
      <group position={DESK_AT} rotation={[0, DESK_YAW, 0]}>
        {DRAWERS.filter((d) => d.host === "desk").map((d) => (
          <Drawer
            key={d.id}
            spec={d}
            metrics={DESK_DRAWER}
            face={C.woodPale}
            carcass="wood"
            // Pulls straight out toward the front of the desk, which is +Z in
            // the desk's own frame.
            rotation={[0, 0, 0]}
            open={open.has(d.id)}
            dragRef={dragRef}
            onToggle={() => toggle(d)}
          />
        ))}
      </group>

      <group position={CABINETS_AT} rotation={[0, CABINETS_YAW, 0]}>
        {DRAWERS.filter((d) => d.host === "cabinet").map((d) => (
          <Drawer
            key={d.id}
            spec={d}
            metrics={CABINET_DRAWER}
            face={C.metalDark}
            carcass="metal"
            // The cabinets face +X. Turning the drawer a quarter turn about Y
            // lets one component do both carcasses: it always slides along its
            // own +Z, and the frame decides where that points.
            rotation={[0, Math.PI / 2, 0]}
            open={open.has(d.id)}
            dragRef={dragRef}
            onToggle={() => toggle(d)}
          />
        ))}
      </group>
    </group>
  );
}

interface DrawerMetrics {
  width: number;
  height: number;
  depth: number;
  travel: number;
}

interface DrawerProps {
  spec: DrawerSpec;
  metrics: DrawerMetrics;
  face: string;
  carcass: "wood" | "metal";
  rotation: [number, number, number];
  open: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onToggle: () => void;
}

/**
 * One drawer, drawn in a frame where the front face is at z = 0 and the box
 * behind it runs to -Z. Opening slides the whole thing along +Z.
 *
 * The slide is eased in useFrame against a ref rather than driven by React
 * state. Twelve drawers re-rendering per frame while one of them moves would
 * cost more than everything else in the room put together, and the only thing
 * that changes is one number on one transform. The easing is frame-rate
 * independent, so a drawer takes the same wall-clock time to open at 30fps as
 * at 144 and cannot overshoot on a long frame.
 */
function Drawer({ spec, metrics, face, carcass, rotation, open, dragRef, onToggle }: DrawerProps) {
  const [hovered, setHovered] = useState(false);
  const slide = useRef<Group>(null);
  const t = useRef(open ? 1 : 0);

  useFrame((_state, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 7);
    t.current += ((open ? 1 : 0) - t.current) * k;
    if (slide.current) slide.current.position.z = metrics.travel * t.current;
  });

  const { width, height, depth } = metrics;
  const wall = height * 0.72;
  const inner = width - 0.05;
  // Tray floor sits just inside the bottom of the front face.
  const floorY = -height / 2 + 0.01;
  const metal = carcass === "metal";
  const tint = hovered ? (metal ? "#69727f" : "#c09a6c") : face;

  return (
    <group position={spec.at} rotation={rotation}>
      <group ref={slide}>
        {/* Front face */}
        <mesh position={[0, 0, 0.015]} castShadow receiveShadow>
          <boxGeometry args={[width, height, 0.03]} />
          <meshStandardMaterial
            color={tint}
            roughness={metal ? 0.55 : 0.85}
            metalness={metal ? 0.35 : 0}
          />
        </mesh>

        {/* Handle */}
        <mesh position={[0, metal ? -height * 0.18 : 0, 0.045]}>
          <boxGeometry args={[width * 0.24, 0.035, 0.03]} />
          <meshStandardMaterial color={C.brass} metalness={0.6} roughness={0.4} />
        </mesh>

        {/* Label card in its holder, on the metal drawers; a keyhole on the wood */}
        {metal ? (
          <group position={[0, height * 0.22, 0.04]}>
            <mesh>
              <boxGeometry args={[width * 0.34, 0.06, 0.02]} />
              <meshStandardMaterial color={C.metalDark} metalness={0.4} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.013]}>
              <planeGeometry args={[width * 0.3, 0.04]} />
              <meshStandardMaterial color={C.paperAged} roughness={1} />
            </mesh>
          </group>
        ) : (
          <mesh position={[-width * 0.34, 0, 0.04]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.012, 0.012, 0.012, 8]} />
            <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.35} />
          </mesh>
        )}

        {/* The box behind the face: floor, two sides and a back. Always drawn,
            even shut — it is inside the carcass then, so there is nothing to
            see and nothing to pop in at the moment of opening. */}
        <mesh position={[0, floorY, -depth / 2]} receiveShadow>
          <boxGeometry args={[inner, 0.014, depth]} />
          <meshStandardMaterial color={metal ? C.metal : C.woodDark} roughness={0.8} metalness={metal ? 0.3 : 0} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[(s * inner) / 2, floorY + wall / 2, -depth / 2]}>
            <boxGeometry args={[0.014, wall, depth]} />
            <meshStandardMaterial color={metal ? C.metal : C.woodDark} roughness={0.8} metalness={metal ? 0.3 : 0} />
          </mesh>
        ))}
        <mesh position={[0, floorY + wall / 2, -depth + 0.01]}>
          <boxGeometry args={[inner, wall, 0.014]} />
          <meshStandardMaterial color={metal ? C.metal : C.woodDark} roughness={0.8} metalness={metal ? 0.3 : 0} />
        </mesh>

        {/* What is in it */}
        <group position={[0, floorY + 0.01, -depth * 0.45]}>
          <Contents fill={spec.fill} width={inner} depth={depth} wall={wall} />
        </group>

        {/* Click target. Deliberately larger than the front face and standing
            proud of it: a drawer front is 13cm tall on the desk, and this is
            played on a trackpad by someone standing at the back of a hall. */}
        <mesh
          position={[0, 0, 0.06]}
          onClick={(e) => {
            e.stopPropagation();
            // A look-drag that starts and ends over this drawer would otherwise
            // arrive here as a click — see Player's doc comment.
            if (dragRef.current.moved) return;
            onToggle();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <boxGeometry args={[width, Math.max(height, 0.16), 0.06]} />
          <meshBasicMaterial transparent opacity={hovered ? 0.14 : 0} color="#ffd479" />
        </mesh>
      </group>
    </group>
  );
}

/**
 * The clutter inside a drawer.
 *
 * Kept crude on purpose. It is seen for a couple of seconds, from above, in a
 * dim room — what has to read is "this drawer has ordinary junk in it", and
 * modelling a letter opener properly would buy nothing a wedge of brass does
 * not already buy.
 */
function Contents({
  fill,
  width,
  depth,
  wall,
}: {
  fill: Fill;
  width: number;
  depth: number;
  wall: number;
}): ReactNode {
  switch (fill) {
    case "nibs":
      return (
        <group>
          {[-0.18, -0.1, -0.02, 0.08, 0.16].map((x, i) => (
            <mesh key={x} position={[x, 0.006, (i % 3) * 0.04 - 0.04]} rotation={[0, i * 0.7, 0]}>
              <boxGeometry args={[0.012, 0.004, 0.03]} />
              <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.4} />
            </mesh>
          ))}
          {/* Letter opener */}
          <mesh position={[0.05, 0.007, 0.1]} rotation={[0, 0.4, 0]}>
            <boxGeometry args={[0.02, 0.006, 0.22]} />
            <meshStandardMaterial color={C.brass} metalness={0.75} roughness={0.35} />
          </mesh>
          {/* Inkwell, on its side */}
          <mesh position={[-0.24, 0.02, 0.12]} rotation={[Math.PI / 2, 0, 0.3]}>
            <cylinderGeometry args={[0.035, 0.04, 0.05, 12]} />
            <meshStandardMaterial color="#1b2430" roughness={0.35} metalness={0.2} />
          </mesh>
        </group>
      );

    case "papers":
      return (
        <group>
          {[0, 1, 2, 3].map((i) => (
            <mesh
              key={i}
              position={[(i % 2) * 0.06 - 0.03, 0.004 + i * 0.005, i * 0.03 - 0.05]}
              rotation={[0, 0.1 + i * 0.13, 0]}
            >
              <boxGeometry args={[width * 0.72, 0.006, depth * 0.42]} />
              <meshStandardMaterial color={i % 2 ? C.paperAged : C.paper} roughness={1} />
            </mesh>
          ))}
          {/* A sheet of carbon paper in among them */}
          <mesh position={[0.02, 0.03, 0.02]} rotation={[0, -0.2, 0]}>
            <boxGeometry args={[width * 0.6, 0.003, depth * 0.36]} />
            <meshStandardMaterial color="#2b2b30" roughness={0.7} />
          </mesh>
        </group>
      );

    case "keys":
      return (
        <group position={[0.02, 0, 0.04]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.045, 0.005, 6, 16]} />
            <meshStandardMaterial color={C.metal} metalness={0.7} roughness={0.4} />
          </mesh>
          {[0.3, 1.6, 2.9, 4.4].map((a) => (
            <mesh
              key={a}
              position={[Math.cos(a) * 0.06, 0.004, Math.sin(a) * 0.06]}
              rotation={[0, -a, 0]}
            >
              <boxGeometry args={[0.07, 0.004, 0.016]} />
              <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.45} />
            </mesh>
          ))}
          {/* Felt lining, worn through */}
          <mesh position={[-0.1, 0.001, 0.02]} rotation={[-Math.PI / 2, 0, 0.2]}>
            <planeGeometry args={[0.2, 0.16]} />
            <meshStandardMaterial color={C.felt} roughness={1} />
          </mesh>
        </group>
      );

    case "files":
      return (
        <group>
          {[-0.3, -0.1, 0.12, 0.3].map((x, i) => (
            <group key={x} position={[x, wall * 0.42, 0]}>
              <mesh rotation={[0.08, 0, 0]} castShadow>
                <boxGeometry args={[0.03, wall * 0.86, depth * 0.62]} />
                <meshStandardMaterial color={C.paperAged} roughness={1} />
              </mesh>
              {i % 2 === 0 && (
                <mesh position={[0, wall * 0.46, 0.02]}>
                  <boxGeometry args={[0.02, 0.04, 0.12]} />
                  <meshStandardMaterial color={C.paper} roughness={1} />
                </mesh>
              )}
            </group>
          ))}
        </group>
      );

    case "cards":
      return (
        <group>
          {/* A banded block of index cards */}
          <mesh position={[0, wall * 0.24, 0]} castShadow>
            <boxGeometry args={[width * 0.66, wall * 0.5, depth * 0.3]} />
            <meshStandardMaterial color={C.paperAged} roughness={1} />
          </mesh>
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, wall * 0.24, 0]}>
              <boxGeometry args={[0.014, wall * 0.54, depth * 0.32]} />
              <meshStandardMaterial color="#8a3b34" roughness={0.9} />
            </mesh>
          ))}
          {/* A few that slipped out of the block */}
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[width * 0.32, 0.005 + i * 0.004, depth * 0.16 - i * 0.03]}
              rotation={[0, 0.3 + i * 0.2, 0]}
            >
              <boxGeometry args={[0.1, 0.004, 0.06]} />
              <meshStandardMaterial color={C.paper} roughness={1} />
            </mesh>
          ))}
        </group>
      );

    case "fuses":
      return (
        <group>
          {[-0.16, -0.08, 0.0, 0.1, 0.18].map((x, i) => (
            <mesh key={x} position={[x, 0.012, i * 0.02 - 0.02]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.012, 0.012, 0.06, 10]} />
              <meshStandardMaterial color="#c4bca8" roughness={0.6} />
            </mesh>
          ))}
          {/* Coil of fuse wire */}
          {[0.05, 0.038].map((r, i) => (
            <mesh key={r} position={[0.24, 0.008 + i * 0.008, 0.08]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[r, 0.004, 5, 16]} />
              <meshStandardMaterial color={C.brass} metalness={0.7} roughness={0.45} />
            </mesh>
          ))}
        </group>
      );

    case "rolls":
      return (
        <group>
          {[-0.14, 0.0, 0.15].map((x, i) => (
            <mesh key={x} position={[x, 0.045, i * 0.03 - 0.03]} rotation={[0, 0.08 * i, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.045, 0.045, depth * 0.66, 12]} />
              <meshStandardMaterial color="#c8c0a4" roughness={1} />
            </mesh>
          ))}
        </group>
      );

    case "dust":
      return (
        <group>
          {/* A worn felt lining and one dead moth. Emptiness has to look
              deliberate, or an empty drawer reads as an unfinished one. */}
          <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[width * 0.86, depth * 0.7]} />
            <meshStandardMaterial color={C.felt} roughness={1} />
          </mesh>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[0.06, 0.004, 0.02]} rotation={[-Math.PI / 2, 0, s * 0.6]}>
              <planeGeometry args={[0.03, 0.012]} />
              <meshStandardMaterial color="#8f8878" roughness={1} side={2} />
            </mesh>
          ))}
        </group>
      );
  }
}

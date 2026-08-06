"use client";

import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Object3D, Vector3 } from "three";

/**
 * The pinboard, and the phrase written on it in ink that only answers to blue
 * light.
 *
 * HOW THE REVEAL IS DECIDED. Not by a shader, and not by sampling what the
 * spotlight actually lit — both are expensive and, worse, unpredictable on
 * whatever GPU is plugged into the projector on the day. It is four plain
 * geometric conditions evaluated per frame against the camera:
 *
 *   1. the torch is on                       (state, from MysteryRoom)
 *   2. the blue gel is clipped over the lens  (state, from MysteryRoom)
 *   3. the player is aimed at this paper      (dot of view direction)
 *   4. the player is close enough             (distance)
 *
 * Miss any one and the phrase stays invisible. That includes the case the
 * whole puzzle turns on: torch on, no gel, aimed point blank — the paper
 * lights up white and stays blank, because condition 2 is false. The player
 * can see plainly that the light is reaching it and the writing is not
 * there, which is what makes the gel feel like the answer rather than a
 * random object.
 *
 * The strength value is continuous rather than a boolean, so the phrase fades
 * up as the beam settles on the paper instead of popping. It is quantised
 * before it reaches React state — a value that changed every frame would
 * re-render this subtree at 60fps for no visible gain.
 */

/** Local position of the secret paper on the board face. */
const SECRET_AT: [number, number, number] = [0.42, -0.18, 0.03];

const REVEAL = {
  /** Beyond this, the beam is too spread out to develop the ink. */
  farRange: 4.6,
  /** Inside this, range stops mattering at all. */
  nearRange: 2.6,
  /** Dot product of view direction against the direction to the paper. */
  aimLoose: 0.88,
  aimTight: 0.985,
  /** Strength above which the phrase counts as read. */
  latchAt: 0.75,
};

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

interface BoardProps {
  /** The words that appear under blue light. */
  phrase: string;
  torchOn: boolean;
  filmOn: boolean;
  /** Fired once, the first time the phrase is actually read. */
  onReveal: () => void;
  /** Kept lit once solved, so a team can show a coordinator what they found. */
  solved: boolean;
}

export default function Board({ phrase, torchOn, filmOn, onReveal, solved }: BoardProps) {
  const { camera } = useThree();
  const secret = useRef<Object3D>(null);
  const worldPos = useRef(new Vector3());
  const worldNormal = useRef(new Vector3());
  const toPaper = useRef(new Vector3());
  const viewDir = useRef(new Vector3());

  /** 0..1, quantised. Drives both the ink opacity and the pool of light on the paper. */
  const [strength, setStrength] = useState(0);
  const latched = useRef(false);

  useFrame(() => {
    const node = secret.current;
    if (!node) return;

    let next = 0;
    const lit = torchOn;

    if (lit) {
      node.getWorldPosition(worldPos.current);
      node.getWorldDirection(worldNormal.current);
      camera.getWorldDirection(viewDir.current);
      toPaper.current.copy(worldPos.current).sub(camera.position);

      const dist = toPaper.current.length();
      toPaper.current.normalize();

      const aim = viewDir.current.dot(toPaper.current);
      const facing = worldNormal.current.dot(toPaper.current);

      // facing < 0 means the paper's front is turned back toward the player.
      if (facing < -0.2) {
        next =
          smoothstep(REVEAL.aimLoose, REVEAL.aimTight, aim) *
          (1 - smoothstep(REVEAL.nearRange, REVEAL.farRange, dist));
      }
    }

    // Quantise: 20 steps is a smooth-looking fade and at most a handful of
    // re-renders as the beam sweeps across.
    const q = Math.round(next * 20) / 20;
    setStrength((prev) => (prev === q ? prev : q));

    // The ink only develops through the gel. Raw light reaches the paper and
    // does nothing, which is the whole lesson of the puzzle.
    if (filmOn && q >= REVEAL.latchAt && !latched.current) {
      latched.current = true;
      onReveal();
    }
  });

  const inkOpacity = filmOn ? strength : 0;
  const poolOpacity = strength * (filmOn ? 0.5 : 0.34);

  return (
    // Right wall, face turned into the room.
    <group position={[5.88, 1.72, -1.0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* Frame: carcass, a lighter moulding proud of it, and a brass inner
          bevel. Three boxes rather than one, because a single slab at this size
          reads as a painted rectangle on the wall no matter what colour it is. */}
      <mesh position={[0, 0, -0.05]} receiveShadow>
        <boxGeometry args={[2.86, 2.06, 0.09]} />
        <meshStandardMaterial color="#33241a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, -0.012]} receiveShadow>
        <boxGeometry args={[2.78, 1.98, 0.05]} />
        <meshStandardMaterial color="#6a4c2f" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, 0.006]}>
        <boxGeometry args={[2.58, 1.78, 0.03]} />
        <meshStandardMaterial color="#a07c3c" metalness={0.55} roughness={0.45} />
      </mesh>

      {/* Cork: a base, a slightly different inner panel so the surface is not
          one flat colour, and a scatter of flecks. Cork with no grain at all is
          the single biggest tell that a board is a texture-less primitive. */}
      <mesh position={[0, 0, 0.02]} receiveShadow>
        <planeGeometry args={[2.5, 1.7]} />
        <meshStandardMaterial color="#7c5c3c" roughness={1} />
      </mesh>
      <mesh position={[0, 0, 0.021]} receiveShadow>
        <planeGeometry args={[2.44, 1.64]} />
        <meshStandardMaterial color="#8d6a45" roughness={1} />
      </mesh>
      {FLECKS.map((f) => (
        <mesh key={`${f.x}:${f.y}`} position={[f.x, f.y, 0.022]} rotation={[0, 0, f.a]}>
          <planeGeometry args={[f.s, f.s * 0.55]} />
          <meshStandardMaterial color={f.dark ? "#6b4e33" : "#a07c53"} roughness={1} />
        </mesh>
      ))}
      {/* Old pinholes, from everything that used to be up here */}
      {HOLES.map((h) => (
        <mesh key={`${h[0]}:${h[1]}`} position={[h[0], h[1], 0.023]}>
          <circleGeometry args={[0.006, 6]} />
          <meshBasicMaterial color="#4a341f" />
        </mesh>
      ))}

      {/* Red string, run between pins in three legs rather than one bar. */}
      {STRINGS.map((s) => (
        <mesh key={`${s.x}:${s.y}`} position={[s.x, s.y, 0.052]} rotation={[0, 0, s.a]}>
          <boxGeometry args={[s.len, 0.009, 0.004]} />
          <meshBasicMaterial color="#c2352b" />
        </mesh>
      ))}

      {/* Decoy paperwork, pinned. None of these carry anything. */}
      {DECOYS.map((p) => (
        <group key={`${p.x}:${p.y}`} position={[p.x, p.y, 0.03]} rotation={[0, 0, p.tilt]}>
          {/* Shadow cast onto the cork — the cheapest way to lift a plane off
              the surface it is sitting on. */}
          <mesh position={[0.012, -0.014, -0.002]}>
            <planeGeometry args={[p.w, p.h]} />
            <meshBasicMaterial color="#000000" transparent opacity={0.34} depthWrite={false} />
          </mesh>
          <mesh>
            <planeGeometry args={[p.w, p.h]} />
            <meshStandardMaterial color={p.colour} roughness={0.95} />
          </mesh>

          {p.kind === "photo" ? (
            <group>
              {/* Print, inset in its white border, with a caption strip under it */}
              <mesh position={[0, 0.04, 0.002]}>
                <planeGeometry args={[p.w - 0.06, p.h - 0.14]} />
                <meshStandardMaterial color="#2b3242" roughness={0.85} />
              </mesh>
              {/* Two blocks suggesting a figure and a horizon, so the print is
                  not a grey rectangle */}
              <mesh position={[-0.04, 0.02, 0.003]}>
                <planeGeometry args={[(p.w - 0.06) * 0.3, (p.h - 0.14) * 0.55]} />
                <meshStandardMaterial color="#4b5468" roughness={0.9} />
              </mesh>
              <mesh position={[0.02, -0.06, 0.003]}>
                <planeGeometry args={[p.w - 0.08, 0.02]} />
                <meshStandardMaterial color="#59627a" roughness={0.9} />
              </mesh>
              <mesh position={[0, -p.h / 2 + 0.045, 0.003]}>
                <planeGeometry args={[(p.w - 0.08) * 0.7, 0.014]} />
                <meshBasicMaterial color="#8d8577" />
              </mesh>
            </group>
          ) : (
            <group>
              {/* Header band in one of the two accents, then ruled lines */}
              <mesh position={[0, p.h / 2 - 0.055, 0.002]}>
                <planeGeometry args={[p.w * 0.86, 0.032]} />
                <meshBasicMaterial color={p.band} />
              </mesh>
              {[0.16, 0.08, 0.0, -0.08, -0.16, -0.24].map((ly, i) =>
                Math.abs(ly) < p.h / 2 - 0.1 ? (
                  <mesh key={ly} position={[-p.w * 0.04, ly, 0.002]}>
                    <planeGeometry args={[p.w * (i % 3 === 2 ? 0.5 : 0.78), 0.011]} />
                    <meshBasicMaterial color="#8b8375" />
                  </mesh>
                ) : null
              )}
              {/* A signature scrawl at the foot */}
              <mesh position={[p.w * 0.18, -p.h / 2 + 0.06, 0.002]} rotation={[0, 0, -0.06]}>
                <planeGeometry args={[p.w * 0.34, 0.016]} />
                <meshBasicMaterial color="#3b4a6b" />
              </mesh>
            </group>
          )}

          {/* Curled bottom corner on some of them */}
          {p.curl && (
            <mesh position={[p.w / 2 - 0.045, -p.h / 2 + 0.03, 0.004]} rotation={[0, 0.7, 0.4]}>
              <planeGeometry args={[0.1, 0.08]} />
              <meshStandardMaterial color="#c9bfa6" roughness={1} side={2} />
            </mesh>
          )}

          <Pin colour={p.pin} y={p.h / 2 - 0.05} />
        </group>
      ))}

      {/* THE paper. Same stock as the decoys on purpose — nothing about it
          looks different until light of the right colour lands on it. */}
      <group position={SECRET_AT} rotation={[0, 0, -0.03]}>
        <object3D ref={secret} />
        <mesh position={[0.012, -0.014, -0.002]}>
          <planeGeometry args={[0.86, 0.5]} />
          <meshBasicMaterial color="#000000" transparent opacity={0.34} depthWrite={false} />
        </mesh>
        <mesh>
          <planeGeometry args={[0.86, 0.5]} />
          <meshStandardMaterial color="#f2ead8" roughness={0.95} />
        </mesh>
        {/* Dressed exactly like a decoy: an accent header band, a couple of
            ruled lines low down, a signature. The middle is left clear because
            that is where the ink comes up, and a sheet that is conspicuously
            emptier than its neighbours would give the game away — so the lines
            it does have are placed where a genuinely half-used form's would be.

            Its pin used to be the only blue one on the board, which meant the
            answer was findable by looking for the odd pin out and never
            touching the torch at all. Every pin colour on this board now
            appears on at least two sheets. */}
        <mesh position={[0, 0.19, 0.002]}>
          <planeGeometry args={[0.74, 0.032]} />
          <meshBasicMaterial color="#2f6bff" />
        </mesh>
        {[-0.14, -0.2].map((ly, i) => (
          <mesh key={ly} position={[-0.03, ly, 0.002]}>
            <planeGeometry args={[0.86 * (i ? 0.5 : 0.78), 0.011]} />
            <meshBasicMaterial color="#8b8375" />
          </mesh>
        ))}
        <mesh position={[0.16, -0.19, 0.003]} rotation={[0, 0, -0.06]}>
          <planeGeometry args={[0.28, 0.016]} />
          <meshBasicMaterial color="#3b4a6b" />
        </mesh>
        <Pin colour="#2f6bff" y={0.21} />

        {/* The pool of torch light landing on it. White with the raw lamp,
            blue through the gel — visible either way, so the player can tell
            they are aiming correctly and the light simply is not doing
            anything yet. */}
        {strength > 0 && (
          <mesh position={[0, 0, 0.004]}>
            <planeGeometry args={[0.84, 0.48]} />
            <meshBasicMaterial
              color={filmOn ? "#3f7bff" : "#fff3d8"}
              transparent
              opacity={poolOpacity}
              depthWrite={false}
              blending={2}
            />
          </mesh>
        )}

        {/* The ink. Present in the scene graph at all times and simply
            transparent — never conditionally mounted — so there is no frame
            where it pops in, and nothing about its geometry to notice before
            it is revealed. */}
        <Text
          position={[0, 0.04, 0.008]}
          fontSize={0.082}
          maxWidth={0.76}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          color="#bfe0ff"
          outlineWidth={0.004}
          outlineColor="#0a2f7a"
          fillOpacity={solved ? 1 : inkOpacity}
          outlineOpacity={solved ? 1 : inkOpacity}
        >
          {phrase}
        </Text>
      </group>

      {/* Board label, always readable — the board has to be findable even
          before anyone knows what it is for. Screwed to the frame on a brass
          plaque rather than floating in front of the cork, which is what it
          looked like when it was bare text. */}
      <group position={[0, 0.945, 0.03]}>
        <mesh>
          <boxGeometry args={[1.0, 0.16, 0.025]} />
          <meshStandardMaterial color="#c9963f" metalness={0.75} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.014]}>
          <planeGeometry args={[0.94, 0.1]} />
          <meshStandardMaterial color="#8c6626" metalness={0.6} roughness={0.5} />
        </mesh>
        <Text position={[0, 0, 0.02]} fontSize={0.072} anchorX="center" anchorY="middle" color="#20180d">
          CASE BOARD
        </Text>
        {[-0.44, 0.44].map((x) => (
          <mesh key={x} position={[x, 0, 0.016]}>
            <cylinderGeometry args={[0.012, 0.012, 0.006, 8]} />
            <meshStandardMaterial color="#6b5220" metalness={0.8} roughness={0.4} />
          </mesh>
        ))}
      </group>

      {/* A luggage tag hanging off the bottom corner of the frame. Purely so
          the board has one thing on it that is not flat against the cork. */}
      <group position={[1.16, -0.9, 0.03]} rotation={[0, 0, 0.14]}>
        <mesh position={[0, -0.06, 0]}>
          <planeGeometry args={[0.006, 0.13]} />
          <meshBasicMaterial color="#8d7a55" />
        </mesh>
        <mesh position={[0, -0.19, 0]}>
          <planeGeometry args={[0.14, 0.19]} />
          <meshStandardMaterial color="#d8c9a4" roughness={1} />
        </mesh>
        <mesh position={[0, -0.15, 0.002]}>
          <planeGeometry args={[0.1, 0.012]} />
          <meshBasicMaterial color="#7d7462" />
        </mesh>
        <mesh position={[0, -0.19, 0.002]}>
          <planeGeometry args={[0.08, 0.012]} />
          <meshBasicMaterial color="#7d7462" />
        </mesh>
      </group>
    </group>
  );
}

/** A drawing pin: a coloured head on a short shank, casting a small shadow. */
function Pin({ colour, y }: { colour: string; y: number }) {
  return (
    <group position={[0, y, 0.008]}>
      <mesh position={[0.008, -0.008, -0.006]}>
        <circleGeometry args={[0.022, 10]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.4} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0, 0.008]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshStandardMaterial color={colour} roughness={0.3} metalness={0.25} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <cylinderGeometry args={[0.008, 0.008, 0.014, 6]} />
        <meshStandardMaterial color="#b8bcc6" metalness={0.7} roughness={0.35} />
      </mesh>
    </group>
  );
}

/**
 * What is pinned to the board, and where.
 *
 * `pin` colours are drawn from a set of four and every one of them is used at
 * least twice — including on the secret sheet. A board where one pin is a
 * unique colour is a board that can be solved by staring at it, which would
 * make the torch, the gel and the whole first task ornamental.
 */
interface Decoy {
  x: number;
  y: number;
  w: number;
  h: number;
  tilt: number;
  colour: string;
  kind: "doc" | "photo";
  /** Header band colour. Ignored for photos. */
  band: string;
  pin: string;
  curl?: boolean;
}

const DECOYS: Decoy[] = [
  { x: -0.92, y: 0.42, w: 0.52, h: 0.66, tilt: 0.05, colour: "#efe7d5", kind: "doc", band: "#ff2d95", pin: "#c2352b" },
  { x: -0.3, y: 0.5, w: 0.46, h: 0.42, tilt: -0.08, colour: "#f4f1e8", kind: "photo", band: "#22e0ff", pin: "#2f6bff", curl: true },
  { x: 0.34, y: 0.46, w: 0.4, h: 0.52, tilt: 0.11, colour: "#efe7d5", kind: "doc", band: "#22e0ff", pin: "#e0c33a" },
  { x: 0.95, y: 0.3, w: 0.5, h: 0.4, tilt: -0.04, colour: "#d8cbb0", kind: "doc", band: "#ff2d95", pin: "#2f6bff" },
  { x: -0.96, y: -0.4, w: 0.44, h: 0.5, tilt: -0.1, colour: "#ded2b6", kind: "doc", band: "#22e0ff", pin: "#38a169", curl: true },
  { x: -0.34, y: -0.44, w: 0.5, h: 0.44, tilt: 0.06, colour: "#f4f1e8", kind: "photo", band: "#ff2d95", pin: "#c2352b" },
  // Nudged right of where it sat: at x = 1.0 its left edge overlapped the
  // secret sheet, and two coplanar papers at z = 0.03 z-fight into a flickering
  // seam that draws the eye straight to the one sheet that must not be
  // interesting.
  { x: 1.04, y: -0.46, w: 0.34, h: 0.46, tilt: 0.09, colour: "#efe7d5", kind: "doc", band: "#ff2d95", pin: "#e0c33a" },
  { x: 0.36, y: -0.62, w: 0.34, h: 0.22, tilt: -0.14, colour: "#e8dcc0", kind: "doc", band: "#22e0ff", pin: "#38a169" },
];

/**
 * Legs of red string, run pin to pin across the board.
 *
 * ROUTED AROUND THE SECRET SHEET, which occupies x -0.01..0.85, y -0.43..0.07.
 * String is drawn at z = 0.052 and the paperwork at 0.03, so a leg crossing
 * that rectangle lies directly over the developed ink — the answer would come
 * up with a red line through it.
 */
const STRINGS = [
  { x: -0.62, y: 0.46, len: 0.66, a: 0.06 },
  { x: -0.66, y: 0.02, len: 0.98, a: -1.0 },
  { x: 0.62, y: 0.34, len: 1.1, a: 0.28 },
  { x: -0.5, y: -0.6, len: 1.0, a: -0.12 },
];

/** Grain in the cork. Fixed positions rather than random, so it never flickers. */
const FLECKS = Array.from({ length: 54 }, (_, i) => ({
  // A cheap deterministic scatter. Two coprime multipliers wrapped into the
  // board's extents give something that looks unplanned and is identical on
  // every machine and every frame — Math.random here would resample on each
  // re-render and make the cork crawl.
  x: (((i * 137) % 241) / 241) * 2.4 - 1.2,
  y: (((i * 89) % 173) / 173) * 1.6 - 0.8,
  s: 0.02 + ((i * 53) % 5) * 0.008,
  a: ((i * 31) % 17) * 0.37,
  dark: i % 3 === 0,
}));

/** Pinholes left by whatever used to be up here. */
const HOLES: [number, number][] = [
  [-1.12, 0.72],
  [-0.62, -0.68],
  [0.08, 0.74],
  [0.72, 0.7],
  [1.14, -0.7],
  [-0.02, -0.74],
  [1.16, 0.62],
  [-1.16, -0.02],
];

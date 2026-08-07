"use client";

import { useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Object3D, SpotLight, Vector3 } from "three";
import type { Group } from "three";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * The two tools: a torch, and a blue gel filter that clips over its lens.
 *
 * Neither is a code fragment. They are instruments — what they exist for is
 * to make the noticeboard readable (see MysteryRoomBoard.tsx). Keeping them
 * out of ROOM_MANIFEST means the reveal code still assembles from exactly the
 * five task props, in manifest order, and finding the torch can never
 * accidentally count as progress toward the answer.
 *
 * Each tool is behind a container that has to be opened first: the torch is
 * in a recess behind the wall clock, the gel is inside a hollowed-out book.
 * That is two clicks rather than one, and the first click is the interesting
 * one — a clock that swings aside is a thing a player will remember, and it
 * turns "spot a small object" into "work out what in this room is not what it
 * looks like".
 *
 * This file is also the only one in the room allowed to hold anything with an
 * onClick. Scenery lives in MysteryRoomScene.tsx and has no pointer handlers
 * at all, which is what makes "clicking a filing cabinet does nothing" a
 * property of the code rather than something to remember.
 */

/**
 * Where the containers are, and where each tool sits inside its container.
 *
 * The clock is on the back wall at a height a person can reach, deliberately:
 * a hiding place nobody can get to is not a hiding place, it is a bug. The
 * book is on top of the filing cabinets, wedged between two boxes of files,
 * with its top surface almost exactly at eye height — which makes it nearly
 * invisible edge-on from anywhere but right in front of it. The open drawer
 * directly below it used to hold the gel and now holds nothing, so the
 * obvious place being obviously empty is what sends a player looking up.
 */
export const CLOCK_AT: [number, number, number] = [2.0, 2.05, -5.79];
export const TORCH_HOME: [number, number, number] = [1.88, 2.02, -5.88];
export const BOOK_HOME: [number, number, number] = [-4.74, 1.6, -2.07];
export const FILM_HOME: [number, number, number] = [2.12, 2.04, -5.86];

/** How far the clock swings off its nail, in radians. */
const CLOCK_SWING = -1.15;
/** How far the book cover flips. Half a turn lands it flat on the surface. */
const BOOK_FLIP = -Math.PI;

/** Beam colour with the raw lamp, and through the blue gel. */
const BEAM_RAW = "#fff2d8";
const BEAM_BLUE = "#2f6bff";

interface Interactive {
  dragRef: MutableRefObject<PlayerState>;
  onPick: () => void;
}

interface Container {
  open: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onOpen: () => void;
}

/**
 * Both containers animate their opening outside React state, easing a ref
 * toward its target in useFrame. A value that changes every frame would
 * re-render the subtree sixty times a second to move one transform, and the
 * transform is the only thing that changes. The easing is frame-rate
 * independent, so the swing takes the same wall-clock time at 30fps as at 144
 * and cannot overshoot on a long frame.
 */

/**
 * The wall clock, and the recess behind it.
 *
 * It hangs on a nail and swings on that nail when clicked — the pivot is the
 * left edge of the case, not its centre, so it opens like a door rather than
 * spinning in place. Behind it is a brick recess with the torch on a ledge.
 *
 * The recess is built whether or not the clock has been moved. It is simply
 * covered: the clock case is opaque and slightly larger than the opening, so
 * there is nothing to see through and nothing to notice early. Rendering the
 * recess only after opening would pop a hole into the wall on the frame the
 * clock starts moving, which is exactly when the player is looking at it.
 */
export function WallClock({ open, dragRef, onOpen }: Container) {
  const [hovered, setHovered] = useState(false);
  const swing = useRef<Group>(null);
  const t = useRef(0);

  useFrame((_state, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 5.5);
    t.current += ((open ? 1 : 0) - t.current) * k;
    if (swing.current) swing.current.rotation.y = CLOCK_SWING * t.current;
  });

  return (
    <group position={[CLOCK_AT[0], CLOCK_AT[1], CLOCK_AT[2]]}>
      {/* The recess: a dark box set into the wall, with a ledge across it */}
      <group position={[0, 0, -0.12]}>
        {/* Back and four sides, drawn inward-facing so it reads as a hole */}
        <mesh position={[0, 0, -0.06]}>
          <planeGeometry args={[0.56, 0.5]} />
          <meshStandardMaterial color="#191d26" roughness={1} />
        </mesh>
        {[
          { p: [0, 0.25, -0.03] as [number, number, number], s: [0.56, 0.06, 0.06] as [number, number, number] },
          { p: [0, -0.25, -0.03] as [number, number, number], s: [0.56, 0.06, 0.06] as [number, number, number] },
          { p: [-0.28, 0, -0.03] as [number, number, number], s: [0.06, 0.5, 0.06] as [number, number, number] },
          { p: [0.28, 0, -0.03] as [number, number, number], s: [0.06, 0.5, 0.06] as [number, number, number] },
        ].map((w) => (
          <mesh key={w.p.join()} position={w.p}>
            <boxGeometry args={w.s} />
            <meshStandardMaterial color="#2b313c" roughness={1} />
          </mesh>
        ))}
        {/* Ledge the torch lies on */}
        <mesh position={[0, -0.11, -0.03]}>
          <boxGeometry args={[0.5, 0.02, 0.11]} />
          <meshStandardMaterial color="#3a4150" roughness={1} />
        </mesh>
        {/* Bright warm golden illumination inside and around the recess so the clock, torch and filter are unmistakably visible */}
        <pointLight position={[0, 0.06, 0.02]} intensity={7.5} distance={1.8} decay={1.5} color="#ffc83b" />
        <pointLight position={[0, 0.1, 0.35]} intensity={12} distance={3.5} decay={1.5} color="#ffa826" />
      </group>

      {/* Nail it hangs from */}
      <mesh position={[0, 0.3, 0.01]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, 0.05, 8]} />
        <meshStandardMaterial color="#6d747f" metalness={0.6} roughness={0.5} />
      </mesh>

      {/* Pivot at the left edge of the case, so it swings like a door */}
      <group ref={swing} position={[-0.38, 0, 0]}>
        <group position={[0.38, 0, 0]}>
          {/* Case — Rich Antique Mahogany Wood */}
          <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.34, 0.09, 24]} />
            <meshStandardMaterial
              color={hovered && !open ? "#8a4f29" : "#3d2314"}
              roughness={0.5}
              metalness={0.3}
            />
          </mesh>
          {/* Polished Gold Bezel */}
          <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.31, 0.025, 8, 26]} />
            <meshStandardMaterial color="#e5a93b" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Midnight Navy Dial Face — high contrast against gold hands */}
          <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.29, 0.29, 0.02, 24]} />
            <meshStandardMaterial color="#121826" roughness={0.4} />
          </mesh>
          {/* Hour ticks — Luminous Gold */}
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return (
              <mesh
                key={i}
                position={[Math.sin(a) * 0.24, Math.cos(a) * 0.24, 0.062]}
                rotation={[0, 0, -a]}
              >
                <planeGeometry args={[i % 3 === 0 ? 0.028 : 0.016, i % 3 === 0 ? 0.07 : 0.045]} />
                <meshBasicMaterial color="#ffd700" />
              </mesh>
            );
          })}
          {/* Hands — Luminous Gold, stopped at ten to two */}
          <mesh position={[0, 0.055, 0.064]}>
            <planeGeometry args={[0.022, 0.14]} />
            <meshBasicMaterial color="#ffd700" />
          </mesh>
          <mesh position={[-0.075, 0.045, 0.064]} rotation={[0, 0, 1.05]}>
            <planeGeometry args={[0.016, 0.2]} />
            <meshBasicMaterial color="#ffd700" />
          </mesh>
          <mesh position={[0, 0, 0.068]}>
            <cylinderGeometry args={[0.018, 0.018, 0.008, 10]} />
            <meshStandardMaterial color="#e5a93b" metalness={0.8} roughness={0.25} />
          </mesh>

          {/* Click target. Slightly proud of the case and a little wider, so
              the clock is easy to hit from an angle; it stops responding once
              the clock is open, which is what stops a second click closing it
              again on top of the torch. */}
          {!open && (
            <mesh
              position={[0, 0, 0.09]}
              onClick={(e) => {
                e.stopPropagation();
                if (dragRef.current.moved) return;
                onOpen();
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(true);
              }}
              onPointerOut={() => setHovered(false)}
            >
              <cylinderGeometry args={[0.38, 0.38, 0.04, 20]} />
              <meshBasicMaterial transparent opacity={hovered ? 0.16 : 0} color="#ffd479" />
            </mesh>
          )}
        </group>
      </group>
    </group>
  );
}

/**
 * The torch, lying on the ledge in the recess.
 *
 * Only rendered once the clock has been moved — before that there is nothing
 * behind the clock to click on even by accident, so a stray click through the
 * wall cannot hand a player the torch early.
 */
export function TorchPickup({ dragRef, onPick }: Interactive) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={TORCH_HOME}
      // Laid across the ledge rather than pointing out of the wall.
      rotation={[0, Math.PI / 2, 0.08]}
      onClick={(e) => {
        e.stopPropagation();
        if (dragRef.current.moved) return;
        onPick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <TorchModel on={false} film={false} highlight={hovered} />
      {/* Enlarged click target — the torch is 4cm across and this is played on
          a trackpad, at arm's length, on a wall. */}
      <mesh position={[0, 0, -0.04]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.11, 0.11, 0.34, 10]} />
        <meshBasicMaterial transparent opacity={hovered ? 0.12 : 0} color="#ffd479" />
      </mesh>
    </group>
  );
}

/**
 * A hollowed-out book on top of the filing cabinets, with the gel inside.
 *
 * Closed it is a book among boxes of paperwork, seen almost edge-on because
 * its top face sits within a couple of centimetres of eye height. Clicking it
 * flips the front cover over the spine — the cover and the pages attached to
 * it rotate half a turn about the hinge and land flat on the surface, which
 * is what an opening book actually does and is one rotation to animate.
 *
 * The cavity is cut into the page block permanently rather than swapped in on
 * open. There is nothing to see while the cover is down, and a page block that
 * changes shape at the moment of opening is a pop the player is looking
 * directly at.
 */
export function HiddenBook({ open, dragRef, onOpen }: Container) {
  const [hovered, setHovered] = useState(false);
  const leaf = useRef<Group>(null);
  const t = useRef(0);

  useFrame((_state, delta) => {
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 4.5);
    t.current += ((open ? 1 : 0) - t.current) * k;
    if (leaf.current) leaf.current.rotation.z = BOOK_FLIP * t.current;
  });

  const cover = hovered && !open ? "#2f6b4a" : "#25563c";

  return (
    // Turned so its front edge faces into the room rather than the wall.
    <group position={BOOK_HOME} rotation={[0, Math.PI / 2 + 0.06, 0]}>
      {/* Back cover */}
      <mesh position={[0, 0.006, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.012, 0.4]} />
        <meshStandardMaterial color={cover} roughness={0.75} />
      </mesh>

      {/* Page block, hollowed: four walls and a floor around a cavity */}
      {[
        { p: [-0.0475, 0.037, 0] as [number, number, number], s: [0.0475, 0.05, 0.385] as [number, number, number] },
        { p: [0.1188, 0.037, 0] as [number, number, number], s: [0.0475, 0.05, 0.385] as [number, number, number] },
        { p: [0.0356, 0.037, -0.1563] as [number, number, number], s: [0.19, 0.05, 0.0725] as [number, number, number] },
        { p: [0.0356, 0.037, 0.1563] as [number, number, number], s: [0.19, 0.05, 0.0725] as [number, number, number] },
      ].map((w) => (
        <mesh key={w.p.join()} position={w.p} castShadow>
          <boxGeometry args={w.s} />
          <meshStandardMaterial color="#e4dcc6" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0.0356, 0.018, 0]}>
        <boxGeometry args={[0.19, 0.014, 0.24]} />
        <meshStandardMaterial color="#3a3128" roughness={1} />
      </mesh>
      {/* Cut page edges, so the cavity looks sliced rather than moulded */}
      {[-0.05, 0, 0.05].map((z) => (
        <mesh key={z} position={[0.0356, 0.062, z]}>
          <boxGeometry args={[0.188, 0.002, 0.008]} />
          <meshStandardMaterial color="#cfc5aa" roughness={1} />
        </mesh>
      ))}

      {/* Spine */}
      <mesh position={[-0.145, 0.037, 0]} castShadow>
        <boxGeometry args={[0.016, 0.078, 0.4]} />
        <meshStandardMaterial color={cover} roughness={0.75} />
      </mesh>
      {[-0.12, 0.12].map((z) => (
        <mesh key={z} position={[-0.1465, 0.037, z]}>
          <boxGeometry args={[0.014, 0.078, 0.02]} />
          <meshStandardMaterial color="#c39b52" metalness={0.55} roughness={0.45} />
        </mesh>
      ))}

      {/* The leaf that flips: front cover plus the pages stuck to it. Its
          pivot is the spine, at x = -0.145. */}
      <group ref={leaf} position={[-0.145, 0.043, 0]}>
        <mesh position={[0.145, 0.029, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.3, 0.012, 0.4]} />
          <meshStandardMaterial color={cover} roughness={0.75} />
        </mesh>
        {/* Gilt rule around the cover */}
        <mesh position={[0.145, 0.0355, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.115, 0.125, 4, 1]} />
          <meshStandardMaterial color="#c39b52" metalness={0.6} roughness={0.45} />
        </mesh>
        <mesh position={[0.145, 0.02, 0]}>
          <boxGeometry args={[0.285, 0.026, 0.385]} />
          <meshStandardMaterial color="#e4dcc6" roughness={1} />
        </mesh>

        {/* Click target on the cover. Removed once open, so the gel underneath
            cannot be blocked by the thing that was covering it. */}
        {!open && (
          <mesh
            position={[0.145, 0.055, 0]}
            onClick={(e) => {
              e.stopPropagation();
              if (dragRef.current.moved) return;
              onOpen();
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(true);
            }}
            onPointerOut={() => setHovered(false)}
          >
            <boxGeometry args={[0.36, 0.09, 0.46]} />
            <meshBasicMaterial transparent opacity={hovered ? 0.16 : 0} color="#ffd479" />
          </mesh>
        )}
      </group>
    </group>
  );
}

/**
 * The blue gel, standing in the cavity in the book.
 *
 * Propped up rather than lying flat. Flat, it would sit at the player's eye
 * height and present almost no screen area — invisible for the wrong reason,
 * and very nearly unclickable. Leaning against the far wall of the cavity it
 * faces whoever just opened the book.
 */
export function FilmPickup({ dragRef, onPick }: Interactive) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<Group>(null);

  // A slow tilt. A still translucent square in a dim recess is genuinely
  // invisible; a moving highlight catches the eye without signposting it.
  useFrame((state) => {
    if (ref.current) ref.current.rotation.z = 0.1 * Math.sin(state.clock.elapsedTime * 0.7);
  });

  return (
    <group
      ref={ref}
      position={FILM_HOME}
      rotation={[0, Math.PI / 2 + 0.06, 0]}
      onClick={(e) => {
        e.stopPropagation();
        if (dragRef.current.moved) return;
        onPick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Leaning back into the cavity */}
      <group rotation={[-0.42, 0, 0]}>
        {/* Unlit on purpose. A lit material for a coloured filter is wrong
            twice over: in the dark cavity it went nearly black, and with the
            raw torch beam on it — which is exactly when a player is looking
            into the book — it blew out to white and stopped reading as blue
            at all. A gel's colour is what it transmits; it does not depend on
            how hard you point a lamp at it. */}
        <mesh>
          <planeGeometry args={[0.17, 0.17]} />
          <meshBasicMaterial
            color={BEAM_BLUE}
            transparent
            opacity={hovered ? 0.95 : 0.85}
            side={2}
          />
        </mesh>
        {/* Card mount, so it reads as a filter and not a blue sticky note */}
        <mesh position={[0, 0, -0.002]}>
          <ringGeometry args={[0.084, 0.112, 4]} />
          <meshStandardMaterial color="#1b1f28" roughness={0.9} side={2} />
        </mesh>
        <mesh position={[0, 0, 0.004]}>
          <planeGeometry args={[0.24, 0.24]} />
          <meshBasicMaterial transparent opacity={hovered ? 0.1 : 0} color={BEAM_BLUE} />
        </mesh>
      </group>
    </group>
  );
}

/** The torch body, shared by the world pickup and the in-hand copy. Points along -Z. */
function TorchModel({ on, film, highlight }: { on: boolean; film: boolean; highlight?: boolean }) {
  return (
    <group>
      {/* Barrel */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.042, 0.046, 0.26, 16]} />
        <meshStandardMaterial
          color={highlight ? "#5d6673" : "#3d444f"}
          metalness={0.65}
          roughness={0.35}
        />
      </mesh>
      {/* Knurled grip */}
      {[-0.02, 0.02, 0.06].map((z) => (
        <mesh key={z} position={[0, 0, z]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.045, 0.006, 6, 18]} />
          <meshStandardMaterial color="#2a3038" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      {/* Head */}
      <mesh position={[0, 0, -0.18]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
        <cylinderGeometry args={[0.072, 0.048, 0.1, 18]} />
        <meshStandardMaterial color="#b98a3f" metalness={0.75} roughness={0.3} />
      </mesh>
      {/* Reflector inside the head, visible around the lens */}
      <mesh position={[0, 0, -0.222]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.068, 0.055, 18, 1, true]} />
        <meshStandardMaterial
          color={on ? "#fff4dd" : "#b9bfc7"}
          metalness={0.85}
          roughness={0.15}
          side={2}
        />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 0, -0.229]}>
        <circleGeometry args={[0.066, 20]} />
        <meshBasicMaterial
          color={on ? (film ? BEAM_BLUE : "#fff8e6") : "#7d858f"}
          transparent
          opacity={on ? 1 : 0.75}
        />
      </mesh>
      {/* The blue gel, clipped over the lens */}
      {film && (
        <group position={[0, 0, -0.238]}>
          <mesh>
            <circleGeometry args={[0.07, 20]} />
            <meshBasicMaterial color={BEAM_BLUE} transparent opacity={0.72} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.069, 0.082, 20]} />
            <meshStandardMaterial color="#1b1f28" roughness={0.9} />
          </mesh>
        </group>
      )}
      {/* On button, on the top of the barrel */}
      <mesh position={[0, 0.05, 0.02]} castShadow>
        <boxGeometry args={[0.032, 0.016, 0.05]} />
        <meshStandardMaterial
          color={on ? "#ff4d4d" : "#8b2b2b"}
          emissive={on ? "#ff2222" : "#000000"}
          emissiveIntensity={on ? 1.4 : 0}
          roughness={0.4}
        />
      </mesh>
      {/* Button housing */}
      <mesh position={[0, 0.042, 0.02]}>
        <boxGeometry args={[0.05, 0.02, 0.075]} />
        <meshStandardMaterial color="#2a3038" metalness={0.5} roughness={0.55} />
      </mesh>
      {/* Tail cap and lanyard loop */}
      <mesh position={[0, 0, 0.14]} rotation={[-Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.048, 0.048, 0.03, 16]} />
        <meshStandardMaterial color="#2a3038" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0.163]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.018, 0.005, 6, 12]} />
        <meshStandardMaterial color="#6d747f" metalness={0.6} roughness={0.5} />
      </mesh>
    </group>
  );
}

interface HeldTorchProps {
  on: boolean;
  film: boolean;
  hasFilm: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onToggle: () => void;
  onAttachFilm: () => void;
}

/**
 * The torch once it is in hand.
 *
 * It is not parented to the camera object — it copies the camera's transform
 * every frame and offsets from there. Same result, but the torch stays a
 * normal member of the scene graph, so it is still raycast normally and its
 * button and head remain clickable. Parenting to the camera puts it in view
 * space, where pointer events get fiddly.
 *
 * Two click targets, both on the model itself rather than on a 2D button:
 *   - the red button toggles the beam
 *   - the head clips the gel on, once the gel has been found
 *
 * Keyboard equivalents (F and G) live in MysteryRoom.tsx, because a small
 * target held at the edge of the view is a fussy thing to hit on a laptop
 * trackpad in a hall.
 */
export function HeldTorch({ on, film, hasFilm, dragRef, onToggle, onAttachFilm }: HeldTorchProps) {
  const { camera } = useThree();
  const rig = useRef<Group>(null);
  const light = useRef<SpotLight>(null);
  const target = useRef<Object3D>(null);
  const forward = useRef(new Vector3());
  const [hoverButton, setHoverButton] = useState(false);
  const [hoverHead, setHoverHead] = useState(false);

  useFrame(() => {
    const g = rig.current;
    if (!g) return;

    // Hold it low and to the right, angled slightly inward — the pose a hand
    // actually takes, and it keeps the middle of the screen clear.
    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);
    g.translateX(0.3);
    g.translateY(-0.24);
    g.translateZ(-0.42);
    g.rotateY(-0.12);
    g.rotateX(0.06);

    if (!light.current || !target.current) return;
    camera.getWorldDirection(forward.current);
    // Beam starts at the lens, not at the eye, or the near geometry lights up
    // from the inside.
    light.current.position.copy(camera.position).addScaledVector(forward.current, 0.4);
    target.current.position.copy(camera.position).addScaledVector(forward.current, 8);
    target.current.updateMatrixWorld();
    light.current.target = target.current;
  });

  return (
    <group>
      <group ref={rig}>
        <TorchModel on={on} film={film} />

        {/* Click target for the button — a slightly larger invisible box, because
            the visible button is 3cm across and this is played on a trackpad. */}
        <mesh
          position={[0, 0.06, 0.02]}
          onClick={(e) => {
            e.stopPropagation();
            if (dragRef.current.moved) return;
            onToggle();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoverButton(true);
          }}
          onPointerOut={() => setHoverButton(false)}
        >
          <boxGeometry args={[0.08, 0.06, 0.1]} />
          <meshBasicMaterial transparent opacity={hoverButton ? 0.22 : 0} color="#ffd479" />
        </mesh>

        {/* Click target for the head — clips the gel on */}
        <mesh
          position={[0, 0, -0.2]}
          onClick={(e) => {
            e.stopPropagation();
            if (dragRef.current.moved) return;
            if (hasFilm && !film) onAttachFilm();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHoverHead(true);
          }}
          onPointerOut={() => setHoverHead(false)}
        >
          <cylinderGeometry args={[0.1, 0.1, 0.14, 12]} />
          <meshBasicMaterial
            transparent
            opacity={hoverHead && hasFilm && !film ? 0.22 : 0}
            color={BEAM_BLUE}
          />
        </mesh>

        {/* Visible beam cone. The spotlight alone is nearly invisible in a room
            this bright, and a torch you cannot see the beam of does not read as
            switched on. Additive, depth-write off, so it never occludes. */}
        {on && (
          <mesh position={[0, 0, -2.2]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.78, 4.0, 24, 1, true]} />
            <meshBasicMaterial
              color={film ? BEAM_BLUE : BEAM_RAW}
              transparent
              opacity={film ? 0.1 : 0.07}
              depthWrite={false}
              blending={2}
              side={2}
            />
          </mesh>
        )}
      </group>

      <object3D ref={target} />
      <spotLight
        ref={light}
        visible={on}
        angle={0.38}
        penumbra={0.5}
        intensity={on ? (film ? 55 : 42) : 0}
        distance={14}
        decay={1.4}
        color={film ? BEAM_BLUE : BEAM_RAW}
      />
    </group>
  );
}

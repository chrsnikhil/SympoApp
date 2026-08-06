"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Quaternion, Vector3 } from "three";
import type { Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, SpotLight } from "three";
import type { PlayerState } from "./MysteryRoomPlayer";

/**
 * Two mounted stags on opposite walls, staring each other down.
 *
 * Click either head and it turns a quarter turn on its mount. Turn BOTH of
 * them all the way over — antlers down, eyes up — and something behind the
 * glass eyes lines up: each throws a beam across the room, the two land on the
 * same patch of floor, and a word appears where they cross.
 *
 * WHY A QUARTER TURN AT A TIME. A head that follows the pointer would let a
 * player sweep through the answer without ever noticing they had passed it,
 * and a head that flips straight to upside down on one click would give the
 * whole thing away the first time anybody prodded it. Four discrete positions
 * make "upside down" a state you can aim for, arrive at, and see you have
 * arrived at — and one stag alone does nothing at all, so the pair has to be
 * read as a pair.
 *
 * WHERE THEY HANG, and why nowhere else. Both walls are crowded. Above y = 2.2
 * the left wall is clear only outside the window (z 0.5 to 2.7), and the right
 * wall is clear only outside the case board (z -2.4 to 0.4) and the reading
 * cupboards (z -4.4 to -2.4). The one band of wall where both sides are free at
 * the same z is z > 2.7. They are also near the spawn point on purpose: unlike
 * the torch and the gel, these are not hidden. Finding them is not the task.
 */

/** What the crossed beams spell out. Must match ROOM_SECTIONS s4 in roomTasks.ts. */
const DEER_CODE = "ANTLERS";

const MOUNT_Y = 2.55;
const MOUNT_Z = 3.3;
/** Just off each wall, so the shield sits against the plaster rather than in it. */
const LEFT_AT: [number, number, number] = [-5.92, MOUNT_Y, MOUNT_Z];
const RIGHT_AT: [number, number, number] = [5.92, MOUNT_Y, MOUNT_Z];

/**
 * Roughly where each stag's eyes end up, in world space — the origin of its
 * beam. Derived from the head's local offset (0.43 out from the shield) times
 * SCALE, so it moves with the mount if the mount is ever resized again.
 */
const LEFT_EYE = new Vector3(-5.32, MOUNT_Y + 0.14, MOUNT_Z);
const RIGHT_EYE = new Vector3(5.32, MOUNT_Y + 0.14, MOUNT_Z);

/** Where the two beams cross, on the bare boards short of the spawn point. */
const PROJECT_AT = new Vector3(0, 0.03, 2.35);

/** Turns needed to have a stag upside down: two quarter turns. */
const INVERTED = 2;

/**
 * How much bigger than life the mounts are drawn.
 *
 * A stag head is about 60cm from burr to muzzle. At that size, hung at 2.55m
 * on a wall six metres away in a dim room, it came out roughly forty pixels
 * across and read as a smudge — a player could not tell which way up it was,
 * which is the one thing this whole task asks them to tell. Trophy mounts run
 * large anyway; this one runs larger.
 */
const SCALE = 1.4;

const C = {
  // Lightened from a realistic dark tan. The stags hang in the two dimmest
  // corners of the room and a correct brown was a black silhouette there.
  hide: "#8a6244",
  hideDark: "#6b4530",
  muzzle: "#3b2a1e",
  antler: "#d6c6a2",
  shield: "#5c4128",
  shieldTrim: "#a5825a",
  brass: "#c39b52",
  beam: "#8fd0ff",
};

interface Props {
  dragRef: MutableRefObject<PlayerState>;
  /** True once the code has been read. The beams stay lit from then on. */
  found: boolean;
  onNote: (text: string) => void;
  onFound: () => void;
}

export default function Deer({ dragRef, found, onNote, onFound }: Props) {
  /** Quarter turns applied to each head. Only the value mod 4 matters. */
  const [left, setLeft] = useState(0);
  const [right, setRight] = useState(0);

  const bothOver = left % 4 === INVERTED && right % 4 === INVERTED;

  // Latched, not live. Once a team has read the word off the floor, idly
  // turning a head again must not take it away from them — they may not have
  // finished typing it. The reveal itself still has to be earned live.
  const lit = found || bothOver;

  /**
   * The note is worked out here and not inside the state updater.
   *
   * A `setState` updater runs during React's render pass, and calling another
   * component's setter from in there is an error — React may run the updater
   * more than once, and the note would be set once per run.
   */
  function turn(which: "left" | "right") {
    const next = (which === "left" ? left : right) + 1;
    const other = which === "left" ? right : left;
    (which === "left" ? setLeft : setRight)(next);

    if (next % 4 !== INVERTED) {
      onNote("The head turns on its mount.");
    } else if (other % 4 === INVERTED) {
      onNote("Both stags are over. Something behind the glass eyes lines up.");
    } else {
      onNote("The stag hangs upside down. Its eyes catch the light. The other one is still the right way up.");
    }
  }

  /**
   * Report the reveal exactly once, ever.
   *
   * In an effect and not in the render body, because onFound sets state up in
   * MysteryRoom and calling a parent's setter from a render pass is a React
   * error. Latched behind a ref, because onFound is not a stable reference —
   * and without the latch this effect re-ran on every render of the room,
   * called onFound again, and reset the feedback line to the stag message.
   * Every other message in the room lasted until the next render and was then
   * overwritten by this one, which looked like all the other clues had stopped
   * working.
   */
  const reported = useRef(found);
  useEffect(() => {
    if (!bothOver || reported.current) return;
    reported.current = true;
    onFound();
  }, [bothOver, onFound]);

  return (
    <group>
      {/* Left wall. Turned so the stag's face points into the room. */}
      <group position={LEFT_AT} rotation={[0, Math.PI / 2, 0]}>
        <Stag turns={left} lit={lit} dragRef={dragRef} onTurn={() => turn("left")} />
      </group>
      <group position={RIGHT_AT} rotation={[0, -Math.PI / 2, 0]}>
        <Stag turns={right} lit={lit} dragRef={dragRef} onTurn={() => turn("right")} />
      </group>

      {lit && (
        <group>
          <Beam from={LEFT_EYE} to={PROJECT_AT} />
          <Beam from={RIGHT_EYE} to={PROJECT_AT} />
          <Projection />
        </group>
      )}
    </group>
  );
}

/**
 * One stag.
 *
 * Everything hangs off a roll group whose axis is the direction the head
 * faces, so a turn rolls it about its own nose rather than swinging it side to
 * side — which is what "turned upside down" has to mean for a mounted head.
 * The angle is eased in useFrame: a quarter turn that snapped would be over
 * before anyone saw which way it went.
 */
function Stag({
  turns,
  lit,
  dragRef,
  onTurn,
}: {
  turns: number;
  lit: boolean;
  dragRef: MutableRefObject<PlayerState>;
  onTurn: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const roll = useRef<Group>(null);
  const angle = useRef(0);
  const leftEye = useRef<Mesh>(null);
  const rightEye = useRef<Mesh>(null);

  useFrame((_state, delta) => {
    // Chases the accumulated total rather than the value mod four, so the head
    // keeps turning the same way round for ever instead of unwinding three
    // quarters every fourth click.
    const wanted = (turns * Math.PI) / 2;
    const k = 1 - Math.exp(-Math.min(delta, 0.1) * 6.5);
    angle.current += (wanted - angle.current) * k;
    if (roll.current) roll.current.rotation.z = angle.current;

    for (const eye of [leftEye.current, rightEye.current]) {
      const m = eye?.material as MeshStandardMaterial | undefined;
      if (m) m.emissiveIntensity = lit ? 2.6 : 0.12;
    }
  });

  return (
    <group scale={SCALE}>
      {/* Enough light to tell which way up it is. Both stags hang in corners
          the pendants barely reach, and a mount nobody can read the
          orientation of is not a puzzle. Kept mounted whether or not the pair
          is lit, so the light count never changes and no material has to be
          recompiled mid-play. */}
      <pointLight position={[0, 0.1, 0.5]} intensity={2.6} distance={2.2} decay={2} color="#ffdcb0" />

      {/* Shield, bolted to the wall. Does not turn — a mount that rotated with
          the head would read as the whole thing coming loose. */}
      <mesh position={[0, 0, 0.03]} castShadow>
        <boxGeometry args={[0.46, 0.58, 0.06]} />
        <meshStandardMaterial color={C.shield} roughness={0.85} />
      </mesh>
      <mesh position={[0, -0.33, 0.03]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.33, 0.33, 0.06]} />
        <meshStandardMaterial color={C.shield} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0, 0.065]}>
        <planeGeometry args={[0.38, 0.5]} />
        <meshStandardMaterial color={C.shieldTrim} roughness={0.8} />
      </mesh>
      {/* Brass plate on the shield, unengraved */}
      <mesh position={[0, -0.22, 0.07]}>
        <boxGeometry args={[0.18, 0.05, 0.01]} />
        <meshStandardMaterial color={C.brass} metalness={0.65} roughness={0.4} />
      </mesh>

      <group ref={roll} position={[0, 0, 0.07]}>
        {/* Neck, angled out of the shield */}
        <mesh position={[0, 0.02, 0.12]} rotation={[Math.PI / 2 - 0.25, 0, 0]} castShadow>
          <cylinderGeometry args={[0.11, 0.16, 0.3, 14]} />
          <meshStandardMaterial color={C.hideDark} roughness={0.95} />
        </mesh>
        {/* Skull */}
        <mesh position={[0, 0.09, 0.29]} castShadow>
          <sphereGeometry args={[0.115, 14, 12]} />
          <meshStandardMaterial color={C.hide} roughness={0.95} />
        </mesh>
        {/* Muzzle */}
        <mesh position={[0, 0.03, 0.42]} rotation={[Math.PI / 2 + 0.35, 0, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.085, 0.22, 12]} />
          <meshStandardMaterial color={C.hide} roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.01, 0.52]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color={C.muzzle} roughness={0.6} />
        </mesh>

        {/* Ears */}
        {[-1, 1].map((s) => (
          <mesh
            key={s}
            position={[s * 0.13, 0.13, 0.24]}
            rotation={[0.3, s * 0.6, s * 0.4]}
            castShadow
          >
            <coneGeometry args={[0.045, 0.14, 8]} />
            <meshStandardMaterial color={C.hideDark} roughness={0.95} />
          </mesh>
        ))}

        {/* Eyes. Glass, and dimly emissive at all times — a glass eye that only
            starts to exist when the puzzle is solved is a thing the player
            never had a chance to notice was there. */}
        <mesh ref={leftEye} position={[-0.07, 0.1, 0.36]}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshStandardMaterial
            color="#1a1f28"
            emissive={C.beam}
            emissiveIntensity={0.12}
            roughness={0.15}
            metalness={0.2}
          />
        </mesh>
        <mesh ref={rightEye} position={[0.07, 0.1, 0.36]}>
          <sphereGeometry args={[0.026, 10, 10]} />
          <meshStandardMaterial
            color="#1a1f28"
            emissive={C.beam}
            emissiveIntensity={0.12}
            roughness={0.15}
            metalness={0.2}
          />
        </mesh>

        <Antlers />

        {/* Click target over the skull, generous — the head is 25cm across and
            hangs above head height on a far wall. */}
        <mesh
          position={[0, 0.09, 0.31]}
          onClick={(e) => {
            e.stopPropagation();
            // A look-drag that starts and ends over this head would otherwise
            // arrive here as a click — see Player's doc comment.
            if (dragRef.current.moved) return;
            onTurn();
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            setHovered(true);
          }}
          onPointerOut={() => setHovered(false)}
        >
          <sphereGeometry args={[0.24, 12, 10]} />
          <meshBasicMaterial transparent opacity={hovered ? 0.14 : 0} color="#ffd479" />
        </mesh>
      </group>
    </group>
  );
}

/** A pair of antlers: two swept beams, each with three tines off it. */
function Antlers() {
  return (
    <group position={[0, 0.16, 0.26]}>
      {[-1, 1].map((s) => (
        <group key={s} rotation={[0, 0, s * 0.36]}>
          {/* Main beam, swept up and back. Deliberately heavier than a real
              antler: at this distance a correctly slender one disappeared, and
              the antlers are how a player reads which way up the head is. */}
          <mesh position={[s * 0.12, 0.22, -0.04]} rotation={[-0.28, 0, s * 0.44]} castShadow>
            <cylinderGeometry args={[0.022, 0.036, 0.5, 8]} />
            <meshStandardMaterial color={C.antler} roughness={0.85} />
          </mesh>
          {/* Brow, bay and tray tines, each shorter and further up the beam */}
          {[
            { y: 0.1, len: 0.22, lean: 0.95, back: 0.03 },
            { y: 0.26, len: 0.25, lean: 0.62, back: -0.06 },
            { y: 0.4, len: 0.2, lean: 0.34, back: -0.14 },
          ].map((t) => (
            <mesh
              key={t.y}
              position={[s * (0.11 + t.y * 0.28), t.y + 0.08, t.back]}
              rotation={[-0.2, 0, s * t.lean]}
              castShadow
            >
              <cylinderGeometry args={[0.013, 0.021, t.len, 6]} />
              <meshStandardMaterial color={C.antler} roughness={0.85} />
            </mesh>
          ))}
          {/* Burr where the beam meets the skull */}
          <mesh position={[s * 0.07, 0.01, 0.02]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.034, 0.011, 6, 12]} />
            <meshStandardMaterial color={C.antler} roughness={0.9} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/**
 * One beam, drawn as a cone from an eye to the floor.
 *
 * A cone's axis is +Y, so the orientation is a single quaternion rotating +Y
 * onto the direction of travel — worked out once, since neither end moves. The
 * spotlight beside it is what actually puts light on the boards; the cone is
 * what makes the beam visible in mid-air, which a spotlight on its own never
 * is.
 */
function Beam({ from, to }: { from: Vector3; to: Vector3 }) {
  const cone = useRef<Mesh>(null);
  const light = useRef<SpotLight>(null);
  const aim = useRef<Object3D>(null);

  const { mid, quaternion, length } = useMemo(() => {
    const dir = new Vector3().subVectors(to, from);
    const len = dir.length();
    const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), dir.clone().normalize());
    return {
      mid: new Vector3().addVectors(from, to).multiplyScalar(0.5).toArray() as [number, number, number],
      quaternion: q,
      length: len,
    };
  }, [from, to]);

  useFrame((state) => {
    const m = cone.current?.material as MeshBasicMaterial | undefined;
    // A faint waver, so the beam reads as light in dusty air rather than a
    // solid blue cone someone left in the room.
    if (m) m.opacity = 0.075 + Math.sin(state.clock.elapsedTime * 1.7) * 0.012;

    // A SpotLight aims at its `target`, and three.js only keeps a target's
    // world matrix up to date if the target is actually in the scene. The
    // default one is not, so it silently stays at the origin and the beam
    // points at the middle of the floor. Pointing it at a real scene node
    // instead is the fix — the same one the held torch uses.
    if (light.current && aim.current) light.current.target = aim.current;
  });

  return (
    <group>
      <mesh ref={cone} position={mid} quaternion={quaternion}>
        {/* Wider at the floor than at the eye: radius is the far end. */}
        <coneGeometry args={[0.3, length, 18, 1, true]} />
        <meshBasicMaterial
          color={C.beam}
          transparent
          opacity={0.08}
          depthWrite={false}
          blending={2}
          side={2}
        />
      </mesh>
      <object3D ref={aim} position={to.toArray() as [number, number, number]} />
      <spotLight
        ref={light}
        position={from.toArray() as [number, number, number]}
        angle={0.16}
        penumbra={0.6}
        intensity={26}
        distance={9}
        decay={1.6}
        color={C.beam}
      />
    </group>
  );
}

/**
 * The pool where the beams land, and the word in it.
 *
 * Read from above by a player standing a step back from it. Laying text flat
 * means rotating it -90 degrees about X, which puts the top of the lettering at
 * -Z — away from someone approaching from the spawn point, which is the way up
 * they need.
 */
function Projection() {
  const pool = useRef<Mesh>(null);

  useFrame((state) => {
    const m = pool.current?.material as MeshBasicMaterial | undefined;
    if (m) m.opacity = 0.34 + Math.sin(state.clock.elapsedTime * 2.1) * 0.03;
  });

  return (
    <group position={PROJECT_AT} rotation={[-Math.PI / 2, 0, 0]}>
      <mesh ref={pool}>
        <circleGeometry args={[0.62, 28]} />
        <meshBasicMaterial color={C.beam} transparent opacity={0.34} depthWrite={false} blending={2} />
      </mesh>
      {/* Sharper inner disc, so the pool has an edge to it */}
      <mesh position={[0, 0, 0.002]}>
        <ringGeometry args={[0.46, 0.5, 28]} />
        <meshBasicMaterial color="#cfe8ff" transparent opacity={0.4} depthWrite={false} blending={2} />
      </mesh>
      <Text
        position={[0, 0, 0.006]}
        fontSize={0.15}
        anchorX="center"
        anchorY="middle"
        color="#ffffff"
        outlineWidth={0.008}
        outlineColor="#123a63"
      >
        {DEER_CODE}
      </Text>
    </group>
  );
}

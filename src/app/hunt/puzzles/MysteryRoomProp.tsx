"use client";

import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { Vector3 } from "three";
import type { Group } from "three";
import type { PropShape, PropSlot } from "@/lib/hunt/manifest";
import type { PlayerState } from "./MysteryRoomPlayer";
import Model from "./MysteryRoomModel";

interface Props {
  slot: PropSlot;
  clue: string;
  held: boolean;
  found: boolean;
  onPick: () => void;
  /** Shared with Player — see the comment on the click handler below. */
  dragRef: MutableRefObject<PlayerState>;
}

/**
 * Where a held object floats, relative to the eye.
 *
 * OFF TO THE LEFT, and that is not decoration. Held dead centre it covered the
 * crosshair, and since it is clickable — that is how you put it down — every
 * click aimed at the next item hit the thing already in your hand instead. The
 * result was that the second, third and fourth case items simply could not be
 * picked up: the click landed, something happened, and it was never the thing
 * the player was pointing at. Held to the left, at the same sort of offset the
 * torch is held to the right, the middle of the view is clear.
 */
const HELD_DISTANCE = 0.8;
const HELD_LEFT = 0.46;
const HELD_DROP = 0.2;

/**
 * One inspectable object.
 *
 * Held objects drift to just in front of the camera and turn slowly so the
 * clue face comes round on its own. Left as a pure drag control, reading a
 * small label on a small object on a projector is genuinely hard.
 *
 * The held position is computed from the live camera each frame rather than
 * being a fixed world point: the player walks now, so "in front of you" is
 * not a constant. Pick something up, walk across the room, and it comes with
 * you.
 *
 * `slot.model === null` draws the primitive for `slot.shape`. A non-null
 * `slot.model` renders that GLB via `Model` (see MysteryRoomModel.tsx),
 * which owns its own loading and error states — so swapping in real art is
 * purely a manifest edit, and a broken path fails loudly instead of quietly
 * showing a placeholder.
 */
export default function Prop({ slot, clue, held, found, onPick, dragRef }: Props) {
  const { camera } = useThree();
  const ref = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const home = useMemo(() => new Vector3(...slot.position), [slot.position]);
  const target = useRef(new Vector3());
  const forward = useRef(new Vector3());
  const right = useRef(new Vector3());

  useFrame((_state, delta) => {
    const g = ref.current;
    if (!g) return;
    const k = Math.min(1, delta * 5);

    if (held) {
      camera.getWorldDirection(forward.current);
      // The camera's right, on the floor plane: forward crossed with world up.
      // Taken flat rather than from the camera's own basis so that looking up
      // or down does not swing the held object across the crosshair again.
      right.current.set(-forward.current.z, 0, forward.current.x).normalize();
      target.current
        .copy(camera.position)
        .addScaledVector(forward.current, HELD_DISTANCE)
        .addScaledVector(right.current, -HELD_LEFT)
        .setY(camera.position.y - HELD_DROP + forward.current.y * HELD_DISTANCE);
      g.position.lerp(target.current, k);
      g.rotation.y += delta * 0.6;
    } else {
      g.position.lerp(home, k);
      g.rotation.y = slot.rotation[1];
    }
  });

  return (
    <group
      ref={ref}
      position={slot.position}
      rotation={slot.rotation}
      scale={slot.scale * (hovered && !held ? 1.1 : 1)}
      onClick={(e) => {
        e.stopPropagation();
        // A native "click" fires on wherever pointerup lands, regardless of
        // how far the pointer travelled since pointerdown — so a look-drag
        // that starts and ends over this same object would otherwise register
        // as a pick. dragRef.moved is set by Player once total travel during
        // the current down-to-up gesture crosses a small threshold; a click
        // that follows a real drag is suppressed here rather than picked up.
        if (dragRef.current.moved) return;
        onPick();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {slot.model === null ? (
        <Shape shape={slot.shape} found={found} hovered={hovered} />
      ) : (
        <Model path={slot.model} />
      )}

      {/* Enlarged click target.
          These are the only clickable things in the room that were left as
          bare geometry, and it showed: a 28cm tin on a shelf, looked down on
          from a metre away, is a target you have to hunt for with the
          crosshair. Everything else in here — the drawers, the cartridges, the
          book spines, the stags — carries a box like this for the same reason,
          because this is played on a trackpad by someone standing up. */}
      <mesh>
        <boxGeometry args={[0.44, 0.34, 0.44]} />
        <meshBasicMaterial transparent opacity={hovered ? 0.1 : 0} color="#ffd479" />
      </mesh>

      {held && (
        <Text
          position={[0, 0.24, 0]}
          fontSize={0.09}
          color="#fff4d8"
          outlineWidth={0.006}
          outlineColor="#141820"
          anchorX="center"
        >
          {clue}
        </Text>
      )}
    </group>
  );
}

/** Tint applied to every shape: neutral, warm on hover, teal once collected. */
function tint(found: boolean, hovered: boolean, base: string): string {
  if (found) return "#2a9d8f";
  if (hovered) return "#d9a441";
  return base;
}

/**
 * The primitive stand-ins.
 *
 * Each one is built to read as the object the manifest names it, from across
 * a room, at a glance — a folder is flat and manila with paper edges showing,
 * a tin is squat with a lid rim and a latch. Identical boxes were the
 * original placeholder and they made the room unsearchable: five of the same
 * grey cube tells a player nothing about what they have found or what is left.
 */
function Shape({ shape, found, hovered }: { shape: PropShape; found: boolean; hovered: boolean }) {
  switch (shape) {
    case "folder":
      return (
        <group>
          {/* Manila covers, hinged open a crack */}
          <mesh position={[0, 0, -0.005]} rotation={[-Math.PI / 2, 0, 0]} castShadow>
            <boxGeometry args={[0.36, 0.28, 0.018]} />
            <meshStandardMaterial color={tint(found, hovered, "#c9a86b")} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.035, -0.01]} rotation={[-Math.PI / 2 + 0.06, 0, 0]} castShadow>
            <boxGeometry args={[0.36, 0.28, 0.014]} />
            <meshStandardMaterial color={tint(found, hovered, "#d4b478")} roughness={0.9} />
          </mesh>
          {/* Pages showing at the edge */}
          <mesh position={[0, 0.018, 0.012]} rotation={[-Math.PI / 2, 0, 0]}>
            <boxGeometry args={[0.33, 0.25, 0.012]} />
            <meshStandardMaterial color="#f4eddc" roughness={0.95} />
          </mesh>
          {/* Tab label */}
          <mesh position={[0.09, 0.045, -0.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.11, 0.05]} />
            <meshStandardMaterial color="#e2564c" roughness={0.8} />
          </mesh>
          {/* String tie */}
          <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.02, 0.3]} />
            <meshStandardMaterial color="#8a3b34" roughness={0.9} />
          </mesh>
        </group>
      );

    case "tin":
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.28, 0.15, 0.19]} />
            <meshStandardMaterial
              color={tint(found, hovered, "#5c6470")}
              metalness={0.7}
              roughness={0.35}
            />
          </mesh>
          {/* Lid, slightly proud of the body */}
          <mesh position={[0, 0.085, 0]} castShadow>
            <boxGeometry args={[0.295, 0.03, 0.205]} />
            <meshStandardMaterial
              color={tint(found, hovered, "#6d7684")}
              metalness={0.75}
              roughness={0.3}
            />
          </mesh>
          {/* Latch */}
          <mesh position={[0, 0.055, 0.1]}>
            <boxGeometry args={[0.05, 0.05, 0.012]} />
            <meshStandardMaterial color="#c39b52" metalness={0.8} roughness={0.25} />
          </mesh>
          {/* Carry handle */}
          <mesh position={[0, 0.115, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.045, 0.008, 8, 18, Math.PI]} />
            <meshStandardMaterial color="#c39b52" metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Paper label on the front */}
          <mesh position={[0, 0, 0.096]}>
            <planeGeometry args={[0.16, 0.08]} />
            <meshStandardMaterial color="#efe7d5" roughness={0.95} />
          </mesh>
        </group>
      );

    case "satchel":
      return (
        <group>
          {/* Body */}
          <mesh castShadow>
            <boxGeometry args={[0.42, 0.3, 0.17]} />
            <meshStandardMaterial color={tint(found, hovered, "#6b4a2f")} roughness={0.95} />
          </mesh>
          {/* Flap over the front */}
          <mesh position={[0, 0.06, 0.095]} rotation={[0.1, 0, 0]} castShadow>
            <boxGeometry args={[0.44, 0.22, 0.02]} />
            <meshStandardMaterial color={tint(found, hovered, "#7d5836")} roughness={0.95} />
          </mesh>
          {/* Buckles */}
          {[-0.12, 0.12].map((x) => (
            <mesh key={x} position={[x, -0.04, 0.105]}>
              <boxGeometry args={[0.04, 0.09, 0.014]} />
              <meshStandardMaterial color="#c39b52" metalness={0.7} roughness={0.35} />
            </mesh>
          ))}
          {/* Strap arcing over the top */}
          <mesh position={[0, 0.16, 0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.17, 0.017, 8, 20, Math.PI]} />
            <meshStandardMaterial color="#4f3722" roughness={0.95} />
          </mesh>
        </group>
      );

    case "tape":
      return (
        <group rotation={[Math.PI / 2, 0, 0]}>
          {/* Reel flanges */}
          {[-0.028, 0.028].map((z) => (
            <mesh key={z} position={[0, 0, z]} castShadow>
              <cylinderGeometry args={[0.15, 0.15, 0.012, 24]} />
              <meshStandardMaterial
                color={tint(found, hovered, "#3f4652")}
                metalness={0.4}
                roughness={0.5}
              />
            </mesh>
          ))}
          {/* Wound tape between them */}
          <mesh>
            <cylinderGeometry args={[0.125, 0.125, 0.05, 24]} />
            <meshStandardMaterial color="#241f1c" roughness={0.85} />
          </mesh>
          {/* Hub */}
          <mesh>
            <cylinderGeometry args={[0.045, 0.045, 0.07, 16]} />
            <meshStandardMaterial color="#c39b52" metalness={0.6} roughness={0.4} />
          </mesh>
          {/* Spoke cut-outs on the near flange */}
          {[0, 2.1, 4.2].map((a) => (
            <mesh
              key={a}
              position={[Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0.035]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.028, 0.028, 0.006, 12]} />
              <meshStandardMaterial color="#1b1f26" roughness={0.9} />
            </mesh>
          ))}
        </group>
      );

  }
}

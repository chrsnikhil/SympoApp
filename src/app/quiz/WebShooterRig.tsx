"use client";

import { useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { ReticleShape } from "@/lib/quiz/avatars";

/**
 * The actual 3D gauntlet — real geometry (capsules, boxes, a sphere for the
 * core lens), a perspective camera, and real lighting, rendered on its own
 * transparent WebGL canvas pinned to the bottom-right corner. Built entirely
 * from primitive shapes assembled into an original mechanical hand; nothing
 * here is an imported mesh or a recreation of a licensed character's rig.
 *
 * `fireQueueRef` is how the 2D click handler in WebShooter.tsx talks to this
 * scene without needing its own render tree inside the Canvas: a click pushes
 * a target rect onto the queue, this component's per-frame loop drains it,
 * plays the recoil, and reports back the muzzle's actual PROJECTED screen
 * position (world position → camera projection → canvas pixel space) via
 * `onFire` — so the verlet web strand launches from where the hand really is
 * on screen at that instant, not a guessed fixed point.
 */

export interface TargetRect {
  x: number;
  y: number;
  w: number;
  h: number;
  el: HTMLElement;
}

export interface NozzleReport {
  x: number;
  y: number;
  target: TargetRect;
}

const FINGER_ANGLES = [-30, -10, 10, 30];
const RIG_WIDTH = 240;
const RIG_HEIGHT = 260;

export default function WebShooterRig({
  gloveColour,
  accentColour,
  shape,
  fireQueueRef,
  onFire,
  reducedMotion,
}: {
  gloveColour: string;
  accentColour: string;
  shape: ReticleShape;
  fireQueueRef: React.RefObject<TargetRect[]>;
  onFire: (report: NozzleReport) => void;
  reducedMotion: boolean;
}) {
  return (
    <div
      className="pointer-events-none fixed bottom-0 right-0 z-[9998]"
      style={{ width: RIG_WIDTH, height: RIG_HEIGHT }}
      aria-hidden="true"
    >
      <Canvas gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0.1, 3.1], fov: 30 }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[2.2, 3, 3]} intensity={1.15} />
        <pointLight position={[-1.4, 0.6, 1.6]} intensity={0.7} color={accentColour} />
        <pointLight position={[0, -1, 1]} intensity={0.25} color="#ffffff" />
        <Rig
          gloveColour={gloveColour}
          accentColour={accentColour}
          shape={shape}
          fireQueueRef={fireQueueRef}
          onFire={onFire}
          reducedMotion={reducedMotion}
        />
      </Canvas>
    </div>
  );
}

function Rig({
  gloveColour,
  accentColour,
  shape,
  fireQueueRef,
  onFire,
  reducedMotion,
}: {
  gloveColour: string;
  accentColour: string;
  shape: ReticleShape;
  fireQueueRef: React.RefObject<TargetRect[]>;
  onFire: (report: NozzleReport) => void;
  reducedMotion: boolean;
}) {
  const armGroup = useRef<THREE.Group>(null);
  const muzzleRef = useRef<THREE.Object3D>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  const recoil = useRef(0);
  const { camera, gl } = useThree();

  const darkGlove = darken(gloveColour, 0.35);

  useFrame((state) => {
    const arm = armGroup.current;
    if (!arm) return;

    const t = state.clock.elapsedTime;
    const sway = reducedMotion ? 0 : Math.sin(t * 1.05) * 0.028;
    arm.position.y = -0.92 + sway;
    arm.rotation.z = sway * 0.6 - recoil.current * 0.55;
    arm.position.x = 0.34 - recoil.current * 0.05;
    recoil.current *= 0.86;

    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = reducedMotion ? 1.1 : 1 + Math.sin(t * 2.2) * 0.45;
    }

    const queue = fireQueueRef.current;
    if (queue && queue.length > 0) {
      const req = queue.shift()!;
      recoil.current = 1;
      if (muzzleRef.current) {
        const world = new THREE.Vector3();
        muzzleRef.current.getWorldPosition(world);
        world.project(camera);
        const rect = gl.domElement.getBoundingClientRect();
        const sx = rect.left + ((world.x + 1) / 2) * rect.width;
        const sy = rect.top + ((1 - world.y) / 2) * rect.height;
        onFire({ x: sx, y: sy, target: req });
      }
    }
  });

  return (
    <group ref={armGroup} rotation={[0.12, -0.4, 0]}>
      {/* Forearm sleeve */}
      <mesh position={[0, -0.78, 0]}>
        <cylinderGeometry args={[0.32, 0.38, 1.3, 14]} />
        <meshStandardMaterial color="#16181d" roughness={0.65} metalness={0.25} />
      </mesh>

      {/* Wrist gauntlet unit */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[0.8, 0.3, 0.5]} />
        <meshStandardMaterial color="#1c1f24" roughness={0.3} metalness={0.75} />
      </mesh>
      <mesh ref={coreRef} position={[0, -0.06, 0.27]}>
        <sphereGeometry args={[0.09, 20, 20]} />
        <meshStandardMaterial color={accentColour} emissive={accentColour} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      {[-0.32, 0.32].map((x) =>
        [0.05, -0.16].map((y, j) => (
          <mesh key={`${x}-${j}`} position={[x, y, 0.24]}>
            <boxGeometry args={[0.05, 0.09, 0.03]} />
            <meshStandardMaterial color={accentColour} emissive={accentColour} emissiveIntensity={0.9} toneMapped={false} />
          </mesh>
        ))
      )}

      {/* Palm */}
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.58, 0.56, 0.38]} />
        <meshStandardMaterial color={gloveColour} roughness={0.7} metalness={0.05} />
      </mesh>

      {/* Fingers — two-segment chains fanned from the palm top */}
      {FINGER_ANGLES.map((angle, i) => (
        <group key={i} position={[0, 0.56, 0]} rotation={[0, 0, THREE.MathUtils.degToRad(angle)]}>
          <mesh position={[0, 0.16, 0]}>
            <capsuleGeometry args={[0.085, 0.22, 4, 8]} />
            <meshStandardMaterial color={i % 2 === 0 ? gloveColour : darkGlove} roughness={0.7} />
          </mesh>
          <group position={[0, 0.3, 0]} rotation={[0.3, 0, 0]}>
            <mesh position={[0, 0.1, 0]}>
              <capsuleGeometry args={[0.07, 0.16, 4, 8]} />
              <meshStandardMaterial color={i % 2 === 0 ? gloveColour : darkGlove} roughness={0.7} />
            </mesh>
          </group>
        </group>
      ))}

      {/* Thumb — shorter, single segment, angled out to the side */}
      <group position={[-0.3, 0.16, 0.08]} rotation={[0, 0, THREE.MathUtils.degToRad(58)]}>
        <mesh position={[0, 0.14, 0]}>
          <capsuleGeometry args={[0.085, 0.18, 4, 8]} />
          <meshStandardMaterial color={darkGlove} roughness={0.7} />
        </mesh>
      </group>

      {/* Lens accessory on the wrist core, per persona reticle shape */}
      <LensMark shape={shape} />

      {/* Muzzle — the actual web-exit point, tracked via getWorldPosition each fire */}
      <object3D ref={muzzleRef} position={[0, 0.72, 0.1]} />
    </group>
  );
}

function LensMark({ shape }: { shape: ReticleShape }) {
  const rotation = shape === "hex" ? Math.PI / 6 : 0;
  const segments = shape === "hex" ? 6 : shape === "spray" ? 8 : shape === "ribbon" ? 3 : 4;
  return (
    <mesh position={[0, -0.06, 0.33]} rotation={[0, 0, rotation]}>
      <ringGeometry args={[0.1, 0.115, segments]} />
      <meshBasicMaterial color="#0a0a0a" transparent opacity={0.55} side={THREE.DoubleSide} />
    </mesh>
  );
}

function darken(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const full = n.length === 3 ? n.split("").map((c) => c + c).join("") : n;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0);
  const f = (v: number) => Math.max(0, Math.round(v * (1 - amount)));
  return `#${[f(r), f(g), f(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

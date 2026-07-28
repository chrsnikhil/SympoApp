"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { RoundedBox, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import type { ReticleShape } from "@/lib/quiz/avatars";

/**
 * The actual 3D gauntlet — real geometry, a perspective camera, and real
 * lighting, rendered on its own transparent WebGL canvas pinned to the
 * bottom-right corner. If an original (non-licensed) rigged model is ever
 * dropped at `public/models/spider-hand.glb`, this loads and uses it;
 * otherwise it builds a stylised low-poly hand procedurally from primitives
 * (cylinders, a rounded box, a torus, emissive spheres) — original either
 * way, never a recreation of a specific licensed character's design.
 *
 * `fireQueueRef` is how the 2D click handler in WebShooter.tsx talks to this
 * scene without needing its own render tree inside the Canvas: a click pushes
 * a target rect onto the queue, this component's per-frame loop drains it,
 * plays the recoil, and reports back the muzzle's actual PROJECTED screen
 * position (world position → camera projection → canvas pixel space) via
 * `onFire` — so the verlet web strand in WebShooter.tsx launches from where
 * the hand really is on screen at that instant, not a guessed fixed point.
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

const RIG_SIZE = 210;
const MODEL_URL = "/models/spider-hand.glb";
const FINGER_ANGLES = [-40, -20, 0, 20, 40];

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
  // Only ever true if someone later drops an original rigged model at this
  // path — nothing in this codebase fetches or generates one. HEAD-checked
  // once so a missing file falls straight back to the procedural hand
  // instead of Suspense hanging on a 404.
  const [hasModel, setHasModel] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(MODEL_URL, { method: "HEAD" })
      .then((res) => !cancelled && setHasModel(res.ok))
      .catch(() => !cancelled && setHasModel(false));
    return () => {
      cancelled = true;
    };
  }, []);

  if (hasModel === null) return null;

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-[9998]" style={{ width: RIG_SIZE, height: RIG_SIZE }} aria-hidden="true">
      <Canvas gl={{ alpha: true, antialias: true }} camera={{ position: [0, 0.15, 3.3], fov: 28 }} style={{ background: "transparent" }}>
        <ambientLight intensity={0.55} />
        <directionalLight position={[2.4, 3, 3]} intensity={1.3} />
        <pointLight position={[-1.6, 0.4, 1.8]} intensity={0.8} color={accentColour} />
        <pointLight position={[0, -1.2, 1]} intensity={0.2} color="#ffffff" />
        <Suspense fallback={null}>
          {hasModel ? (
            <GltfHand url={MODEL_URL} fireQueueRef={fireQueueRef} onFire={onFire} reducedMotion={reducedMotion} />
          ) : (
            <ProceduralHand
              gloveColour={gloveColour}
              accentColour={accentColour}
              shape={shape}
              fireQueueRef={fireQueueRef}
              onFire={onFire}
              reducedMotion={reducedMotion}
            />
          )}
        </Suspense>
      </Canvas>
    </div>
  );
}

/** Shared per-frame behaviour: idle Y auto-rotate, a recoil kick on fire,
 *  and draining the fire queue into a projected muzzle report. Both the GLB
 *  and procedural paths call this with their own group + muzzle refs. */
function useRig(
  groupRef: React.RefObject<THREE.Group | null>,
  muzzleRef: React.RefObject<THREE.Object3D | null>,
  fireQueueRef: React.RefObject<TargetRect[]>,
  onFire: (report: NozzleReport) => void,
  reducedMotion: boolean
) {
  const recoil = useRef(0);
  const { camera, gl } = useThree();

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    // Slow idle turntable — ~0.2 rad/sec — plus a quick forward-dip recoil
    // that decays back to rest every frame.
    if (!reducedMotion) group.rotation.y += delta * 0.2;
    recoil.current *= 0.85;
    group.position.z = recoil.current * 0.15;
    group.rotation.x = -recoil.current * 0.25;

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
}

function GltfHand({
  url,
  fireQueueRef,
  onFire,
  reducedMotion,
}: {
  url: string;
  fireQueueRef: React.RefObject<TargetRect[]>;
  onFire: (report: NozzleReport) => void;
  reducedMotion: boolean;
}) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);
  const muzzleRef = useRef<THREE.Object3D>(null);
  useRig(groupRef, muzzleRef, fireQueueRef, onFire, reducedMotion);

  return (
    <group ref={groupRef}>
      <primitive object={scene} scale={1} />
      <object3D ref={muzzleRef} position={[0, 0.7, 0.15]} />
    </group>
  );
}

/**
 * Original low-poly gauntlet: five cylinder fingers fanned from a rounded
 * palm, a torus wrist band, and small emissive spheres standing in for LEDs.
 * Deliberately geometric rather than an attempt at photoreal anatomy — reads
 * clearly as a stylised hand without leaning on any licensed character's
 * silhouette or suit pattern.
 */
function ProceduralHand({
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
  const groupRef = useRef<THREE.Group>(null);
  const muzzleRef = useRef<THREE.Object3D>(null);
  const coreRef = useRef<THREE.Mesh>(null);
  useRig(groupRef, muzzleRef, fireQueueRef, onFire, reducedMotion);

  useFrame((state) => {
    if (coreRef.current) {
      const mat = coreRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = reducedMotion ? 1.1 : 1 + Math.sin(state.clock.elapsedTime * 2.2) * 0.5;
    }
  });

  const darkGlove = darken(gloveColour, 0.4);

  return (
    <group ref={groupRef} rotation={[0.15, -0.5, 0]} position={[0, -0.55, 0]}>
      {/* Forearm sleeve */}
      <mesh position={[0, -0.95, 0]}>
        <cylinderGeometry args={[0.3, 0.36, 1.1, 16]} />
        <meshStandardMaterial color="#16181d" roughness={0.65} metalness={0.25} />
      </mesh>

      {/* Wrist gauntlet — a torus band around the sleeve/palm join */}
      <mesh position={[0, -0.34, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.32, 0.09, 14, 28]} />
        <meshStandardMaterial color="#1c1f24" roughness={0.3} metalness={0.8} />
      </mesh>
      <mesh ref={coreRef} position={[0, -0.34, 0.34]}>
        <sphereGeometry args={[0.075, 20, 20]} />
        <meshStandardMaterial color={accentColour} emissive={accentColour} emissiveIntensity={1.2} toneMapped={false} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 0.3, -0.34, 0.1]}>
          <sphereGeometry args={[0.04, 12, 12]} />
          <meshStandardMaterial color={accentColour} emissive={accentColour} emissiveIntensity={0.9} toneMapped={false} />
        </mesh>
      ))}

      {/* Palm */}
      <RoundedBox args={[0.62, 0.5, 0.32]} radius={0.14} smoothness={4} position={[0, 0.06, 0]}>
        <meshStandardMaterial color={gloveColour} roughness={0.7} metalness={0.05} />
      </RoundedBox>

      {/* Fingers — five cylinders fanned from the palm top */}
      {FINGER_ANGLES.map((angle, i) => (
        <group key={i} position={[0, 0.3, 0]} rotation={[0, 0, THREE.MathUtils.degToRad(angle)]}>
          <mesh position={[0, 0.24, 0]}>
            <cylinderGeometry args={[0.065, 0.075, 0.48, 10]} />
            <meshStandardMaterial color={i % 2 === 0 ? gloveColour : darkGlove} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.49, 0]}>
            <sphereGeometry args={[0.065, 10, 10]} />
            <meshStandardMaterial color={i % 2 === 0 ? gloveColour : darkGlove} roughness={0.65} />
          </mesh>
        </group>
      ))}

      <LensMark shape={shape} />
      <object3D ref={muzzleRef} position={[0, 0.62, 0.12]} />
    </group>
  );
}

function LensMark({ shape }: { shape: ReticleShape }) {
  const rotation = shape === "hex" ? Math.PI / 6 : 0;
  const segments = shape === "hex" ? 6 : shape === "spray" ? 8 : shape === "ribbon" ? 3 : 4;
  return (
    <mesh position={[0, -0.34, 0.4]} rotation={[0, 0, rotation]}>
      <ringGeometry args={[0.09, 0.105, segments]} />
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

'use client';

import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const PARTICLE_COUNT = 600;

function generateParticles() {
  const pos = new Float32Array(PARTICLE_COUNT * 3);
  const col = new Float32Array(PARTICLE_COUNT * 3);
  const spd = new Float32Array(PARTICLE_COUNT);

  const palette = [
    [1.0, 0.176, 0.471],   // Electric Magenta #FF2D78
    [0.0, 0.941, 1.0],     // Dimensional Cyan #00F0FF
    [0.608, 0.188, 1.0],   // Portal Violet #9B30FF
    [1.0, 0.882, 0.302],   // Glitch Yellow #FFE14D
    [0.96, 0.94, 0.92],    // Ink White #F5F0EB
  ];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const i3 = i * 3;
    const angle = (i / PARTICLE_COUNT) * Math.PI * 8;
    const radius = 2 + Math.random() * 6;
    const height = (Math.random() - 0.5) * 8;

    pos[i3] = Math.cos(angle) * radius + (Math.random() - 0.5) * 1.5;
    pos[i3 + 1] = height;
    pos[i3 + 2] = Math.sin(angle) * radius + (Math.random() - 0.5) * 1.5;

    const color = palette[Math.floor(Math.random() * palette.length)];
    col[i3] = color[0];
    col[i3 + 1] = color[1];
    col[i3 + 2] = color[2];

    spd[i] = 0.2 + Math.random() * 0.8;
  }
  return { positions: pos, colors: col, speeds: spd };
}

/**
 * Swirling particle vortex — dimensional portal effect
 * Particles orbit in a toroidal/spiral pattern with Spider-Verse palette colors
 */
function ParticleField() {
  const meshRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  // Generate initial particle positions and colors
  const { positions, colors, speeds } = useMemo(() => generateParticles(), []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;

    const posArray = meshRef.current.geometry.attributes.position.array as Float32Array;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const speed = speeds[i];
      const time = timeRef.current * speed;

      // Orbit around Y axis
      const x = posArray[i3];
      const z = posArray[i3 + 2];
      const angle = Math.atan2(z, x) + delta * speed * 0.3;
      const radius = Math.sqrt(x * x + z * z);

      posArray[i3] = Math.cos(angle) * radius;
      posArray[i3 + 2] = Math.sin(angle) * radius;

      // Subtle vertical oscillation
      posArray[i3 + 1] += Math.sin(time * 2) * 0.003;
    }

    meshRef.current.geometry.attributes.position.needsUpdate = true;
    meshRef.current.rotation.y += delta * 0.05;
  });

  return (
    <points ref={meshRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.06}
        vertexColors
        transparent
        opacity={0.7}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}


/**
 * React Three Fiber animated portal background
 * Full-viewport canvas behind all content
 */
export default function PortalBackground() {
  return (
    <Canvas
      className="portal-canvas"
      camera={{ position: [0, 0, 10], fov: 60 }}
      style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 0 }}
      gl={{ alpha: true, antialias: true }}
    >
      <ambientLight intensity={0.3} />
      <ParticleField />
    </Canvas>
  );
}

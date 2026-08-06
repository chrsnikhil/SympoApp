"use client";

import { Component, Suspense, type ReactNode } from "react";
import { useGLTF, Text } from "@react-three/drei";

/**
 * Loads a manifest-provided GLB in place of the primitive stand-in.
 *
 * Two failure modes this exists to make loud rather than silent:
 *
 *  - Still loading: `useGLTF` suspends. The Suspense boundary is scoped to
 *    this one model, not shared across the Canvas — a slow or large GLB
 *    delays only its own prop, never the other four, which is the whole
 *    point of keeping props independent in the first place.
 *  - Broken or missing path: caught by `ModelErrorBoundary` below, which
 *    renders an unmistakable magenta wireframe marker carrying the offending
 *    path as a floating label, and logs the same path plus the underlying
 *    error to the console. Silently falling back to the primitive box here
 *    was the exact bug being fixed: if the manifest says a GLB belongs on a
 *    prop, something must say so loudly the moment it doesn't load, or
 *    whoever wired up the model spends their afternoon in Blender instead of
 *    here.
 */
function GLTFMesh({ path }: { path: string }) {
  const { scene } = useGLTF(path);
  return <primitive object={scene} />;
}

/** Distinct on purpose from every other prop state (default grey, hovered red, found teal) so a broken model can never be mistaken for a normal one. */
function BrokenModelMarker({ path }: { path: string }) {
  return (
    <group>
      <mesh>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshBasicMaterial color="#ff00ff" wireframe />
      </mesh>
      <Text position={[0, 0.5, 0]} fontSize={0.09} color="#ff00ff" anchorX="center" maxWidth={1.4}>
        {`MODEL FAILED\n${path}`}
      </Text>
    </group>
  );
}

/** Faint wireframe, deliberately unlike both the solved-state colours and the error marker, so "still loading" never reads as "broken" or "done". */
function LoadingPlaceholder() {
  return (
    <mesh>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshBasicMaterial color="#8d99ae" wireframe transparent opacity={0.35} />
    </mesh>
  );
}

interface BoundaryProps {
  path: string;
  children: ReactNode;
}
interface BoundaryState {
  error: Error | null;
}

class ModelErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    // Deliberately loud: a manifest entry pointing at a bad path must never
    // fail in silence, or the next person to touch this assumes their GLB
    // export is broken instead of the path in manifest.ts.
    console.error(`[MysteryRoom] failed to load model "${this.props.path}":`, error);
  }

  render() {
    if (this.state.error) return <BrokenModelMarker path={this.props.path} />;
    return this.props.children;
  }
}

export default function Model({ path }: { path: string }) {
  return (
    <ModelErrorBoundary path={path}>
      <Suspense fallback={<LoadingPlaceholder />}>
        <GLTFMesh path={path} />
      </Suspense>
    </ModelErrorBoundary>
  );
}

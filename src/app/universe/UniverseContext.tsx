"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

export interface RevealedColor {
  r: number;
  g: number;
  b: number;
  hex: string;
}

interface UniverseState {
  teamNumber: number | null;
  universeIndex: number | null;
  gridSolved: boolean;
  /** true while the portal video is playing */
  portalActive: boolean;
  /** true when navigating to Step 3 via the portal — triggers emerge anim */
  arrivingViaPortal: boolean;
  /** The team's computed RGB colour from the reveal step */
  revealedColor: RevealedColor | null;
  setTeamNumber: (n: number) => void;
  setUniverseIndex: (i: number) => void;
  setGridSolved: (solved: boolean) => void;
  setPortalActive: (active: boolean) => void;
  setArrivingViaPortal: (v: boolean) => void;
  setRevealedColor: (color: RevealedColor) => void;
  /** Register a one-shot callback that fires at video midpoint */
  registerPortalMidpoint: (cb: () => void) => void;
  /** Called by PortalOverlay when midpoint is reached */
  firePortalMidpoint: () => void;
  reset: () => void;
}

const UniverseContext = createContext<UniverseState | null>(null);

export function UniverseProvider({ children }: { children: ReactNode }) {
  const [teamNumber, setTeamNumberState] = useState<number | null>(null);
  const [universeIndex, setUniverseIndexState] = useState<number | null>(null);
  const [gridSolved, setGridSolvedState] = useState(false);
  const [portalActive, setPortalActiveState] = useState(false);
  const [arrivingViaPortal, setArrivingViaPortalState] = useState(false);
  const [revealedColor, setRevealedColorState] = useState<RevealedColor | null>(null);

  // Ref-based callback so it never causes re-renders
  const portalMidpointRef = useRef<(() => void) | null>(null);

  const setTeamNumber = useCallback((n: number) => {
    setTeamNumberState(n);
    setGridSolvedState(false);
    setRevealedColorState(null);
  }, []);

  const setUniverseIndex = useCallback((i: number) => {
    setUniverseIndexState(i);
    setGridSolvedState(false);
  }, []);

  const setGridSolved = useCallback((solved: boolean) => {
    setGridSolvedState(solved);
  }, []);

  const setPortalActive = useCallback((active: boolean) => {
    setPortalActiveState(active);
  }, []);

  const setArrivingViaPortal = useCallback((v: boolean) => {
    setArrivingViaPortalState(v);
  }, []);

  const setRevealedColor = useCallback((color: RevealedColor) => {
    setRevealedColorState(color);
  }, []);

  const registerPortalMidpoint = useCallback((cb: () => void) => {
    portalMidpointRef.current = cb;
  }, []);

  const firePortalMidpoint = useCallback(() => {
    portalMidpointRef.current?.();
    portalMidpointRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setTeamNumberState(null);
    setUniverseIndexState(null);
    setGridSolvedState(false);
    setPortalActiveState(false);
    setArrivingViaPortalState(false);
    setRevealedColorState(null);
    portalMidpointRef.current = null;
  }, []);

  return (
    <UniverseContext
      value={{
        teamNumber,
        universeIndex,
        gridSolved,
        portalActive,
        arrivingViaPortal,
        revealedColor,
        setTeamNumber,
        setUniverseIndex,
        setGridSolved,
        setPortalActive,
        setArrivingViaPortal,
        setRevealedColor,
        registerPortalMidpoint,
        firePortalMidpoint,
        reset,
      }}
    >
      {children}
    </UniverseContext>
  );
}

export function useUniverse(): UniverseState {
  const ctx = useContext(UniverseContext);
  if (!ctx) {
    throw new Error("useUniverse must be used within <UniverseProvider>");
  }
  return ctx;
}

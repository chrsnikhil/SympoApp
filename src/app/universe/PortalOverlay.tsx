"use client";

import { useCallback } from "react";
import { useUniverse } from "./UniverseContext";
import StrangePortal from "./StrangePortal";

/* ══════════════════════════════════════════════════════════════════════════
 * PortalOverlay — Layout-level Dr. Strange sling ring portal transition
 *
 * Renders inside the UniverseProvider (in layout.tsx) so it survives
 * client-side route changes.  When the crack page sets portalActive=true,
 * the particle portal opens.  At midpoint the registered callback fires
 * (crack page uses it to router.push to the universe landing).  When the
 * portal closes, portalActive is reset to false and the overlay fades out.
 * ══════════════════════════════════════════════════════════════════════════ */
export default function PortalOverlay() {
  const { portalActive, setPortalActive, firePortalMidpoint } = useUniverse();

  const handleComplete = useCallback(() => {
    setPortalActive(false);
  }, [setPortalActive]);

  const handleMidpoint = useCallback(() => {
    firePortalMidpoint();
  }, [firePortalMidpoint]);

  return (
    <StrangePortal
      active={portalActive}
      onComplete={handleComplete}
      onMidpoint={handleMidpoint}
    />
  );
}

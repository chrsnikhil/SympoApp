import React, { useState, useEffect } from 'react';

/**
 * GlitchTransition Component
 *
 * Wraps page/screen changes in a glitch transition effect.
 * Respects `prefers-reduced-motion` by swapping glitch tears for simple fades.
 */
export default function GlitchTransition({ children, activeKey }) {
  const [isGlitching, setIsGlitching] = useState(false);
  const [displayedKey, setDisplayedKey] = useState(activeKey);

  useEffect(() => {
    if (activeKey !== displayedKey) {
      setIsGlitching(true);
      const timer = setTimeout(() => {
        setDisplayedKey(activeKey);
        setIsGlitching(false);
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [activeKey, displayedKey]);

  return (
    <div className={`transition-container ${isGlitching ? 'is-glitching' : ''}`}>
      {children}
    </div>
  );
}

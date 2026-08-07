"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/**
 * Catches anything thrown inside the Canvas and says so on screen.
 *
 * A three.js scene that throws during render does not render an error — it
 * renders a black rectangle, because the WebGL clear never happens and the
 * DOM overlay carries on drawing over the top of nothing. The HUD looks
 * healthy, the room is simply gone, and there is nothing to read without
 * opening devtools.
 *
 * That is the same failure the guide's MysteryRoomModel error boundary exists
 * to prevent for a single bad GLB path, applied to the whole scene: if the
 * room cannot draw, something must say why, in the place the room should have
 * been.
 *
 * This wraps <Canvas> from the DOM side. R3F's scene children are part of the
 * same React tree, so a DOM boundary catches their render errors normally.
 */
export default class RoomBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("[MysteryRoom] the scene failed to render:", error);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full w-full flex-col gap-3 overflow-auto bg-[#1a0d10] p-6 font-mono text-sm text-[#ff9d9d]">
        <p className="text-base font-bold text-[#ff5f5f]">The room failed to render.</p>
        <p className="text-[#ffc9c9]">{error.message}</p>
        <pre className="whitespace-pre-wrap text-xs text-[#d89a9a]">{error.stack}</pre>
      </div>
    );
  }
}

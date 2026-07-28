"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizRound } from "@/lib/db/types";

/**
 * Rounds 2 & 3 run full-screen and treat leaving that surface as worth
 * knowing about.
 *
 * DELIBERATELY NOT ENFORCEMENT. A browser can't be trusted to police itself —
 * a determined team can always suppress a client-side check, and this
 * doesn't pretend otherwise. It's a timestamped signal for the coordinator to
 * review (the admin dashboard's "Proctor flags" panel), same spirit as the
 * append-only score ledger: record what was observed, let a human decide.
 */
export default function ProctorGate({ round, children }: { round: QuizRound; children: React.ReactNode }) {
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  const [supported, setSupported] = useState(
    () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen
  );
  const [justExited, setJustExited] = useState(false);
  const armed = useRef(false);

  const flag = useCallback(
    (kind: "tab-switch" | "window-blur" | "fullscreen-exit") => {
      void fetch("/api/quiz/flag", {
        method: "POST",
        headers: { "content-type": "application/json" },
        keepalive: true,
        body: JSON.stringify({ round, kind }),
      });
    },
    [round]
  );

  useEffect(() => {
    function onFullscreenChange() {
      const isFull = !!document.fullscreenElement;
      setFullscreen(isFull);
      if (armed.current && !isFull) {
        flag("fullscreen-exit");
        setJustExited(true);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [flag]);

  useEffect(() => {
    if (!fullscreen) return;
    armed.current = true;

    function onVisibility() {
      if (document.hidden) flag("tab-switch");
    }
    function onBlur() {
      flag("window-blur");
    }
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
    };
  }, [fullscreen, flag]);

  async function enter() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers/embeds refuse fullscreen outright (iOS Safari on a
      // non-video element, some kiosk/embedded webviews). Don't hard-block
      // the quiz over a request the platform will never grant — drop the
      // gate and stop asking, rather than stranding a team on this screen.
      setSupported(false);
    }
  }

  if (fullscreen || !supported) return <>{children}</>;

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="halftone panel anim-glitch-in max-w-md p-8 text-center">
        <p className="display-title chromatic text-3xl text-paper-white">Full Screen Required</p>
        <p className="mt-3 text-sm text-paper-white/60">
          Round {round} runs full-screen. Tab switches, window changes and dropping out of full screen are flagged
          for the coordinator to review.
        </p>
        {justExited && <p className="anim-shake mt-3 text-xs text-signal-wrong">Left full screen — that&apos;s been flagged. Re-enter to continue.</p>}
        <button type="button" onClick={enter} data-web-target="" className="comic-btn comic-btn-cyan mt-6">
          Enter Full Screen
        </button>
      </div>
    </div>
  );
}

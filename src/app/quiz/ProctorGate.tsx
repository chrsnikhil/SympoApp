"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizRound } from "@/lib/db/types";

/**
 * Rounds 2 & 3 run full-screen and treat leaving that surface as worth
 * knowing about.
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
      setSupported(false);
    }
  }

  if (fullscreen || !supported) return <>{children}</>;

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="bg-surface comic-border p-8 md:p-12 text-center max-w-md comic-tilt-left relative overflow-hidden">
        <div className="absolute inset-0 ben-day pointer-events-none opacity-10"></div>
        <p className="font-display-xl text-headline-lg text-on-surface uppercase italic mb-3">Full Screen Required</p>
        <p className="font-body-md text-on-surface-variant text-sm leading-relaxed mb-4">
          Round {round} runs full-screen. Tab switches, window changes and dropping out of full screen are flagged
          for the coordinator to review.
        </p>
        {justExited && (
          <p className="font-label-sm text-primary uppercase text-xs mb-4">
            Left full screen — that&apos;s been flagged. Re-enter to continue.
          </p>
        )}
        <button
          type="button"
          onClick={enter}
          data-web-target=""
          className="relative bg-primary px-8 py-4 comic-border comic-tilt-right inline-flex transition-all duration-100 hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[6px_6px_0px_0px_rgba(27,27,28,1)] active:scale-95"
        >
          <span className="font-display-xl text-headline-lg-mobile text-on-primary uppercase tracking-widest">
            Enter Full Screen
          </span>
        </button>
      </div>
    </div>
  );
}

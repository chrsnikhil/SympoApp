"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizRound } from "@/lib/db/types";
import FrozenScreen from "./FrozenScreen";
import { useProctorStrikes } from "@/lib/quiz/useProctorStrikes";

const STATUS_POLL_MS = 2000;

/**
 * Rounds 2 & 3 run full-screen and treat leaving that surface as worth
 * knowing about. Tab switches and window blur now feed the same strike/freeze
 * system Round 1's Connections and Memory Game use (see `useProctorStrikes`):
 * three warnings, then a freeze a coordinator has to clear. Fullscreen-exit
 * stays a plain logged flag — it already re-gates the UI on its own by
 * falling back to this screen, so freezing on top of that would be redundant.
 */
export default function ProctorGate({ round, children }: { round: QuizRound; children: React.ReactNode }) {
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  const [supported, setSupported] = useState(
    () => typeof document !== "undefined" && !!document.documentElement.requestFullscreen
  );
  const [justExited, setJustExited] = useState(false);
  const [polledFrozen, setPolledFrozen] = useState(false);
  const [polledReason, setPolledReason] = useState<string | null>(null);
  const armed = useRef(false);

  // `polledFrozen` (from the dedicated poll below, refreshed every 2s) is the
  // sole source of truth for whether the freeze screen shows — it's what lets
  // an admin's "unfreeze" click actually take effect.
  const { warning } = useProctorStrikes(round, fullscreen, polledFrozen);
  const frozen = polledFrozen;
  const frozenReason = polledReason;

  const flagFullscreenExit = useCallback(() => {
    void fetch("/api/quiz/flag", {
      method: "POST",
      headers: { "content-type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ round, kind: "fullscreen-exit" }),
    });
  }, [round]);

  useEffect(() => {
    function onFullscreenChange() {
      const isFull = !!document.fullscreenElement;
      setFullscreen(isFull);
      if (armed.current && !isFull) {
        flagFullscreenExit();
        setJustExited(true);
      }
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [flagFullscreenExit]);

  useEffect(() => {
    if (fullscreen) armed.current = true;
  }, [fullscreen]);

  // Attempt automatic fullscreen on mount (will silently fail if browser requires user gesture)
  useEffect(() => {
    if (!fullscreen && supported && !justExited && !armed.current) {
      document.documentElement.requestFullscreen().catch(() => {
        // Browser blocked automatic fullscreen; user will have to click the manual button
      });
    }
  }, [fullscreen, supported, justExited]);

  // Authoritative freeze check — catches a freeze that happened before a
  // reload (the strikes hook's own state resets on mount) and one triggered
  // by the 10-second background timer while this tab was hidden.
  useEffect(() => {
    if (!fullscreen) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/quiz/proctor-status?round=${round}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body: { frozen: boolean; reason: string | null } = await res.json();
        setPolledFrozen(body.frozen);
        setPolledReason(body.reason);
      } catch {
        // Retry next poll
      }
    }
    void poll();
    const id = setInterval(poll, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [fullscreen, round]);

  async function enter() {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      setSupported(false);
    }
  }

  if (!fullscreen && supported) {
    return (
      <div className="grid min-h-[60vh] place-items-center px-4">
        <div className="bg-surface comic-border p-8 md:p-12 text-center max-w-md comic-tilt-left relative overflow-hidden">
          <div className="absolute inset-0 ben-day pointer-events-none opacity-10"></div>
          <p className="font-display-xl text-headline-lg text-on-surface uppercase italic mb-3">Full Screen Required</p>
          <p className="font-body-md text-on-surface-variant text-sm leading-relaxed mb-4">
            Round {round} runs full-screen. Tab switches, window changes and dropping out of full screen are flagged
            for the coordinator to review — repeated tab switches will freeze this round.
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

  if (frozen) {
    return <FrozenScreen reason={frozenReason} variant="light" />;
  }

  return (
    <>
      {warning && (
        <div
          role="alert"
          className="pop-in mb-6 comic-border bg-primary text-on-primary p-4 font-headline-lg text-caption-bold uppercase"
        >
          ⚠️ {warning.message}
        </div>
      )}
      {children}
    </>
  );
}

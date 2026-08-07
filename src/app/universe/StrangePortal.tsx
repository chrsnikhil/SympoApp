"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/* ══════════════════════════════════════════════════════════════════════════
 * StrangePortal — Fullscreen Video Transition Overlay
 *
 * Plays a looping-style transition video (/portal-transition.mp4) as a
 * fullscreen overlay.  At a configurable midpoint the registered callback
 * fires so the underlying page can navigate.  When the video ends (or the
 * natural duration elapses) the overlay fades out and fires onComplete.
 *
 * Props:
 *   active           – starts the transition when flipped to true
 *   onComplete       – fires after the overlay fades out
 *   onMidpoint       – fires once at the midpoint fraction of the video
 *   midpointFraction – timing ratio (default 0.45)
 * ══════════════════════════════════════════════════════════════════════════ */

interface StrangePortalProps {
  active: boolean;
  onComplete: () => void;
  onMidpoint?: () => void;
  midpointFraction?: number;
}

export default function StrangePortal({
  active,
  onComplete,
  onMidpoint,
  midpointFraction = 0.45,
}: StrangePortalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const midpointFiredRef = useRef(false);

  // Keep refs to callbacks so the effect closure stays stable
  const onCompleteRef = useRef(onComplete);
  const onMidpointRef = useRef(onMidpoint);
  onCompleteRef.current = onComplete;
  onMidpointRef.current = onMidpoint;

  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  /* ── Handle the video lifecycle when `active` flips to true ───────── */
  useEffect(() => {
    if (!active) return;

    const video = videoRef.current;
    if (!video) return;

    setVisible(true);
    setFadeOut(false);
    midpointFiredRef.current = false;

    // Reset to beginning
    video.currentTime = 0;
    video.playbackRate = 1;

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        // Autoplay may be blocked — try muted
        video.muted = true;
        video.play().catch(() => {});
      });
    }

    /* ── Only play the first 2 seconds of the video ─────────────────── */
    const MAX_PLAY_SECONDS = 2;
    let dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      video.pause();
      setFadeOut(true);
      setTimeout(() => {
        setVisible(false);
        setFadeOut(false);
        onCompleteRef.current();
      }, 500);
    }

    /* ── Time-based midpoint + cutoff check ──────────────────────────── */
    function onTimeUpdate() {
      if (!video) return;

      // Fire midpoint once at ~45% of the 2-second window
      if (!midpointFiredRef.current && video.currentTime >= MAX_PLAY_SECONDS * midpointFraction) {
        midpointFiredRef.current = true;
        onMidpointRef.current?.();
      }

      // Hard cutoff at 2 seconds
      if (video.currentTime >= MAX_PLAY_SECONDS) {
        dismiss();
      }
    }

    /* ── Video ended naturally (shouldn't happen but just in case) ──── */
    function onEnded() {
      if (!midpointFiredRef.current) {
        midpointFiredRef.current = true;
        onMidpointRef.current?.();
      }
      dismiss();
    }

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
      video.pause();
    };
  }, [active, midpointFraction]);

  /* ── Dismiss handler for tapping through ─────────────────────────── */
  const handleOverlayClick = useCallback(() => {
    // Allow skipping the transition after midpoint has fired
    if (midpointFiredRef.current) {
      const video = videoRef.current;
      if (video) video.pause();
      setFadeOut(true);
      setTimeout(() => {
        setVisible(false);
        setFadeOut(false);
        onCompleteRef.current();
      }, 400);
    }
  }, []);

  if (!visible && !active) return null;

  return (
    <div
      className={`strange-portal-overlay ${visible ? "sp-visible" : ""} ${
        fadeOut ? "sp-fade-out" : ""
      }`}
      onClick={handleOverlayClick}
    >
      <video
        ref={videoRef}
        className="sp-video"
        src="/portal-transition.mp4"
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}

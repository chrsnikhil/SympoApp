"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Whether temporal dithering is on for this viewer, and the viewer's own
 * override.
 *
 * Three inputs, in order of authority:
 *
 *  1. `NEXT_PUBLIC_QUIZ_DITHER` — the coordinator's switch for the event.
 *     Off unless explicitly set, because this is a deliberate accessibility
 *     trade and nothing should inherit it silently. This is the only
 *     `NEXT_PUBLIC_` value in the app: it has to reach the browser to decide
 *     what the browser paints, and it is a boolean feature flag, not a secret.
 *  2. `prefers-reduced-motion` — applied inside `shouldDither`, unconditional.
 *     Someone whose OS already says they are sensitive to motion must never
 *     have to find a per-site control first.
 *  3. This opt-out — a per-device choice, kept in localStorage so it survives
 *     the reloads a quiz round produces. Deliberately NOT server state: a team
 *     that needs it needs it immediately, not after a round trip, and it must
 *     work even if the request fails.
 */
const OPT_OUT_KEY = "xplore26:dither-opt-out";

export function useDitherSetting(): {
  /** Pass to the render path. False if the flag is off or the viewer opted out. */
  ditherEnabled: boolean;
  /** True when the flag is on — i.e. when the warning and the toggle are relevant at all. */
  ditherOffered: boolean;
  optedOut: boolean;
  setOptedOut: (v: boolean) => void;
} {
  const flagOn = process.env.NEXT_PUBLIC_QUIZ_DITHER === "1";
  const [optedOut, setOptedOutState] = useState(false);

  // Read after mount: localStorage does not exist during SSR, and reading it in
  // an initialiser would desync the server and client renders.
  useEffect(() => {
    try {
      setOptedOutState(window.localStorage.getItem(OPT_OUT_KEY) === "1");
    } catch {
      // Storage blocked (private mode, hardened settings). Default to showing
      // the effect rather than silently disabling a control the coordinator
      // switched on — the warning and toggle are still rendered either way.
    }
  }, []);

  const setOptedOut = useCallback((v: boolean) => {
    setOptedOutState(v);
    try {
      if (v) window.localStorage.setItem(OPT_OUT_KEY, "1");
      else window.localStorage.removeItem(OPT_OUT_KEY);
    } catch {
      // Non-fatal: the in-memory state above still takes effect for this session.
    }
  }, []);

  return {
    ditherEnabled: flagOn && !optedOut,
    ditherOffered: flagOn,
    optedOut,
    setOptedOut,
  };
}

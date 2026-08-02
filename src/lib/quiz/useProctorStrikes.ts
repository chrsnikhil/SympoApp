"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizRound } from "@/lib/db/types";

export interface ProctorWarning {
  strikes: number;
  message: string;
}

/**
 * Client-side half of the tab-switch strike-and-freeze system (server half in
 * `/api/quiz/flag`). Strikes 1-3 surface a warning banner; a 4th strike, or a
 * single switch away that runs 10+ seconds, freezes the team.
 *
 * This hook only reports *warnings* — it deliberately does NOT own "am I
 * frozen" as persistent state, because that state can only be lifted by a
 * coordinator, and a `useState` set once to `true` here would have no way to
 * hear about that and go back to `false` short of an unmount. Freeze/unfreeze
 * is instead the caller's job, driven by whatever authoritative poll it
 * already runs (`/api/quiz/round1` for Round 1, `/api/quiz/proctor-status`
 * for Rounds 2/3) — that's what `alreadyFrozen` is: the caller's current
 * answer to "am I frozen," fed back in so this hook knows to stop reporting
 * (and knows to resume once the coordinator clears it).
 *
 * `active` gates the whole thing on top of that — callers pass `false`
 * whenever the team is somewhere tab-switching is expected (Round 1's Image
 * Replication game), so it never arms there at all. Both `visibilitychange`
 * and `blur`/`focus` are tracked and de-duplicated against each other, since
 * which pair fires for an OS-level app switch varies by browser.
 *
 * The 10-second long-switch timer is a `setTimeout` started the moment the
 * team leaves, not a poll — background tabs throttle timers but don't stop
 * them outright, and the report uses `keepalive` so it still lands even if
 * the tab is hidden when it fires.
 */
export function useProctorStrikes(round: QuizRound, active: boolean, alreadyFrozen: boolean) {
  const [warning, setWarning] = useState<ProctorWarning | null>(null);

  const awaySinceRef = useRef<number | null>(null);
  const longSwitchTimer = useRef<number | null>(null);
  const warningTimer = useRef<number | null>(null);

  const report = useCallback(
    async (longSwitch: boolean) => {
      try {
        const res = await fetch("/api/quiz/flag", {
          method: "POST",
          headers: { "content-type": "application/json" },
          keepalive: true,
          body: JSON.stringify({ round, kind: "tab-switch", longSwitch }),
        });
        if (!res.ok) return;
        const body: { strikes?: number; frozen?: boolean } = await res.json();

        if (body.frozen) {
          // The caller's own authoritative poll picks this up on its next
          // tick and renders the freeze screen — nothing more to do here.
          setWarning(null);
          return;
        }

        if (typeof body.strikes === "number") {
          const remaining = Math.max(0, 3 - body.strikes);
          setWarning({
            strikes: body.strikes,
            message:
              remaining > 0
                ? `Tab switch detected — warning ${body.strikes}/3. ${remaining} more and this round freezes until the coordinator clears it.`
                : "Final warning — one more tab switch will freeze this round until the coordinator clears it.",
          });
          if (warningTimer.current) window.clearTimeout(warningTimer.current);
          warningTimer.current = window.setTimeout(() => setWarning(null), 6000);
        }
      } catch {
        // Best-effort — nothing sensible to do if the report itself fails.
      }
    },
    [round]
  );

  useEffect(() => {
    if (!active || alreadyFrozen) return;

    function markAway() {
      if (awaySinceRef.current) return;
      awaySinceRef.current = Date.now();
      longSwitchTimer.current = window.setTimeout(() => {
        awaySinceRef.current = null;
        void report(true);
      }, 10_000);
    }

    function markBack() {
      if (!awaySinceRef.current) return;
      const awayMs = Date.now() - awaySinceRef.current;
      awaySinceRef.current = null;
      if (longSwitchTimer.current) {
        window.clearTimeout(longSwitchTimer.current);
        longSwitchTimer.current = null;
      }
      if (awayMs >= 10_000) return; // the long-switch timer already reported this one
      void report(false);
    }

    function onVisibility() {
      if (document.hidden) markAway();
      else markBack();
    }
    function onBlur() {
      markAway();
    }
    function onFocus() {
      markBack();
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (longSwitchTimer.current) window.clearTimeout(longSwitchTimer.current);
    };
  }, [active, alreadyFrozen, report]);

  useEffect(() => {
    return () => {
      if (warningTimer.current) window.clearTimeout(warningTimer.current);
    };
  }, []);

  return { warning };
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Blueprint Recovery, as a hunt round.
 *
 * The original was a separate Vite application with its own package.json,
 * router, Supabase client and nine screens driven by a `screen` state machine.
 * This is the same mechanic on this platform's rails: the sector comes from the
 * session, the code is checked server-side, and a solve scores through
 * /api/submit like every other round.
 *
 * WHAT WAS DROPPED, AND WHY.
 *
 * The team-identification screen. It asked the player to type their team number
 * and believed the answer, which meant a team could claim any of the sixty and
 * be sent to whichever sector they preferred — in a round whose whole difficulty
 * is that the code lives at one physical place. The number is a property of the
 * session here, so the screen has nothing left to ask.
 *
 * The coordinator dashboard. It read and wrote Supabase directly from the
 * browser with an anon key. Coordinator tooling belongs behind the admin role
 * on the admin console, not in the participant bundle.
 *
 * The Supabase client, and the progress table behind it. hunt_progress already
 * records unlocked/solved/hints for every round, and a second store that only
 * this round used would drift from the leaderboard the moment either changed.
 */

type Stage = "briefing" | "sector" | "code" | "done";

interface SectorData {
  sectorNumber: number;
  colour: string;
  dimension: string;
  accent: string;
}

export default function BlueprintFlow() {
  const [stage, setStage] = useState<Stage>("briefing");
  const [sector, setSector] = useState<SectorData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [checking, setChecking] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/blueprint/sector", { cache: "no-store" });
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setLoadError((body as { error?: string }).error ?? "Could not reach the sector map.");
          return;
        }
        setSector(body as SectorData);
      } catch {
        if (!cancelled) setLoadError("Network error — check your connection and refresh.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submitCode = useCallback(async () => {
    if (checking || !code.trim()) return;
    setChecking(true);
    setWrong(false);
    setSubmitError("");
    try {
      /**
       * The shared pipeline, not a bespoke endpoint. It stamps the server
       * clock, rate-limits, claims the solve atomically so a double-tap cannot
       * pay twice, deducts spent hints and re-materialises the leaderboard —
       * none of which is worth reimplementing beside the thing that already
       * does it. gradeHunt routes this to gradeBlueprint on config.flow, and
       * that resolves the team's sector from the team record; the sector this
       * component knows is for display and is deliberately not sent.
       */
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "hunt",
          challengeSlug: "hunt-blueprint",
          payload: code.trim(),
        }),
      });
      const body = (await res.json()) as { correct?: boolean; meta?: { reason?: string }; error?: string };
      if (!res.ok) {
        setSubmitError(body.error ?? "Could not check that — try again.");
        return;
      }
      // already-solved comes back correct:false. A team that refreshes after
      // winning should see the win, not be told they are wrong.
      if (body.correct || body.meta?.reason === "already-solved") {
        setStage("done");
      } else {
        setWrong(true);
      }
    } catch {
      setSubmitError("Network error — try again.");
    } finally {
      setChecking(false);
    }
  }, [checking, code]);

  if (loadError) {
    return (
      <div className="panel p-6 text-center">
        <p className="font-mono text-sm text-paper-white/70">{loadError}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl">
      {stage === "briefing" && (
        <section className="panel p-6">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-glitch-cyan">
            Mission Briefing
          </p>
          <h2 className="display-title mt-2 text-3xl text-paper-white">The lattice has broken</h2>
          <p className="mt-3 text-sm leading-relaxed text-paper-white/70">
            A multiversal engineering network has fractured and a blueprint has
            scattered across the sectors. You have been assigned one of them.
            Find the sector, recover the access code left there, and bring it
            back here before the breach widens.
          </p>
          <button
            onClick={() => setStage("sector")}
            className="mt-6 border-2 border-glitch-cyan px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-glitch-cyan transition-colors hover:bg-glitch-cyan hover:text-ink-black"
          >
            Reveal my sector
          </button>
        </section>
      )}

      {stage === "sector" && (
        <section className="panel p-6 text-center">
          {!sector ? (
            <p className="font-mono text-sm text-paper-white/60">Locating your sector…</p>
          ) : (
            <>
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-paper-white/50">
                Sector {sector.sectorNumber} of 10
              </p>
              <h2
                className="display-title mt-3 text-5xl"
                style={{ color: sector.accent }}
              >
                {sector.colour.toUpperCase()}
              </h2>
              <p className="mt-1 font-mono text-sm tracking-[0.25em] text-paper-white/70">
                {sector.dimension}
              </p>
              <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-paper-white/65">
                Go to the {sector.colour} sector. The access code is on the card
                you will find there — it is not on this screen, and no amount of
                looking at this page will produce it.
              </p>
              <button
                onClick={() => setStage("code")}
                className="mt-6 border-2 border-paper-white/40 px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-paper-white/80 transition-colors hover:border-paper-white"
              >
                I have the code
              </button>
            </>
          )}
        </section>
      )}

      {stage === "code" && (
        <section className="panel p-6">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-glitch-cyan">
            Final Access Code
          </p>
          <h2 className="display-title mt-2 text-2xl text-paper-white">
            Enter what you recovered
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitCode();
            }}
            className="mt-5 flex flex-wrap gap-2"
          >
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setWrong(false);
              }}
              placeholder="SECTOR ACCESS CODE"
              autoComplete="off"
              spellCheck={false}
              className="min-w-[240px] flex-1 border-2 border-paper-white/20 bg-ink-black/60 px-4 py-2.5 font-mono text-lg uppercase text-paper-white outline-none transition-all focus:border-glitch-cyan"
            />
            <button
              type="submit"
              disabled={checking || !code.trim()}
              className="border-2 border-glitch-cyan px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-glitch-cyan transition-colors hover:bg-glitch-cyan hover:text-ink-black disabled:opacity-40"
            >
              {checking ? "Checking…" : "Submit"}
            </button>
          </form>

          {wrong && (
            <p className="mt-3 font-mono text-xs text-signal-wrong">
              Not the code for your sector. Check you are reading the card from
              the {sector?.colour ?? "assigned"} sector.
            </p>
          )}
          {submitError && (
            <p className="mt-3 font-mono text-xs text-signal-wrong">{submitError}</p>
          )}

          <button
            onClick={() => setStage("sector")}
            className="mt-5 font-mono text-[0.65rem] uppercase tracking-[0.25em] text-paper-white/40 hover:text-paper-white/70"
          >
            ← Remind me which sector
          </button>
        </section>
      )}

      {stage === "done" && (
        <section className="panel p-8 text-center">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.35em] text-glitch-cyan">
            Evidence Secured
          </p>
          <h2 className="display-title mt-2 text-4xl text-paper-white">Blueprint recovered</h2>
          <p className="mx-auto mt-3 max-w-sm text-sm text-paper-white/65">
            The sector is sealed and the fragment is yours. Your points are on
            the hunt leaderboard.
          </p>
          <a
            href="/hunt"
            className="mt-6 inline-block border-2 border-glitch-cyan px-5 py-2 font-mono text-xs uppercase tracking-[0.25em] text-glitch-cyan transition-colors hover:bg-glitch-cyan hover:text-ink-black"
          >
            Back to the hunt
          </a>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import Celebration from "./Celebration";
import Mcq2Phase from "./Mcq2Phase";
import ProctorGate from "./ProctorGate";
import QuizEndedScreen from "./QuizEndedScreen";
import QuizRulesLobby from "./QuizRulesLobby";
import Round1Games from "./Round1Games";
import Standings from "./Standings";
import WebShooter, { WebNet } from "./WebShooter";

const DEFAULT_PERSONA = {
  colour: "#3a86ff",
  webColour: "#9ec5ff",
  gloveColour: "#e5223b",
  reticle: "classic" as const,
  shout: "NAILED IT.",
  miss: "...YEAH, NO.",
};

const ROUND_TITLES: Record<QuizRound, string> = {
  1: "Final Universe",
  2: "Universe 1 — Warm-up",
  3: "Universe 2 — Multiverse Abilities",
};

const ROUND_SUBTITLES: Record<QuizRound, string> = {
  1: "Three games. One combined score.",
  2: "6s to read, 10s to answer. No exceptions.",
  3: "Same clock. Live leaderboard. Comeback Meter is live.",
};

const STATUS_POLL_MS = 6000;

export default function QuizClient({
  round,
  teamName,
  avatar,
  isAdmin,
  isEliminated = false,
  ended = false,
  started = false,
}: {
  round: QuizRound;
  teamName: string;
  avatar: Avatar | null;
  isAdmin: boolean;
  isEliminated?: boolean;
  ended?: boolean;
  started?: boolean;
}) {
  const persona = avatar ?? DEFAULT_PERSONA;
  const router = useRouter();
  const [incoming, setIncoming] = useState<QuizRound | null>(null);
  const [eliminatedState, setEliminatedState] = useState(isEliminated);
  const [endedState, setEndedState] = useState(ended);
  const [startedState, setStartedState] = useState(started);
  const [seenRound, setSeenRound] = useState(round);
  const knownRound = useRef(round);

  if (round !== seenRound) {
    setSeenRound(round);
    setIncoming(null);
  }

  useEffect(() => {
    knownRound.current = round;
  }, [round]);

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/quiz/status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body: { round: QuizRound; eliminated?: boolean; ended?: boolean; started?: boolean } = await res.json();
        if (body.eliminated !== undefined) setEliminatedState(body.eliminated);
        if (body.ended !== undefined) setEndedState(body.ended);
        if (body.started !== undefined) setStartedState(body.started);
        if (body.round !== knownRound.current) setIncoming(body.round);
      } catch {
        // A missed poll just tries again next tick
      }
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (endedState) {
    return <QuizEndedScreen round={round} teamName={teamName} avatar={avatar} />;
  }

  /* PRE-QUIZ LOBBY & RULES SCREEN — SHOWS TEAM DETAILS AND RULES BEFORE START */
  if (!startedState && !isAdmin) {
    return <QuizRulesLobby teamName={teamName} avatar={avatar} round={round} />;
  }

  if (incoming) {
    return <RoundTransition round={incoming} onDone={() => router.refresh()} />;
  }

  /* ELIMINATED / SOLACE SCREEN — SHOWS LEADERBOARD ALONE WITH SPIDER-VERSE CONSOLATION */
  if (eliminatedState) {
    return (
      <main className="min-h-full py-8 px-4">
        <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0"
          style={{ background: "radial-gradient(ellipse at 50% -10%, var(--spider-red) 0%, transparent 60%)" }}
        />

        <div className="relative mx-auto max-w-4xl space-y-8 text-center">
          <div className="halftone panel panel-accent p-8 space-y-4 border-2 border-spider-red bg-ink-black/80">
            <div className="text-5xl animate-bounce">🕸️</div>
            <h1 className="display-title chromatic text-3xl sm:text-4xl text-spider-red uppercase tracking-wide">
              HEROIC EFFORT, {teamName.toUpperCase()}!
            </h1>
            <p className="text-sm sm:text-base text-paper-white/80 max-w-lg mx-auto leading-relaxed">
              Your active journey in this round has concluded, but your performance was legendary! 
              You can sit back and watch the live multiverse leaderboard below as the remaining Spider-Heroes battle for glory.
            </p>
            <div className="inline-block px-4 py-1.5 border border-comic-yellow bg-comic-yellow/10 text-comic-yellow text-xs font-bold uppercase tracking-widest rounded">
              📺 Live Spectator Mode — Leaderboard
            </div>
          </div>

          {/* LEADERBOARD ALONE */}
          <div className="max-w-md mx-auto">
            <Standings round={round} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full">
      <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(ellipse at 50% -10%, var(--web-blue-dark) 0%, transparent 55%)" }}
      />

      <div className="relative mx-auto max-w-5xl px-5 py-8">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b-2 border-paper-white/10 pb-5">
          <div className="flex items-center gap-3">
            <span
              className="grid h-12 w-12 place-items-center font-display text-xl"
              style={{
                background: avatar ? `${avatar.colour}1f` : "rgba(242,239,233,0.06)",
                border: `3px solid ${avatar?.colour ?? "rgba(242,239,233,0.25)"}`,
                boxShadow: `3px 3px 0 ${avatar?.colour ?? "rgba(242,239,233,0.25)"}33`,
                color: avatar?.colour ?? "#F2EFE9",
              }}
            >
              {teamName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div className="font-display text-lg uppercase leading-none tracking-wide text-paper-white">{teamName}</div>
              <div className="mt-1 text-xs text-paper-white/55">{avatar ? `${avatar.name} · ${avatar.tagline}` : "Awaiting identity"}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[0.65rem] uppercase tracking-[0.25em] text-glitch-cyan">Round {round}</div>
            <div className="display-title chromatic mt-0.5 text-2xl text-paper-white">{ROUND_TITLES[round]}</div>
            <div className="mt-0.5 text-[0.7rem] text-paper-white/45">{ROUND_SUBTITLES[round]}</div>
          </div>
        </header>

        <div className="grid gap-8 md:grid-cols-[18rem_1fr]">
          <Standings round={round} />

          <section className="min-w-0">
            {round === 1 ? (
              <Round1Games />
            ) : (
              <ProctorGate round={round}>
                <Mcq2Phase round={round} persona={persona} />
              </ProctorGate>
            )}

            {isAdmin && (
              <p className="mt-6 border-l-2 border-paper-white/15 pl-3 text-xs text-paper-white/45">
                Signed in as coordinator. The dashboard lives on the app host, not this event
                subdomain — <code className="font-mono text-paper-white/70">/admin/quiz</code> on
                app.&lt;domain&gt; (or plain localhost in dev), since <code className="font-mono text-paper-white/70">proxy.ts</code>{" "}
                rewrites every other host into its event&apos;s route group.
              </p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/**
 * Full-screen "the coordinator just cut to the next round" moment. Shown for
 * a fixed beat, then hands off to `router.refresh()` so the server component
 * re-resolves the real round and everything downstream (serve, standings,
 * comeback state) loads fresh rather than being patched in client-side.
 */
function RoundTransition({ round, onDone }: { round: QuizRound; onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 2600);
    return () => window.clearTimeout(t);
  }, [onDone]);

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 40%, var(--web-blue-dark) 0%, transparent 60%)" }}
      />
      <span aria-hidden="true" className="web-sweep pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <WebNet colour="var(--glitch-cyan)" originX={50} originY={50} animate={false} />
      </span>
      <div className="halftone panel panel-accent anim-glitch-in relative max-w-lg overflow-visible p-10 text-center">
        <Celebration />
        <p className="text-[0.7rem] uppercase tracking-[0.3em] text-glitch-cyan">Round {round} unlocked</p>
        <p className="display-title chromatic anim-surge mt-2 text-4xl text-paper-white sm:text-5xl">{ROUND_TITLES[round]}</p>
        <p className="comic-shout mt-3 text-xl text-spider-red">{ROUND_SUBTITLES[round]}</p>
      </div>
    </main>
  );
}

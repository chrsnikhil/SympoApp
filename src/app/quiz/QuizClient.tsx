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
import WebShooter from "./WebShooter";

const DEFAULT_PERSONA = {
  colour: "#a41616",
  webColour: "#41617e",
  gloveColour: "#1b1b1c",
  reticle: "classic" as const,
  shout: "NAILED IT.",
  miss: "...YEAH, NO.",
};

const ROUND_TITLES: Record<QuizRound, string> = {
  1: "Into the Spider-Verse",
  2: "Beyond the Spider-Verse",
  3: "Multiverse Abilities",
};

const ROUND_SUBTITLES: Record<QuizRound, string> = {
  1: "Three games. One combined score.",
  2: "6s to read, 10s to answer. No exceptions.",
  3: "Same clock. Live leaderboard. Comeback Meter is live.",
};

const STATUS_POLL_MS = 2500;

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
  const [showCountdown, setShowCountdown] = useState(false);
  const [seenRound, setSeenRound] = useState(round);
  const knownRound = useRef(round);
  const prevStarted = useRef(started);

  if (round !== seenRound) {
    setSeenRound(round);
    setIncoming(null);
  }

  useEffect(() => {
    knownRound.current = round;
  }, [round]);

  useEffect(() => {
    if (!prevStarted.current && startedState) {
      setShowCountdown(true);
    }
    prevStarted.current = startedState;
  }, [startedState]);

  useEffect(() => {
    let cancelled = false;
    const id = setInterval(async () => {
      try {
        const res = await fetch("/api/quiz/status", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const body: { round: QuizRound; eliminated?: boolean; ended?: boolean; started?: boolean } = await res.json();
        if (body.eliminated !== undefined) setEliminatedState(body.eliminated);
        if (body.ended !== undefined) setEndedState(body.ended);
        if (body.started !== undefined) {
          setStartedState((prev) => {
            if (!prev && body.started) setShowCountdown(true);
            return body.started!;
          });
        }
        if (body.round !== knownRound.current) {
          setIncoming(body.round);
          setShowCountdown(true);
        }
      } catch {
        // Retry next poll
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

  /* 15-SECOND COUNTDOWN INTERLUDE ON START & ROUND ADVANCE */
  if (showCountdown || incoming) {
    return (
      <RoundTransition
        round={incoming ?? round}
        onDone={() => {
          setShowCountdown(false);
          setIncoming(null);
          router.refresh();
        }}
      />
    );
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
    <main className="min-h-full bg-background font-body-md text-on-surface pb-12">
      <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />

      {/* Header bar */}
      <header className="relative z-50 pt-gutter px-gutter mb-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-panel-gap bg-surface comic-border p-4 comic-tilt-right">
          <div className="flex items-center gap-4">
            <div className="bg-primary text-on-primary px-3 py-1 comic-border -rotate-2 font-headline-lg text-headline-lg uppercase tracking-tighter shadow-none">
              No. 1
            </div>
            <span className="font-display-xl text-headline-lg text-on-surface uppercase italic">Action Tales!</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full comic-border-sm flex items-center justify-center font-display-xl text-on-primary text-base"
                style={{ backgroundColor: avatar?.colour ?? "#a41616" }}
              >
                {teamName.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left hidden sm:block">
                <div className="font-headline-lg text-caption-bold uppercase leading-none">{teamName}</div>
                <div className="font-label-sm text-[10px] text-on-surface-variant uppercase mt-0.5">
                  {avatar ? `${avatar.name}` : "Spider Hero"}
                </div>
              </div>
            </div>

            <div id="status-stamp" className="bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2 comic-border rotate-1 font-label-sm uppercase text-[12px]">
              Issue: Round {round}
            </div>
          </div>
        </div>
      </header>

      <div className="relative mx-auto max-w-5xl px-5">
        <div className="text-center mb-8">
          <p className="font-label-sm text-primary uppercase tracking-[0.3em] mb-2">Round {round}</p>
          <h1 className="font-display-xl text-[40px] md:text-[56px] leading-none uppercase italic text-on-background tracking-tighter">
            {ROUND_TITLES[round]}
          </h1>
          <p className="font-label-sm text-on-surface-variant uppercase text-xs mt-2">{ROUND_SUBTITLES[round]}</p>
        </div>

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
              <div className="mt-8 bg-surface-container comic-border-sm p-4 text-xs font-label-sm text-on-surface-variant uppercase">
                Signed in as coordinator. Access admin control at <code className="font-mono text-primary">/admin/quiz</code>.
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/** Full screen Round Transition interlude with 15-second countdown & round rules */
function RoundTransition({ round, onDone }: { round: QuizRound; onDone: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(15);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          onDone();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onDone]);

  const roundRules: Record<QuizRound, { title: string; desc: string; points: string[] }> = {
    1: {
      title: "Round 1 — Final Universe (3 Mini-Games)",
      desc: "Prepare for 3 sequential mini-games. Each game tests a different dimension of skill!",
      points: [
        "🎮 Game 1: AI Image Replication (Prompt engineering & similarity)",
        "🧩 Game 2: Connections Puzzles (5 sequential visual theme puzzles)",
        "🃏 Game 3: Memory Match (Flip and match Multiverse Spider-Hero pairs)",
      ],
    },
    2: {
      title: "Round 2 — Universe 1 (Warm-Up MCQs)",
      desc: "Speed and accuracy are key! You have a strict time window per question.",
      points: [
        "📖 Reading Window: 6 seconds to read the question stem (options locked)",
        "⚡ Answer Window: 10 seconds to select your answer",
        "⏱️ Speed Bonus: Faster correct answers break ties",
      ],
    },
    3: {
      title: "Round 3 — Universe 2 (Multiverse Abilities)",
      desc: "High-stakes finale with live leaderboard and Comeback Meter powers!",
      points: [
        "🔥 Finalist MCQs with live stage standings",
        "⚡ Comeback Meter: Unlocks special abilities for trailing teams",
        "🏆 Top 3 teams win the Multiverse Championship!",
      ],
    },
  };

  const currentRules = roundRules[round];

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-12 bg-background">
      <WebShooter colour="#a41616" webColour="#41617e" gloveColour="#1b1b1c" shape="classic" />
      <div className="comic-border bg-on-background p-8 md:p-12 comic-tilt-left relative overflow-hidden text-center z-10 max-w-2xl w-full">
        <div className="absolute inset-0 ben-day-light opacity-10 pointer-events-none" />
        <Celebration />

        {/* 15-SECOND COUNTDOWN HEADER */}
        <div className="inline-flex items-center gap-3 bg-tertiary-fixed text-on-tertiary-fixed px-5 py-2 comic-border mb-6">
          <span className="font-display-xl text-3xl tabular-nums animate-pulse">{secondsLeft}s</span>
          <span className="font-label-sm text-xs font-bold uppercase tracking-widest">
            SYNCHRONIZING PORTAL...
          </span>
        </div>

        <p className="font-label-sm text-tertiary-fixed uppercase tracking-[0.3em] mb-2">Round {round} Directives</p>
        <h1 className="font-display-xl text-3xl md:text-5xl uppercase italic text-on-primary tracking-tighter mb-4">
          {currentRules.title}
        </h1>

        <p className="font-body-md text-on-primary/80 text-sm max-w-lg mx-auto mb-6">
          {currentRules.desc}
        </p>

        {/* RULES LIST */}
        <div className="text-left bg-surface/10 comic-border p-4 space-y-2 mb-6 text-on-primary">
          {currentRules.points.map((pt, i) => (
            <div key={i} className="font-label-sm text-xs flex items-center gap-2">
              <span className="text-tertiary-fixed font-bold">›</span>
              <span>{pt}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onDone}
          className="bg-primary text-on-primary font-display-xl text-sm uppercase px-6 py-3 comic-border hover:scale-105 transition-transform"
        >
          Skip Countdown & Start Now →
        </button>
      </div>
    </main>
  );
}

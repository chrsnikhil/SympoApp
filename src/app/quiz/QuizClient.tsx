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
import SpiderTimer from "./SpiderTimer";
import ComicHeader from "@/components/ui/ComicHeader";

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
  const [activeRoundState, setActiveRoundState] = useState<QuizRound>(round);
  const [incoming, setIncoming] = useState<QuizRound | null>(null);
  const [eliminatedState, setEliminatedState] = useState(isEliminated);
  const [endedState, setEndedState] = useState(ended);
  const [startedState, setStartedState] = useState(started);
  const [showCountdown, setShowCountdown] = useState(false);
  const [seenRound, setSeenRound] = useState(round);
  const knownRound = useRef(round);
  const prevStarted = useRef(started);

  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [startedAtState, setStartedAtState] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);

  if (round !== seenRound) {
    setSeenRound(round);
    setActiveRoundState(round);
    setIncoming(null);
  }

  useEffect(() => {
    knownRound.current = round;
    setActiveRoundState(round);
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
        const body: {
          round: QuizRound;
          eliminated?: boolean;
          ended?: boolean;
          started?: boolean;
          serverTime?: string;
          startedAt?: string | null;
          round1StartedAt?: string | null;
          round2StartedAt?: string | null;
          round3StartedAt?: string | null;
        } = await res.json();

        if (body.serverTime) {
          const serverMs = new Date(body.serverTime).getTime();
          setServerOffsetMs(Date.now() - serverMs);
        }

        const roundTimestamp =
          body.round === 1
            ? body.round1StartedAt ?? body.startedAt
            : body.round === 2
              ? body.round2StartedAt ?? body.startedAt
              : body.round3StartedAt ?? body.startedAt;
        if (roundTimestamp) setStartedAtState(roundTimestamp);

        if (body.eliminated !== undefined) setEliminatedState(body.eliminated);
        if (body.ended !== undefined) setEndedState(body.ended);
        if (body.started !== undefined) {
          setStartedState((prev) => {
            if (!prev && body.started) {
              const startTimestamp = roundTimestamp ? new Date(roundTimestamp).getTime() : Date.now();
              if (Date.now() - startTimestamp < 15_000) {
                setShowCountdown(true);
              }
            }
            return Boolean(body.started);
          });
        }
        if (body.round !== undefined && body.round !== knownRound.current) {
          knownRound.current = body.round;
          setIncoming(body.round);
          setActiveRoundState(body.round);
          const startTimestamp = roundTimestamp ? new Date(roundTimestamp).getTime() : Date.now();
          if (Date.now() - startTimestamp < 15_000) {
            setShowCountdown(true);
          }
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

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now() - serverOffsetMs), 1000);
    return () => clearInterval(id);
  }, [serverOffsetMs]);

  if (endedState) {
    return <QuizEndedScreen round={activeRoundState} teamName={teamName} avatar={avatar} />;
  }

  /* PRE-QUIZ LOBBY & RULES SCREEN — SHOWS TEAM DETAILS AND RULES BEFORE START */
  if (!startedState && !isAdmin) {
    return <QuizRulesLobby teamName={teamName} avatar={avatar} round={activeRoundState} />;
  }

  const isTransitionActive =
    (showCountdown || incoming !== null) &&
    (!startedAtState || Date.now() - new Date(startedAtState).getTime() < 15_000);

  /* 15-SECOND COUNTDOWN INTERLUDE ON START & ROUND ADVANCE — SYNCHRONIZED ACROSS SCREENS */
  if (isTransitionActive) {
    return (
      <RoundTransition
        round={incoming ?? activeRoundState}
        serverNow={nowMs}
        startedAt={startedAtState}
        onDone={() => {
          if (incoming !== null) {
            setActiveRoundState(incoming);
          }
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
            <Standings round={activeRoundState} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-transparent font-body-md text-on-surface pb-12">
      <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />

      {/* Header bar */}
      <ComicHeader
        issueTitle="Action Tales!"
        issueNumber="No. 1"
        roundStamp={`Issue: Round ${activeRoundState}`}
        teamName={teamName}
        avatar={avatar}
      />

      <div className="relative mx-auto max-w-5xl px-5">
        <div className="text-center mb-8">
          <p className="font-label-sm text-primary uppercase tracking-[0.3em] mb-2">Round {activeRoundState}</p>
          <h1 className="font-display-xl text-[40px] md:text-[56px] leading-none uppercase italic text-on-background tracking-tighter">
            {ROUND_TITLES[activeRoundState]}
          </h1>
          <p className="font-label-sm text-on-surface-variant uppercase text-xs mt-2">{ROUND_SUBTITLES[activeRoundState]}</p>
        </div>

        <div className="grid gap-8 md:grid-cols-[18rem_1fr]">
          <Standings round={activeRoundState} />

          <section className="min-w-0">
            {activeRoundState === 1 ? (
              <Round1Games />
            ) : (
              <ProctorGate round={activeRoundState}>
                <Mcq2Phase round={activeRoundState} persona={persona} />
              </ProctorGate>
            )}

            {isAdmin && (
              <div className="mt-8 bg-surface-container comic-border-sm p-4 text-xs font-label-sm text-on-surface-variant uppercase flex flex-wrap items-center justify-between gap-3">
                <span>Signed in as coordinator.</span>
                <a href="/admin/quiz" className="inline-block bg-primary text-on-primary px-3 py-1.5 comic-border text-xs font-bold uppercase tracking-wider hover:opacity-90 transition-opacity">
                  Open Coordinator Dashboard (/admin/quiz) →
                </a>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

/** Full screen Round Transition interlude with server-synchronized 15-second countdown & round rules */
function RoundTransition({
  round,
  serverNow,
  startedAt,
  onDone,
}: {
  round: QuizRound;
  serverNow: number;
  startedAt?: string | null;
  onDone: () => void;
}) {
  const currentNow = serverNow > 0 ? serverNow : Date.now();
  const fallbackStartRef = useRef(currentNow);
  const startMs = startedAt ? new Date(startedAt).getTime() : fallbackStartRef.current;
  const TRANSITION_DURATION_MS = 15_000;
  const endsAt = startMs + TRANSITION_DURATION_MS;
  const secondsLeft = Math.max(0, Math.ceil((endsAt - currentNow) / 1000));

  const hasFiredRef = useRef(false);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  useEffect(() => {
    if (secondsLeft === 0 && !hasFiredRef.current) {
      hasFiredRef.current = true;
      onDoneRef.current();
    }
  }, [secondsLeft]);

  const roundRules: Record<QuizRound, { title: string; desc: string; points: string[] }> = {
    1: {
      title: "Round 1 — Final Universe (3 Mini-Games)",
      desc: "Prepare for 3 sequential mini-games. Each game tests a different dimension of skill!",
      points: [
        "🖼️ Game 1: Image Replication (50s initial view + 30s peek at 2m 30s | 3m 30s to submit)",
        "🧩 Game 2: Connections (1 submission per image revealed | 5 puzzles)",
        "🃏 Game 3: Memory Game (16 cards / 8 pairs — match all pairs within flip limit)",
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
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6 py-12 bg-transparent">
      <WebShooter colour="#a41616" webColour="#41617e" gloveColour="#1b1b1c" shape="classic" />
      <div className="comic-border bg-on-background p-8 md:p-12 comic-tilt-left relative overflow-hidden text-center z-10 max-w-2xl w-full">
        <div className="absolute inset-0 ben-day-light opacity-10 pointer-events-none" />
        <Celebration />

        {/* 15-SECOND COUNTDOWN HEADER */}
        <div className="flex justify-center mb-6">
          <SpiderTimer
            secondsLeft={secondsLeft}
            totalSeconds={15}
            urgent={secondsLeft <= 5}
            size={90}
            format="seconds"
            phaseLabel="PORTAL"
          />
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

        <div className="bg-primary/20 border border-primary/40 text-on-primary font-display-xl text-xs uppercase px-6 py-3 comic-border flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-tertiary-fixed animate-ping" />
          <span>AUTO-DIRECTING TO QUIZ IN {secondsLeft} SECONDS…</span>
        </div>
      </div>
    </main>
  );
}

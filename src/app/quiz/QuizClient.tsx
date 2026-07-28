"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import Celebration from "./Celebration";
import Mcq2Phase from "./Mcq2Phase";
import ProctorGate from "./ProctorGate";
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
}: {
  round: QuizRound;
  teamName: string;
  avatar: Avatar | null;
  isAdmin: boolean;
}) {
  const persona = avatar ?? DEFAULT_PERSONA;
  const router = useRouter();
  const [incoming, setIncoming] = useState<QuizRound | null>(null);
  const [seenRound, setSeenRound] = useState(round);
  const knownRound = useRef(round);

  // Notices the moment the coordinator cuts to the next round, rather than
  // requiring a manual reload — this is what makes "round 2 starts once the
  // admin approves" actually visible to a team sitting on the Round 1 done
  // screen instead of a silent state change they'd only see on refresh.
  // Adjusting state during render (not in an effect) for the reset itself —
  // this is the React-sanctioned way to reset state in response to a prop
  // change without an extra render pass.
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
        const body: { round: QuizRound } = await res.json();
        if (body.round !== knownRound.current) setIncoming(body.round);
      } catch {
        // A missed poll just tries again next tick — nothing to surface.
      }
    }, STATUS_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (incoming) {
    return <RoundTransition round={incoming} onDone={() => router.refresh()} />;
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

        <div className="grid gap-8 md:grid-cols-[1fr_18rem]">
          <section>
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

          <Standings round={round} />
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

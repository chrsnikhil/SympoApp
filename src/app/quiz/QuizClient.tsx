"use client";

import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import Mcq2Phase from "./Mcq2Phase";
import Round1Games from "./Round1Games";
import Standings from "./Standings";
import WebShooter from "./WebShooter";

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
            {round === 1 ? <Round1Games /> : <Mcq2Phase round={round} persona={persona} />}

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

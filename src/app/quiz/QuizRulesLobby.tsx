"use client";

import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import WebShooter, { WebNet } from "./WebShooter";

export default function QuizRulesLobby({
  teamName,
  avatar,
  round = 1,
}: {
  teamName: string;
  avatar: Avatar | null;
  round?: QuizRound;
}) {
  const persona = avatar ?? {
    colour: "#3a86ff",
    webColour: "#9ec5ff",
    gloveColour: "#e5223b",
    reticle: "classic" as const,
    name: "Spider-Hero",
    tagline: "Multiverse Defender",
  };

  return (
    <main className="relative min-h-full px-5 py-8 overflow-hidden">

      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% -10%, var(--web-blue-dark) 0%, transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-4xl space-y-8">
        {/* TEAM IDENTITY HEADER CARD */}
        <header className="halftone panel panel-accent border-2 border-glitch-cyan bg-ink-black/85 p-6 sm:p-8">
          <WebNet colour={persona.colour} originX={95} originY={5} animate={false} />
          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <span
                className="grid h-16 w-16 place-items-center font-display text-2xl font-bold shadow-lg"
                style={{
                  background: `${persona.colour}22`,
                  border: `3px solid ${persona.colour}`,
                  color: persona.colour,
                  boxShadow: `4px 4px 0 ${persona.colour}44`,
                }}
              >
                {teamName.slice(0, 1).toUpperCase()}
              </span>
              <div>
                <p className="font-comic text-xs uppercase tracking-widest text-glitch-cyan">
                  ASSIGNED MULTIVERSE IDENTITY
                </p>
                <h1 className="display-title chromatic text-3xl sm:text-4xl text-paper-white uppercase tracking-wide">
                  {teamName}
                </h1>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-comic text-base" style={{ color: persona.colour }}>
                    {persona.name}
                  </span>
                  <span className="text-xs text-paper-white/50">• {persona.tagline}</span>
                </div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 border border-comic-yellow bg-comic-yellow/10 px-4 py-2 text-comic-yellow text-xs font-bold uppercase tracking-widest rounded">
              <span className="h-2 w-2 rounded-full bg-comic-yellow animate-ping" />
              AWAITING EVENT START
            </div>
          </div>
        </header>

        {/* QUIZ RULES AND DIRECTIVES */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b-2 border-paper-white/10 pb-3">
            <h2 className="display-title chromatic text-2xl text-paper-white uppercase tracking-wider">
              📜 MULTIVERSE QUIZ BRIEFING & RULES
            </h2>
            <span className="text-xs uppercase tracking-widest text-glitch-cyan font-mono">
              OFFICIAL DIRECTIVES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RULE 1 */}
            <div className="halftone panel border border-paper-white/15 bg-ink-black/75 p-5 space-y-2">
              <div className="flex items-center gap-2 font-display text-sm text-comic-yellow uppercase">
                <span>⚡</span> DIRECTIVE 01 — THREE UNIVERSES
              </div>
              <p className="text-xs text-paper-white/80 leading-relaxed">
                <strong>Round 1:</strong> 3 Sequential Mini-Games (AI Image Replication, Connections Puzzles, & Memory Match).
                <br />
                <strong>Round 2:</strong> Rapid MCQs (6s read + 10s answer).
                <br />
                <strong>Round 3:</strong> Finalist MCQs with Live Multiverse Standings & Comeback Meter powers!
              </p>
            </div>

            {/* RULE 2 */}
            <div className="halftone panel border border-paper-white/15 bg-ink-black/75 p-5 space-y-2">
              <div className="flex items-center gap-2 font-display text-sm text-glitch-cyan uppercase">
                <span>⏱️</span> DIRECTIVE 02 — SERVER CLOCK & SPEED
              </div>
              <p className="text-xs text-paper-white/80 leading-relaxed">
                Speed matters! Points are awarded for correct answers, while your total response time across all questions serves as the primary tiebreaker.
              </p>
            </div>

            {/* RULE 3 */}
            <div className="halftone panel border border-paper-white/15 bg-ink-black/75 p-5 space-y-2">
              <div className="flex items-center gap-2 font-display text-sm text-signal-wrong uppercase">
                <span>🛡️</span> DIRECTIVE 03 — PROCTORING & INTEGRITY
              </div>
              <p className="text-xs text-paper-white/80 leading-relaxed">
                Do not switch browser tabs, blur windows, or exit full screen during live quiz rounds. Proctoring flags are logged directly to the coordinator panel.
              </p>
            </div>

            {/* RULE 4 */}
            <div className="halftone panel border border-paper-white/15 bg-ink-black/75 p-5 space-y-2">
              <div className="flex items-center gap-2 font-display text-sm text-gadget-pink uppercase">
                <span>🕸️</span> DIRECTIVE 04 — HEROIC ELIMINATION
              </div>
              <p className="text-xs text-paper-white/80 leading-relaxed">
                If your team is cut after Round 1 or 2, you will seamlessly enter Live Spectator Mode to track the remaining finalists battling for victory.
              </p>
            </div>
          </div>
        </section>

        {/* WAITING ROOM FOOTER BADGE */}
        <footer className="halftone panel border-2 border-comic-yellow/60 bg-ink-black/90 p-6 text-center space-y-3">
          <div className="text-3xl animate-bounce">📡</div>
          <h3 className="font-display text-lg uppercase text-comic-yellow tracking-wide">
            STAND BY FOR EVENT INITIALIZATION
          </h3>
          <p className="text-xs text-paper-white/70 max-w-md mx-auto">
            Your team is fully registered and ready. This page will automatically start Round 1 as soon as the coordinator clicks <strong>START QUIZ</strong>.
          </p>
        </footer>
      </div>
    </main>
  );
}

"use client";

import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import WebShooter, { WebNet } from "./WebShooter";
import TeamAvatar from "@/components/ui/TeamAvatar";

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
        <header className="relative bg-surface comic-border p-6 sm:p-8 comic-tilt-right overflow-hidden shadow-[8px_8px_0px_0px_rgba(27,27,28,1)]">
          <div className="absolute inset-0 ben-day pointer-events-none opacity-20" />
          <WebNet colour={persona.colour} originX={95} originY={5} animate={false} />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <TeamAvatar
                avatar={avatar}
                teamName={teamName}
                size="lg"
              />
              <div>
                <p className="font-label-sm text-xs uppercase tracking-widest text-primary font-bold">
                  ASSIGNED MULTIVERSE IDENTITY
                </p>
                <h1 className="font-display-xl text-3xl sm:text-4xl text-on-surface uppercase italic leading-none mt-1">
                  {teamName}
                </h1>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-headline-lg text-sm uppercase text-primary font-bold">
                    {persona.name}
                  </span>
                  <span className="font-label-sm text-xs text-on-surface-variant uppercase">• {persona.tagline}</span>
                </div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2 comic-border font-label-sm text-xs uppercase font-bold tracking-widest comic-tilt-left">
              <span className="h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
              AWAITING EVENT START
            </div>
          </div>
        </header>

        {/* QUIZ RULES AND DIRECTIVES */}
        <section className="space-y-4">
          <div className="flex items-center justify-between border-b-2 border-on-surface/10 pb-3">
            <h2 className="font-display-xl text-2xl text-on-surface uppercase italic tracking-wider">
              📜 MULTIVERSE QUIZ BRIEFING & RULES
            </h2>
            <span className="font-label-sm text-xs uppercase tracking-widest text-primary font-bold">
              OFFICIAL DIRECTIVES
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* RULE 1 */}
            <div className="bg-surface-container-lowest comic-border p-5 space-y-2 comic-tilt-left">
              <div className="flex items-center gap-2 font-headline-lg text-sm text-primary uppercase">
                <span>⚡</span> DIRECTIVE 01 — THREE UNIVERSES
              </div>
              <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
                <strong>Round 1:</strong> 3 Sequential Mini-Games (AI Image Replication, Connections Puzzles, & Memory Match).
                <br />
                <strong>Round 2:</strong> Rapid MCQs (6s read + 10s answer).
                <br />
                <strong>Round 3:</strong> Finalist MCQs with Live Multiverse Standings & Comeback Meter powers!
              </p>
            </div>

            {/* RULE 2 */}
            <div className="bg-surface-container-lowest comic-border p-5 space-y-2 comic-tilt-right">
              <div className="flex items-center gap-2 font-headline-lg text-sm text-secondary uppercase">
                <span>⏱️</span> DIRECTIVE 02 — SERVER CLOCK & SPEED
              </div>
              <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
                Speed matters! Points are awarded for correct answers, while your total response time across all questions serves as the primary tiebreaker.
              </p>
            </div>

            {/* RULE 3 */}
            <div className="bg-surface-container-lowest comic-border p-5 space-y-2 comic-tilt-right">
              <div className="flex items-center gap-2 font-headline-lg text-sm text-primary uppercase">
                <span>🛡️</span> DIRECTIVE 03 — PROCTORING & INTEGRITY
              </div>
              <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
                Do not switch browser tabs, blur windows, or exit full screen during live quiz rounds. Proctoring flags are logged directly to the coordinator panel.
              </p>
            </div>

            {/* RULE 4 */}
            <div className="bg-surface-container-lowest comic-border p-5 space-y-2 comic-tilt-left">
              <div className="flex items-center gap-2 font-headline-lg text-sm text-tertiary uppercase">
                <span>🕸️</span> DIRECTIVE 04 — HEROIC ELIMINATION
              </div>
              <p className="font-body-md text-xs text-on-surface-variant leading-relaxed">
                If your team is cut after Round 1 or 2, you will seamlessly enter Live Spectator Mode to track the remaining finalists battling for victory.
              </p>
            </div>
          </div>
        </section>

        {/* WAITING ROOM FOOTER BADGE */}
        <footer className="bg-tertiary-fixed text-on-tertiary-fixed comic-border p-6 text-center space-y-3 comic-tilt-left">
          <div className="text-3xl animate-bounce">📡</div>
          <h3 className="font-display-xl text-lg uppercase tracking-wide">
            STAND BY FOR EVENT INITIALIZATION
          </h3>
          <p className="font-body-md text-xs font-bold max-w-md mx-auto">
            Your team is fully registered and ready. This page will automatically start Round 1 as soon as the coordinator clicks <strong>START QUIZ</strong>.
          </p>
        </footer>
      </div>
    </main>
  );
}

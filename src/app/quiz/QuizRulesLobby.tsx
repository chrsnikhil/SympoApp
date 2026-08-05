"use client";

import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import { WebNet } from "./WebShooter";
import TeamAvatar from "@/components/ui/TeamAvatar";

// Base canonical directive frames
const BASE_DIRECTIVE_FRAMES = [
  {
    id: "01",
    title: "DIRECTIVE 01 — THREE UNIVERSES",
    colorClass: "text-red-600",
    image: "/quiz/directive-1-comic.png",
    objectPosition: "center 20%",
    shortDesc: "Round 1: Replication, Connections, Memory. Round 2 & 3: MCQs.",
  },
  {
    id: "02",
    title: "DIRECTIVE 02 — SERVER CLOCK & SPEED",
    colorClass: "text-blue-700",
    image: "/quiz/directive-2-comic.png",
    objectPosition: "center 35%",
    shortDesc: "Speed matters! Points awarded for correct answers. Fastest time breaks ties.",
  },
  {
    id: "03",
    title: "DIRECTIVE 03 — PROCTORING & INTEGRITY",
    colorClass: "text-red-600",
    image: "/quiz/directive-3-comic.png",
    objectPosition: "center 15%",
    shortDesc: "Do not switch browser tabs or exit fullscreen. Proctoring flags are logged.",
  },
  {
    id: "04",
    title: "DIRECTIVE 04 — HEROIC ELIMINATION",
    colorClass: "text-amber-700",
    image: "/quiz/directive-4-comic.png",
    objectPosition: "center 25%",
    shortDesc: "Eliminated teams enter Live Spectator Mode to track remaining finalists.",
  },
];

// Single continuous track sequence (frames + frames)
const FILM_REEL_TRACK = [...BASE_DIRECTIVE_FRAMES, ...BASE_DIRECTIVE_FRAMES];

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
    <main className="relative min-h-full px-4 sm:px-6 py-8 overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, var(--web-blue-dark) 0%, transparent 65%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl space-y-8">
        {/* TEAM IDENTITY HEADER CARD (TOP) */}
        <header className="relative bg-surface comic-border p-6 sm:p-8 comic-tilt-right overflow-hidden shadow-[8px_8px_0px_0px_rgba(27,27,28,1)]">
          <div className="absolute inset-0 ben-day pointer-events-none opacity-20" />
          <WebNet colour={persona.colour} originX={95} originY={5} animate={false} />
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <TeamAvatar avatar={avatar} teamName={teamName} size="lg" />
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
                  <span className="font-label-sm text-xs text-on-surface-variant uppercase">
                    • {persona.tagline}
                  </span>
                </div>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2 comic-border font-label-sm text-xs uppercase font-bold tracking-widest comic-tilt-left">
              <span className="h-2.5 w-2.5 rounded-full bg-primary animate-ping" />
              AWAITING EVENT START
            </div>
          </div>
        </header>

        {/* COMIC REEL FILM STRIP (SINGLE CONTINUOUS CONVEYOR BELT) */}
        <section className="w-full" data-purpose="rules-carousel" id="directives-film-strip">
          <div className="film-strip-container">
            {/* Top Sprockets */}
            <div className="sprockets" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={`top-${i}`} className="sprocket-hole" />
              ))}
            </div>

            {/* Film Track - Single Continuous Flex Row */}
            <div className="py-2 overflow-hidden">
              <div className="film-track">
                {FILM_REEL_TRACK.map((item, idx) => (
                  <article
                    key={`reel-frame-${item.id}-${idx}`}
                    className="w-64 sm:w-72 bg-[#fdf5e6] border-2 sm:border-4 border-black relative overflow-hidden flex-shrink-0 flex flex-col shadow-md"
                  >
                    <div className="halftone-overlay" />
                    {/* Comic panel image container */}
                    <div className="h-28 sm:h-32 overflow-hidden border-b-2 sm:border-b-4 border-black relative bg-[#1a1a1a]">
                      <img
                        src={item.image}
                        alt={item.title}
                        style={{ objectPosition: item.objectPosition }}
                        className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-300 contrast-105 saturate-110"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent pointer-events-none" />
                    </div>

                    {/* Parchment text panel */}
                    <div className="p-2.5 sm:p-3 bg-[#fdf5e6] flex flex-col justify-center flex-grow">
                      <h3 className={`font-comic text-sm sm:text-base ${item.colorClass} leading-tight mb-0.5 uppercase`}>
                        {item.title}
                      </h3>
                      {/* The frame is a fixed 256px wide at every breakpoint, so
                          shrinking this to 10px on phones bought no extra room —
                          it only made the copy harder to read on the smallest
                          screens. Kept at 12px throughout. */}
                      <p className="text-xs font-bold text-gray-800 line-clamp-2 leading-snug">
                        {item.shortDesc}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            {/* Bottom Sprockets */}
            <div className="sprockets" aria-hidden="true">
              {Array.from({ length: 24 }).map((_, i) => (
                <div key={`bottom-${i}`} className="sprocket-hole" />
              ))}
            </div>
          </div>
        </section>

        {/* WAITING ROOM FOOTER BADGE */}
        <footer className="bg-[#f0da74] text-black comic-border p-6 text-center space-y-3 comic-tilt-left shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] relative">
          <h3 className="font-display-xl text-lg sm:text-xl uppercase tracking-wide">
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

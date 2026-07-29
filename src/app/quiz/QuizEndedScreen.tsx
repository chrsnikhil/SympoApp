"use client";

import { useEffect, useState } from "react";
import type { Avatar } from "@/lib/quiz/avatars";
import type { QuizRound } from "@/lib/db/types";
import Celebration from "./Celebration";
import Standings from "./Standings";
import WebShooter, { WebNet } from "./WebShooter";

interface StandingRow {
  rank: number;
  teamId: string;
  teamName: string;
  points: number;
  tiebreakSeconds: number;
  answered: number;
  avatarName: string | null;
  avatarColour: string | null;
}

export default function QuizEndedScreen({
  round,
  teamName,
  avatar,
}: {
  round: QuizRound;
  teamName: string;
  avatar: Avatar | null;
}) {
  const [topTeams, setTopTeams] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchFinalStandings() {
      try {
        const res = await fetch(`/api/quiz/standings?round=${round}`);
        if (res.ok) {
          const body = await res.json();
          if (!cancelled) {
            setTopTeams(body.rows ?? []);
          }
        }
      } catch {
        // fail gracefully
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchFinalStandings();
    const interval = setInterval(fetchFinalStandings, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [round]);

  const firstPlace = topTeams[0];
  const secondPlace = topTeams[1];
  const thirdPlace = topTeams[2];

  return (
    <main className="relative min-h-full px-4 py-8 overflow-hidden">
      <Celebration />
      <WebShooter
        colour={avatar?.colour ?? "#3a86ff"}
        webColour={avatar?.webColour ?? "#9ec5ff"}
        gloveColour={avatar?.gloveColour ?? "#e5223b"}
        shape={avatar?.reticle ?? "classic"}
      />
      
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, var(--spider-red) 0%, var(--web-blue-dark) 50%, transparent 80%)",
        }}
      />

      <div className="relative mx-auto max-w-5xl space-y-10 text-center">
        {/* HEADER ANNOUNCEMENT */}
        <header className="halftone panel panel-accent space-y-4 border-2 border-comic-yellow bg-ink-black/90 p-8 shadow-2xl">
          <div className="flex justify-center items-center gap-3 text-4xl animate-bounce">
            <span>🏆</span>
            <span>🕸️</span>
            <span>👑</span>
          </div>
          <h1 className="display-title chromatic text-4xl sm:text-6xl uppercase tracking-wider text-comic-yellow">
            GRAND FINALE: MULTIVERSE CHAMPIONS!
          </h1>
          <p className="mx-auto max-w-xl text-base sm:text-lg text-paper-white/90 leading-relaxed font-body">
            The ultimate battle across universes has concluded! Congratulations to all Spider-Heroes who fought for glory!
          </p>
          <div className="inline-flex items-center gap-2 px-5 py-2 border-2 border-glitch-cyan bg-glitch-cyan/10 text-glitch-cyan text-xs font-bold uppercase tracking-widest rounded-full">
            ✨ FINAL ROUND STANDINGS & VICTORY PODIUM ✨
          </div>
        </header>

        {/* TOP 3 PODIUM */}
        <section className="space-y-6">
          <h2 className="display-title chromatic text-2xl sm:text-3xl text-paper-white uppercase tracking-wide">
            🌟 THE TOP THREE HEROES 🌟
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end justify-center pt-6">
            {/* 2ND PLACE (SILVER) */}
            <div className="order-2 md:order-1 halftone panel border-2 border-glitch-cyan bg-ink-black/85 p-6 space-y-3 transform hover:-translate-y-1 transition-transform">
              <div className="text-3xl">🥈</div>
              <div className="inline-block px-3 py-1 bg-glitch-cyan/20 border border-glitch-cyan text-glitch-cyan text-xs font-display uppercase tracking-wider">
                2nd Place — Runner Up
              </div>
              <h3 className="font-display text-2xl text-paper-white truncate">
                {secondPlace ? secondPlace.teamName : "Awaiting..."}
              </h3>
              {secondPlace && (
                <div className="space-y-1 text-xs text-paper-white/70">
                  <div className="font-mono text-lg font-bold text-glitch-cyan">{secondPlace.points} PTS</div>
                  <div>{secondPlace.avatarName ?? "Spider Hero"}</div>
                </div>
              )}
            </div>

            {/* 1ST PLACE (GOLD - CENTER ELEVATED) */}
            <div className="order-1 md:order-2 halftone panel border-4 border-comic-yellow bg-ink-black/95 p-8 space-y-4 transform md:-translate-y-4 hover:-translate-y-5 transition-transform shadow-[0_0_30px_rgba(255,214,10,0.3)]">
              <div className="text-5xl animate-pulse">👑 🏆 👑</div>
              <div className="inline-block px-4 py-1.5 bg-comic-yellow/20 border-2 border-comic-yellow text-comic-yellow text-sm font-display uppercase tracking-widest font-bold">
                🥇 1st Place — Multiverse Champion
              </div>
              <h3 className="font-display text-3xl sm:text-4xl text-comic-yellow chromatic truncate">
                {firstPlace ? firstPlace.teamName : "Awaiting..."}
              </h3>
              {firstPlace && (
                <div className="space-y-2 text-sm text-paper-white/90">
                  <div className="font-mono text-3xl font-extrabold text-comic-yellow">{firstPlace.points} PTS</div>
                  <div className="font-bold text-glitch-cyan">{firstPlace.avatarName ?? "Ultimate Spider"}</div>
                </div>
              )}
            </div>

            {/* 3RD PLACE (BRONZE) */}
            <div className="order-3 halftone panel border-2 border-gadget-pink bg-ink-black/85 p-6 space-y-3 transform hover:-translate-y-1 transition-transform">
              <div className="text-3xl">🥉</div>
              <div className="inline-block px-3 py-1 bg-gadget-pink/20 border border-gadget-pink text-gadget-pink text-xs font-display uppercase tracking-wider">
                3rd Place — Bronze Medalist
              </div>
              <h3 className="font-display text-2xl text-paper-white truncate">
                {thirdPlace ? thirdPlace.teamName : "Awaiting..."}
              </h3>
              {thirdPlace && (
                <div className="space-y-1 text-xs text-paper-white/70">
                  <div className="font-mono text-lg font-bold text-gadget-pink">{thirdPlace.points} PTS</div>
                  <div>{thirdPlace.avatarName ?? "Spider Hero"}</div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FULL LEADERBOARD */}
        <section className="max-w-xl mx-auto space-y-4 pt-6">
          <h3 className="display-title text-xl text-paper-white/80 uppercase tracking-wide">
            FULL MULTIVERSE LEADERBOARD
          </h3>
          <Standings round={round} />
        </section>
      </div>
    </main>
  );
}

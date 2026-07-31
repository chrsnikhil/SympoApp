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
        <header className="relative z-10 text-center mb-8">
          <h1
            className="font-display-xl text-[48px] md:text-[80px] leading-none uppercase italic text-on-background tracking-tighter drop-shadow-[4px_4px_0px_rgba(164,22,22,1)]"
            style={{ WebkitTextStroke: "3px #1b1b1c" }}
          >
            SPIDER-VERSE<br />COMPLETE
          </h1>
          <div className="h-2 w-48 bg-primary mx-auto mt-4 comic-tilt-left shadow-md"></div>
        </header>

        {/* HERO RECORD CARD */}
        <div className="inline-flex items-center gap-4 bg-tertiary-fixed comic-border p-4 comic-tilt-right">
          <div
            className="w-14 h-14 rounded-full comic-border flex items-center justify-center font-display-xl text-on-tertiary-fixed text-xl shrink-0"
            style={{ backgroundColor: avatar?.colour ?? "#a41616" }}
          >
            {teamName.slice(0, 2).toUpperCase()}
          </div>
          <div className="text-left">
            <span className="font-label-sm text-on-tertiary-fixed-variant uppercase text-[10px] block font-bold">
              Hero of Record
            </span>
            <span className="font-headline-lg text-lg uppercase font-bold">{teamName}</span>
          </div>
        </div>

        {/* TOP 3 PODIUM */}
        <section className="space-y-6">
          <h2 className="font-display-xl text-2xl sm:text-3xl text-on-background uppercase italic tracking-wide">
            🌟 THE TOP THREE HEROES 🌟
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end justify-center pt-6">
            {/* 2ND PLACE (SILVER) */}
            <div className="order-2 md:order-1 bg-surface comic-border p-6 space-y-3 comic-tilt-left shadow-[8px_8px_0px_0px_rgba(27,27,28,1)]">
              <div className="text-3xl">🥈</div>
              <div className="bg-secondary text-on-secondary font-label-sm text-xs px-3 py-1 comic-border inline-block uppercase font-bold">
                2nd Place — Runner Up
              </div>
              <h3 className="font-display-xl text-xl text-on-surface uppercase truncate">
                {secondPlace ? secondPlace.teamName : "Awaiting..."}
              </h3>
              {secondPlace && (
                <div className="space-y-1 font-label-sm text-xs text-on-surface-variant uppercase">
                  <div className="font-display-xl text-lg font-bold text-primary">{secondPlace.points} PTS</div>
                  <div>{secondPlace.avatarName ?? "Spider Hero"}</div>
                </div>
              )}
            </div>

            {/* 1ST PLACE (GOLD - CENTER ELEVATED) */}
            <div className="order-1 md:order-2 bg-tertiary-fixed text-on-tertiary-fixed comic-border p-8 space-y-4 comic-tilt-right md:-translate-y-4 shadow-[10px_10px_0px_0px_rgba(27,27,28,1)]">
              <div className="text-5xl animate-pulse">👑 🏆 👑</div>
              <div className="bg-primary text-on-primary font-display-xl text-xs px-4 py-1.5 comic-border inline-block uppercase tracking-widest font-bold -rotate-1">
                🥇 1st Place — Multiverse Champion
              </div>
              <h3 className="font-display-xl text-3xl text-on-tertiary-fixed uppercase italic truncate">
                {firstPlace ? firstPlace.teamName : "Awaiting..."}
              </h3>
              {firstPlace && (
                <div className="space-y-2 font-label-sm text-sm">
                  <div className="font-display-xl text-4xl font-extrabold text-primary">{firstPlace.points} PTS</div>
                  <div className="font-bold">{firstPlace.avatarName ?? "Ultimate Spider"}</div>
                </div>
              )}
            </div>

            {/* 3RD PLACE (BRONZE) */}
            <div className="order-3 bg-surface comic-border p-6 space-y-3 comic-tilt-right shadow-[8px_8px_0px_0px_rgba(27,27,28,1)]">
              <div className="text-3xl">🥉</div>
              <div className="bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-xs px-3 py-1 comic-border inline-block uppercase font-bold">
                3rd Place — Bronze Medalist
              </div>
              <h3 className="font-display-xl text-xl text-on-surface uppercase truncate">
                {thirdPlace ? thirdPlace.teamName : "Awaiting..."}
              </h3>
              {thirdPlace && (
                <div className="space-y-1 font-label-sm text-xs text-on-surface-variant uppercase">
                  <div className="font-display-xl text-lg font-bold text-primary">{thirdPlace.points} PTS</div>
                  <div>{thirdPlace.avatarName ?? "Spider Hero"}</div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* FULL LEADERBOARD */}
        <section className="max-w-xl mx-auto space-y-4 pt-6">
          <h3 className="font-display-xl text-xl text-on-surface uppercase italic tracking-wide">
            FULL MULTIVERSE LEADERBOARD
          </h3>
          <Standings round={round} />
        </section>
      </div>
    </main>
  );
}

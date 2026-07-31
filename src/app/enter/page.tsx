"use client";

import { useEffect, useState } from "react";
import { avatarForCoin, parseCoin } from "@/lib/quiz/avatars";
import { eventHostFor } from "@/lib/config";
import WebShooter, { WebNet } from "@/app/quiz/WebShooter";

/**
 * Entry page with Spider-Verse Symposium styling.
 * Preserves all POST /api/enter routing and verification logic.
 */
export default function EnterPage() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If user already has a valid session cookie, bypass token form and go straight to quiz or admin page
    fetch("/api/quiz/status", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const rt = new URLSearchParams(window.location.search).get("rt");
          if (rt && !rt.includes("/enter")) {
            window.location.href = rt;
          } else if (data.role === "admin") {
            window.location.href = "/admin/quiz";
          } else {
            const quizHost = eventHostFor(window.location.host, "quiz");
            if (window.location.host === quizHost || window.location.host.startsWith("quiz.")) {
              window.location.href = "/";
            } else {
              window.location.href = `${window.location.protocol}//${quizHost}/`;
            }
          }
        }
      })
      .catch(() => {});
  }, []);

  const looksLikeCode = value.includes("-") || value.trim() === "1684" || (value.trim().length >= 4 && parseCoin(value) === null);
  const parsedCoin = looksLikeCode ? null : parseCoin(value);
  const preview = parsedCoin === null ? null : avatarForCoin(parsedCoin);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = looksLikeCode ? { code: value } : { coin: value };
      const res = await fetch("/api/enter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const text = await res.text();
      let data: { error?: string; role?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: "Unexpected response from server" };
      }

      if (!res.ok) {
        setError(data.error ?? "That didn't work");
        return;
      }

      const rt = new URLSearchParams(window.location.search).get("rt");
      if (rt) {
        window.location.href = rt;
        return;
      }

      // Send participants on to the quiz subdomain explicitly; admins go to /admin/quiz
      if (data.role === "admin") {
        window.location.href = "/admin/quiz";
      } else {
        const quizHost = eventHostFor(window.location.host, "quiz");
        if (window.location.host === quizHost || window.location.host.startsWith("quiz.")) {
          window.location.href = "/";
        } else {
          window.location.href = `${window.location.protocol}//${quizHost}/`;
        }
      }
    } catch (err) {
      console.error("[enter] onSubmit error:", err);
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  const persona = preview ?? { colour: "#3a86ff", webColour: "#9ec5ff", gloveColour: "#e5223b", reticle: "classic" as const };

  return (
    <div className="relative min-h-screen bg-background font-body-md text-on-surface flex flex-col justify-between overflow-hidden">
      {/* Background canvas */}
      <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />

      {/* Header bar */}
      <header className="relative z-50 pt-gutter px-gutter">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-panel-gap bg-surface comic-border p-4 comic-tilt-right">
          <div className="flex items-center gap-4">
            <div className="bg-primary text-on-primary px-3 py-1 comic-border -rotate-2 font-headline-lg text-headline-lg uppercase tracking-tighter shadow-none">
              No. 1
            </div>
            <span className="font-display-xl text-headline-lg text-on-surface uppercase italic">Action Tales!</span>
          </div>
          <div id="status-stamp" className="bg-tertiary-fixed text-on-tertiary-fixed px-4 py-2 comic-border rotate-1 font-label-sm uppercase text-[12px]">
            Issue: Welcome
          </div>
        </div>
      </header>

      {/* Main Entry Screen */}
      <main className="relative z-10 max-w-5xl mx-auto px-gutter py-10 flex flex-col items-center text-center">
        <div className="absolute top-6 right-10 w-28 h-28 rounded-full bg-tertiary-fixed-dim comic-border -rotate-6 opacity-70 pointer-events-none hidden md:block">
          <div className="w-20 h-20 rounded-full bg-background opacity-60 -ml-6 -mt-3"></div>
        </div>

        <p className="font-label-sm text-primary uppercase tracking-[0.3em] mb-4">A Bronze Age Publishing Symposium Special</p>
        
        <h1
          className="font-display-xl text-[48px] md:text-[80px] leading-none uppercase italic text-on-background tracking-tighter drop-shadow-[4px_4px_0px_rgba(164,22,22,1)] mb-8"
          style={{ WebkitTextStroke: "3px #1b1b1c" }}
        >
          SPIDER-VERSE<br />TECH CHALLENGE
        </h1>

        <form onSubmit={onSubmit} className="relative w-full max-w-md flex flex-col items-center">
          <WebNet colour={persona.colour} originX={96} originY={2} animate={false} />

          <div className="relative mb-8 w-full">
            <div className="bg-surface px-8 py-4 comic-border rounded-[2rem] relative z-20 comic-tilt-left">
              <h2 className="font-headline-lg text-headline-lg-mobile text-on-surface uppercase italic leading-none">
                Enter Your Token or Code
              </h2>
            </div>
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-surface border-r-3 border-b-3 border-on-background rotate-45 z-10 comic-border"></div>
          </div>

          <div className="w-full max-w-sm mb-4">
            <label htmlFor="value" className="block font-label-sm text-on-surface-variant uppercase text-left mb-2 text-[12px]">
              Token Number / Access Code
            </label>
            <input
              id="value"
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder="e.g. 01 or 1684"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              className="w-full bg-surface-container-lowest comic-border px-6 py-4 font-headline-lg text-headline-lg-mobile uppercase text-center tracking-widest outline-none focus:bg-tertiary-fixed/20 transition-colors"
            />
          </div>

          {/* Character preview badge */}
          {!looksLikeCode && preview && (
            <div className="w-full max-w-sm mt-2 p-3 bg-surface comic-border-sm comic-tilt-left flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-display-xl text-on-primary text-lg" style={{ backgroundColor: preview.colour }}>
                {preview.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="text-left">
                <div className="font-headline-lg text-headline-lg-mobile leading-none" style={{ color: preview.colour }}>
                  {preview.name}
                </div>
                <div className="font-label-sm text-[10px] text-on-surface-variant uppercase mt-1">
                  {preview.tagline}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p id="entry-error" role="alert" className="mt-4 font-label-sm text-primary uppercase text-[12px]">
              {error}
            </p>
          )}

          <div className="mt-8 group">
            <button
              type="submit"
              data-web-target=""
              disabled={busy || (!looksLikeCode && !preview)}
              className="relative bg-primary px-10 py-5 comic-border comic-tilt-right transition-all duration-100 hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[10px_10px_0px_0px_rgba(27,27,28,1)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="font-display-xl text-headline-lg-mobile text-on-primary uppercase tracking-widest">
                {busy ? "Checking…" : "Enter the Spider-Verse"}
              </span>
            </button>
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="relative z-50 pb-gutter px-gutter mt-8">
        <div className="max-w-7xl mx-auto bg-surface-container-highest comic-border p-4 comic-tilt-left flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="font-label-sm text-on-surface-variant uppercase text-[11px]">
            © 1972 Bronze Age Publishing Group — Approved by the Code Authority
          </p>
          <p className="font-label-sm text-on-surface-variant uppercase text-[11px]">College Tech Symposium Special</p>
        </div>
      </footer>
    </div>
  );
}

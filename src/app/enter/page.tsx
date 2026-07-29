"use client";

import { useState } from "react";
import { avatarForCoin, parseCoin } from "@/lib/quiz/avatars";
import { eventHostFor } from "@/lib/config";
import WebShooter, { WebNet } from "@/app/quiz/WebShooter";

/**
 * Entry page. Lives on the app/www host — the event subdomains bounce here
 * when there's no valid session, carrying ?rt= so we can send the user back.
 *
 * Two paths, one form: type a coin number and you're a quiz team; the
 * coordinator instead has an access code (a longer X26-XXXXX-XXXXX string —
 * the input below routes to whichever endpoint the shape implies).
 */
export default function EnterPage() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      const data = await res.json();

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
        window.location.href = `${window.location.protocol}//${quizHost}/`;
      }
    } catch {
      setError("Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  const persona = preview ?? { colour: "#3a86ff", webColour: "#9ec5ff", gloveColour: "#e5223b", reticle: "classic" as const };

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-5">
      <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "radial-gradient(ellipse at 50% 0%, var(--web-blue-dark) 0%, transparent 60%)" }}
      />

      <form onSubmit={onSubmit} className="halftone panel anim-glitch-in relative w-full max-w-sm overflow-hidden p-8">
        <WebNet colour={persona.colour} originX={96} originY={2} animate={false} />
        <div className="relative">
          <p className="font-body text-[0.7rem] uppercase tracking-[0.25em] text-glitch-cyan">XPLORE&apos;26</p>
          <h1 className="display-title chromatic mt-1 text-5xl text-paper-white">Enter</h1>
          <p className="mt-3 text-sm text-paper-white/60">Type the number stamped on your coin — coordinators, your access code.</p>

          <label htmlFor="value" className="mt-6 block text-[0.65rem] uppercase tracking-[0.2em] text-paper-white/50">
            Coin or code
          </label>
          <input
            id="value"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            placeholder="00"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "entry-error" : undefined}
            className="mt-1.5 w-full border-2 border-paper-white/20 bg-ink-black/60 px-4 py-4 text-center font-mono text-3xl tabular-nums tracking-[0.15em] text-paper-white outline-none transition-colors placeholder:text-paper-white/20 focus:border-glitch-cyan"
          />

          {!looksLikeCode && (
            <div className="mt-3 min-h-[3.25rem]">
              {preview ? (
                <div className="anim-pop border-l-4 pl-3" style={{ borderColor: preview.colour }}>
                  <div className="font-comic text-2xl leading-none" style={{ color: preview.colour }}>
                    {preview.name}
                  </div>
                  <div className="mt-1 text-[0.7rem] text-paper-white/50">{preview.tagline}</div>
                </div>
              ) : (
                <p className="text-xs text-paper-white/35">Coins run 01 to 60. The number decides your character.</p>
              )}
            </div>
          )}

          {error && (
            <p id="entry-error" role="alert" className="anim-shake mt-4 border-l-2 border-signal-wrong pl-3 text-sm text-signal-wrong">
              {error}
            </p>
          )}

          <button
            type="submit"
            data-web-target=""
            disabled={busy || (!looksLikeCode && !preview)}
            className="comic-btn mt-6 w-full"
          >
            {busy ? "Checking…" : "Thwip in"}
          </button>
        </div>
      </form>
    </main>
  );
}

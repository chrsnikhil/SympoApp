"use client";

import { useEffect, useState } from "react";
import { avatarForCoin, parseCoin } from "@/lib/quiz/avatars";
import { eventHostFor } from "@/lib/config";
import WebShooter from "@/app/quiz/WebShooter";
import ComicHeader from "@/components/ui/ComicHeader";
import ComicButton from "@/components/ui/ComicButton";
import TeamAvatar from "@/components/ui/TeamAvatar";

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
          if (rt && !rt.endsWith("/") && !rt.includes("/enter") && !rt.endsWith("/enter")) {
            window.location.href = rt;
          } else if (data.role === "admin") {
            window.location.href = "/admin/quiz";
          } else {
            window.location.href = "/quiz";
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
    if (!value.trim()) {
      setError("Please enter your token number or access code");
      return;
    }
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
      let data: { error?: string; role?: string; token?: string } = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { error: "Unexpected response from server" };
      }

      if (!res.ok) {
        setError(data.error || "Connection error — please try again");
        return;
      }

      if (data.token) {
        const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
        const secureFlag = isHttps ? "; Secure" : "";
        document.cookie = `session=${data.token}; path=/; max-age=86400; SameSite=Lax${secureFlag}`;
        document.cookie = `xplore_session=${data.token}; path=/; max-age=86400; SameSite=Lax${secureFlag}`;
      }

      const rt = new URLSearchParams(window.location.search).get("rt");
      if (rt && !rt.endsWith("/") && !rt.includes("/enter") && !rt.endsWith("/enter")) {
        window.location.href = rt;
        return;
      }

      setTimeout(() => {
        if (data.role === "admin") {
          window.location.href = "/admin/quiz";
        } else {
          window.location.href = "/quiz";
        }
      }, 150);
    } catch (err) {
      console.error("[enter] onSubmit error:", err);
      setError(err instanceof Error ? err.message : "Network error — try again");
    } finally {
      setBusy(false);
    }
  }

  const persona = preview ?? { colour: "#3a86ff", webColour: "#9ec5ff", gloveColour: "#e5223b", reticle: "classic" as const };

  return (
    <div className="relative min-h-screen bg-transparent font-body-md text-on-surface flex flex-col justify-between overflow-hidden">
      {/* Background canvas */}
      <WebShooter colour={persona.colour} webColour={persona.webColour} gloveColour={persona.gloveColour} shape={persona.reticle} />

      {/* Header bar */}
      <ComicHeader issueTitle="Action Tales!" issueNumber="No. 1" roundStamp="Issue: Welcome" />

      {/* Main Entry Screen */}
      <main className="relative z-10 max-w-5xl mx-auto px-gutter py-10 flex flex-col items-center text-center">
        <div className="absolute top-6 right-10 w-28 h-28 rounded-full bg-tertiary-fixed-dim comic-border -rotate-6 opacity-70 pointer-events-none hidden md:block">
          <div className="w-20 h-20 rounded-full bg-background opacity-60 -ml-6 -mt-3"></div>
        </div>

        <p className="font-label-sm text-primary uppercase tracking-[0.3em] mb-4">
          A Bronze Age Publishing Symposium Special
        </p>

        <h1
          className="font-display-xl text-[48px] md:text-[80px] leading-none uppercase italic text-on-background tracking-tighter drop-shadow-[4px_4px_0px_rgba(164,22,22,1)] mb-8"
          style={{ WebkitTextStroke: "3px #1b1b1c" }}
        >
          SPIDER SENSE
        </h1>

        <form onSubmit={onSubmit} className="relative w-full max-w-md flex flex-col items-center">
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

          {/* Character preview card */}
          {!looksLikeCode && preview && (
            <div className="w-full max-w-sm mt-3 p-4 bg-tertiary-fixed comic-border comic-tilt-left shadow-[6px_6px_0px_0px_rgba(27,27,28,1)] text-left">
              <div className="flex items-center gap-4">
                <TeamAvatar avatar={preview} size="lg" />
                <div className="flex flex-col items-start min-w-0">
                  <span className="bg-primary text-on-primary font-headline-lg text-[10px] px-2.5 py-0.5 border-2 border-on-background shadow-[2px_2px_0px_0px_rgba(27,27,28,1)] inline-block -rotate-1 mb-1.5">
                    SPIDER HERO UNLOCKED!
                  </span>
                  <div className="font-display-xl text-xl uppercase leading-tight text-on-tertiary-fixed truncate w-full">
                    {preview.name}
                  </div>
                  <div className="font-label-sm text-[10px] text-on-tertiary-fixed-variant uppercase mt-1">
                    {preview.tagline}
                  </div>
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
            <ComicButton
              type="submit"
              data-web-target=""
              disabled={busy}
              variant="primary"
              tilt="right"
              size="lg"
            >
              {busy ? "Checking…" : "Enter the Spider-Verse"}
            </ComicButton>
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

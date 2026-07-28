"use client";

import { useCallback, useEffect, useState } from "react";
import MemoryGrid from "./MemoryGrid";

interface Round1Game {
  slug: string;
  title: string;
  format: "prompt-image" | "memory" | "estimate";
  points: number;
  opensAt: string | null;
  closesAt: string | null;
  referenceImage: string | null;
  status: "not-started" | "queued" | "running" | "done" | "error";
  verdict: { correct: boolean; points: number } | null;
}

/**
 * Round 1 "Final Universe" — all three mini-games on one screen, since a
 * team's shortlist score is their COMBINED total across all three, not a
 * serve queue of many questions.
 */
export default function Round1Games() {
  const [games, setGames] = useState<Round1Game[] | null>(null);
  const [nowMs, setNowMs] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch("/api/quiz/round1", { cache: "no-store" });
    if (res.ok) setGames((await res.json()).games);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cancelled) await load();
    }
    void run();
    const id = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [load]);

  // Drives the open/close gate on each game card — a ticking effect, never a
  // Date.now() read during render.
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!games) return <p className="font-comic text-2xl text-paper-white/40">Loading…</p>;

  const totalPoints = games.reduce((sum, g) => sum + (g.verdict?.points ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="halftone panel p-4">
        <div className="relative flex items-center justify-between">
          <span className="text-xs uppercase tracking-[0.2em] text-paper-white/50">Combined score, this round</span>
          <span className="font-display text-2xl text-glitch-cyan">{totalPoints} pts</span>
        </div>
      </div>

      {games.map((g) => (
        <GameCard key={g.slug} game={g} now={nowMs} onChanged={load} />
      ))}
    </div>
  );
}

function GameCard({ game, now, onChanged }: { game: Round1Game; now: number; onChanged: () => void }) {
  const notOpenYet = game.opensAt && now > 0 && now < new Date(game.opensAt).getTime();
  const closed = game.closesAt && now > new Date(game.closesAt).getTime();

  return (
    <article className="halftone panel anim-glitch-in p-6">
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-paper-white sm:text-xl">{game.title}</h2>
          <span className="text-glitch-cyan text-sm">{game.points} pts</span>
        </div>

        {notOpenYet && <p className="text-sm text-paper-white/50">Waiting for the coordinator to open this game…</p>}

        {!notOpenYet && game.status !== "not-started" && game.status !== "running" ? (
          <VerdictBanner game={game} closed={!!closed} />
        ) : !notOpenYet ? (
          <GameBody game={game} closed={!!closed} onSubmitted={onChanged} />
        ) : null}
      </div>
    </article>
  );
}

function VerdictBanner({ game, closed }: { game: Round1Game; closed: boolean }) {
  if (game.format === "memory") {
    // Memory renders its own completion banner inline in the grid; nothing extra here.
    return <GameBody game={game} closed={closed} onSubmitted={() => {}} />;
  }
  if (game.status === "queued") {
    return (
      <div className="border-2 border-web-blue-light bg-web-blue-dark/50 px-4 py-3">
        <p className="font-comic text-xl text-paper-white">Locked in</p>
        <p className="mt-1 text-sm text-paper-white/80">Scored once the coordinator closes this game.</p>
      </div>
    );
  }
  const points = game.verdict?.points ?? 0;
  return (
    <div className={`border-2 border-l-8 px-4 py-3 ${points > 0 ? "border-glitch-cyan bg-glitch-cyan/10" : "border-signal-wrong bg-signal-wrong/10"}`}>
      <p className={`font-comic text-xl ${points > 0 ? "text-glitch-cyan" : "text-signal-wrong"}`}>
        {points > 0 ? `+${points} pts` : "No points this time."}
      </p>
    </div>
  );
}

function GameBody({ game, closed, onSubmitted }: { game: Round1Game; closed: boolean; onSubmitted: () => void }) {
  if (game.format === "memory") {
    return <MemoryGrid slug={game.slug} onDone={onSubmitted} />;
  }
  if (game.format === "estimate") {
    return <GuessNumber slug={game.slug} disabled={closed} onSubmitted={onSubmitted} />;
  }
  return <ImageReplication slug={game.slug} referenceImage={game.referenceImage} disabled={closed} onSubmitted={onSubmitted} />;
}

function GuessNumber({ slug, disabled, onSubmitted }: { slug: string; disabled: boolean; onSubmitted: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: slug, payload: value }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Submission failed");
        return;
      }
      onSubmitted();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Your best guess — a number"
        disabled={disabled}
        className="w-full border-2 border-paper-white/20 bg-ink-black/60 px-4 py-3 font-mono text-base tabular-nums text-paper-white outline-none placeholder:font-body placeholder:text-paper-white/30 focus:border-glitch-cyan disabled:opacity-40"
      />
      {error && <p className="anim-shake mt-2 text-xs text-signal-wrong">{error}</p>}
      <button type="button" onClick={submit} disabled={busy || disabled || !value.trim()} className="comic-btn comic-btn-cyan mt-4">
        {busy ? "Sending…" : "Lock it in"}
      </button>
    </div>
  );
}

async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX = 1024;
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85);
}

function ImageReplication({
  slug,
  referenceImage,
  disabled,
  onSubmitted,
}: {
  slug: string;
  referenceImage: string | null;
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setStatus("uploading");
    setError(null);
    try {
      const dataUrl = await shrinkImage(file);
      setPreview(dataUrl);

      const uploadRes = await fetch("/api/quiz/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeSlug: slug, dataUrl }),
      });
      const uploadBody = await uploadRes.json();
      if (!uploadRes.ok) {
        setError(uploadBody.error ?? "Upload failed");
        setStatus("idle");
        return;
      }

      const submitRes = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: slug, payload: uploadBody.imageId }),
      });
      if (!submitRes.ok) {
        const b = await submitRes.json();
        setError(b.error ?? "Submission failed");
        setStatus("idle");
        return;
      }

      setStatus("done");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
      setStatus("idle");
    }
  }

  return (
    <div>
      {referenceImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={referenceImage} alt="The reference image to recreate" className="mt-1 mb-4 w-full max-w-xs border-2 border-paper-white/15" />
      )}
      <p className="mb-3 text-xs text-paper-white/50">
        The only game where an outside AI image generator is allowed. Prompt, generate, upload — five minutes.
      </p>
      <label
        className={`grid cursor-pointer place-items-center border-2 border-dashed px-4 py-8 text-center transition-colors ${
          preview ? "border-glitch-cyan/50" : "border-paper-white/25 hover:border-paper-white/45"
        } ${disabled ? "pointer-events-none opacity-40" : ""}`}
      >
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={disabled}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        {preview ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your recreation" className="max-h-48 border border-paper-white/20" />
            <span className="mt-3 text-xs text-paper-white/50">{status === "uploading" ? "Uploading…" : "Tap to choose a different image"}</span>
          </>
        ) : (
          <>
            <span className="font-comic text-2xl text-paper-white/70">Upload your image</span>
            <span className="mt-1 text-xs text-paper-white/45">JPEG, PNG or WebP — resized automatically</span>
          </>
        )}
      </label>
      {error && <p className="mt-2 text-xs text-signal-wrong">{error}</p>}
      {status === "done" && <p className="mt-3 font-comic text-lg text-glitch-cyan">Locked in — scored once the coordinator judges it.</p>}
    </div>
  );
}

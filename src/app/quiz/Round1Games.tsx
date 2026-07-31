"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Celebration from "./Celebration";
import MemoryGrid from "./MemoryGrid";
import SpiderTimer from "./SpiderTimer";

type Phase = "image" | "connections" | "memory" | "done";

interface Round1Game {
  slug: string;
  title: string;
  format: string;
  points: number;
  opensAt: string | null;
  closesAt: string | null;
  // image
  referenceImage?: string | null;
  uploadedImage?: string | null;
  status?: "not-started" | "queued" | "running" | "done" | "error";
  verdict?: { correct: boolean; points: number } | null;
  // connections
  clue?: string | null;
  puzzleIndex?: number;
  totalPuzzles?: number;
  images?: string[];
  totalImages?: number;
  solved?: boolean;
  attempts?: number;
}

interface Round1Response {
  phase: Phase;
  completedPhases: string[];
  game: Round1Game | null;
  serverTime?: string;
}

const PHASE_LABEL: Record<Phase, string> = {
  image: "Image Replication",
  connections: "Connections",
  memory: "Memory Game",
  done: "Complete",
};

const PHASE_STEP: Record<Phase, number> = { image: 1, connections: 2, memory: 3, done: 3 };
const STEPS: Array<Exclude<Phase, "done">> = ["image", "connections", "memory"];

/**
 * Round 1 "Final Universe" — one phase on screen at a time, in a fixed
 * sequence: Image Replication unlocks Connections unlocks the Memory Game.
 * The server (see `lib/quiz/round1.ts`) is what actually decides which phase
 * a team is on; this just renders whatever it says and notices out loud when
 * that changes.
 */
export default function Round1Games() {
  const [data, setData] = useState<Round1Response | null>(null);
  const [serverOffsetMs, setServerOffsetMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [transition, setTransition] = useState<string | null>(null);
  const prevPhase = useRef<Phase | null>(null);
  const transitionTimer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/quiz/round1", { cache: "no-store" });
    if (!res.ok) return;
    const json: Round1Response = await res.json();

    if (json.serverTime) {
      const serverMs = new Date(json.serverTime).getTime();
      setServerOffsetMs(Date.now() - serverMs);
    }

    if (prevPhase.current && prevPhase.current !== json.phase) {
      setTransition(
        json.phase === "done"
          ? `${PHASE_LABEL[prevPhase.current]} locked in — Round 1 complete!`
          : `${PHASE_LABEL[prevPhase.current]} locked in — ${PHASE_LABEL[json.phase]} unlocked`
      );
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
      transitionTimer.current = window.setTimeout(() => setTransition(null), 4200);
    }
    prevPhase.current = json.phase;
    setData(json);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!cancelled) await load();
    }
    void run();
    const id = setInterval(load, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    };
  }, [load]);

  // Drives open/close gates and the reveal countdown using server-synchronized time offset
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now() - serverOffsetMs), 1000);
    return () => clearInterval(id);
  }, [serverOffsetMs]);

  if (!data) return <p className="font-comic text-2xl text-paper-white/40">Loading…</p>;

  return (
    <div className="space-y-6">
      {transition && (
        <div className="halftone panel panel-accent anim-glitch-in p-4 text-center">
          <p className="comic-shout text-xl text-glitch-cyan">{transition}</p>
        </div>
      )}

      <PhaseTracker phase={data.phase} />

      {data.phase === "done" ? (
        <div className="halftone panel anim-pop relative overflow-hidden p-8 text-center">
          <Celebration />
          <p className="display-title chromatic text-3xl text-paper-white sm:text-4xl">Round 1 Complete</p>
          <p className="mt-3 text-sm text-paper-white/60">Waiting for the coordinator to start Round 2…</p>
        </div>
      ) : (
        <PhaseCard data={data} now={nowMs} onChanged={load} />
      )}
    </div>
  );
}

/**
 * Progress only — deliberately no game names. Round 1 is meant to be played
 * one phase at a time without knowing what's coming next, so the tracker
 * shows "Game N of 3" and a fill state, never which game N actually is.
 */
function PhaseTracker({ phase }: { phase: Phase }) {
  const currentStep = PHASE_STEP[phase];
  return (
    <div className="flex items-center gap-2" aria-label="Round 1 progress">
      {STEPS.map((s, i) => {
        const step = i + 1;
        const state = phase === "done" || currentStep > step ? "done" : currentStep === step ? "active" : "upcoming";
        return (
          <div key={s} className="flex flex-1 items-center gap-2">
            <div
              className={`flex h-9 flex-1 items-center justify-center border-2 px-1 text-center font-comic text-xs uppercase tracking-wide sm:text-sm ${
                state === "done"
                  ? "border-signal-good bg-signal-good/15 text-signal-good"
                  : state === "active"
                    ? "border-glitch-cyan bg-glitch-cyan/15 text-glitch-cyan"
                    : "border-paper-white/15 text-paper-white/30"
              }`}
            >
              {state === "done" ? "✓ " : ""}
              Game {step}
            </div>
            {i < STEPS.length - 1 && <span className="text-paper-white/20">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function PhaseCard({ data, now, onChanged }: { data: Round1Response; now: number; onChanged: () => void }) {
  const { game, phase } = data;

  if (!game) return null;

  const currentNow = now > 0 ? now : Date.now();

  const phaseStartRef = useRef<Record<string, number>>({});
  if (!phaseStartRef.current[phase]) {
    phaseStartRef.current[phase] = currentNow;
  }
  const phaseStartMs = phaseStartRef.current[phase];

  const DEFAULT_GAME_SECONDS = 270; // 4 min 30 sec
  const openMs = game.opensAt ? new Date(game.opensAt).getTime() : phaseStartMs;
  const closeMs = game.closesAt ? new Date(game.closesAt).getTime() : openMs + DEFAULT_GAME_SECONDS * 1000;

  // 10-second pre-game rules gate shown ONCE per phase
  const RULES_GATE_MS = 10_000;
  const rulesGateStartMs = phase === "connections" ? phaseStartMs : openMs;
  const rulesGateEndsAt = rulesGateStartMs + RULES_GATE_MS;
  const rulesSecondsLeft = Math.max(0, Math.ceil((rulesGateEndsAt - currentNow) / 1000));
  const isRulesShowing = phase !== "done" && rulesSecondsLeft > 0 && (phase !== "connections" || (game.puzzleIndex ?? 1) === 1);

  const notOpenYet = game.opensAt && currentNow < new Date(game.opensAt).getTime();
  const closed = !!(game.closesAt && currentNow > new Date(game.closesAt).getTime());

  const totalSeconds = Math.max(1, Math.round((closeMs - openMs) / 1000));
  const secondsLeft = Math.max(0, Math.ceil((closeMs - currentNow) / 1000));
  const timerActive = !notOpenYet && !closed && secondsLeft > 0;

  const hasTriggeredTimeoutRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isRulesShowing && secondsLeft === 0 && !closed && hasTriggeredTimeoutRef.current !== game.slug) {
      hasTriggeredTimeoutRef.current = game.slug;
      if (phase === "image" && (game.status === "not-started" || !game.status) && !game.uploadedImage) {
        fetch("/api/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ event: "quiz", challengeSlug: game.slug, payload: "__timeout__" }),
        }).finally(() => onChanged());
      } else {
        onChanged();
      }
    }
  }, [isRulesShowing, secondsLeft, closed, phase, game.status, game.uploadedImage, game.slug, onChanged]);

  /* DEDICATED PRE-GAME RULES GATE — SYNCHRONIZED SERVER-WIDE COUNTDOWN */
  if (isRulesShowing) {
    return (
      <PreGameRulesGate
        phase={phase}
        points={game.points}
        secondsLeft={rulesSecondsLeft}
      />
    );
  }

  return (
    <article className="halftone panel anim-glitch-in p-6">
      <div className="relative">
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-paper-white/10 pb-4">
          <div>
            <h2 className="text-lg font-semibold text-paper-white sm:text-xl">{game.title}</h2>
            <span className="inline-block mt-1.5 text-glitch-cyan text-xs font-semibold px-2 py-0.5 border border-glitch-cyan/30 bg-glitch-cyan/10 rounded">
              {game.points} pts
            </span>
          </div>

          {phase === "image" && timerActive && (
            <div className="shrink-0 flex items-center">
              <SpiderTimer
                secondsLeft={secondsLeft}
                totalSeconds={totalSeconds}
                urgent={secondsLeft <= 30}
                size={95}
              />
            </div>
          )}
        </div>

        {notOpenYet ? (
          <p className="text-sm text-paper-white/50">Waiting for the coordinator to open this game…</p>
        ) : phase === "image" ? (
          <ImageReplication game={game} disabled={closed} onChanged={onChanged} />
        ) : phase === "connections" ? (
          <ConnectionsGame game={game} disabled={closed} onSolved={onChanged} />
        ) : (
          <MemoryGrid slug={game.slug} onDone={onChanged} />
        )}
      </div>
    </article>
  );
}

function PreGameRulesGate({
  phase,
  points,
  secondsLeft,
}: {
  phase: Exclude<Phase, "done">;
  points: number;
  secondsLeft: number;
}) {

  const rulesConfig: Record<string, { title: string; color: string; bgBorder: string; icon: string; points: string[] }> = {
    image: {
      title: "GAME 1: AI IMAGE REPLICATION",
      color: "text-glitch-cyan",
      bgBorder: "border-glitch-cyan bg-glitch-cyan/10",
      icon: "🎮",
      points: [
        "Examine the reference image displayed on screen carefully.",
        "Type descriptive prompts to recreate the image using Groq AI.",
        "You get up to 3 prompt submissions. The highest similarity score wins!",
      ],
    },
    connections: {
      title: "GAME 2: CONNECTIONS PUZZLES (5 PUZZLES)",
      color: "text-comic-yellow",
      bgBorder: "border-comic-yellow bg-comic-yellow/10",
      icon: "🧩",
      points: [
        "4 images will be revealed one by one live on stage.",
        "Identify the common theme/connection linking all 4 images.",
        "Type the exact connection answer before time expires!",
      ],
    },
    memory: {
      title: "GAME 3: MEMORY MATCH GAME",
      color: "text-gadget-pink",
      bgBorder: "border-gadget-pink bg-gadget-pink/10",
      icon: "🃏",
      points: [
        "Click to flip and match Multiverse Spider-Hero cards.",
        "Match all 6 pairs in as few flips as possible.",
        "Fewer total flips = higher bonus points!",
      ],
    },
  };

  const cfg = rulesConfig[phase];

  return (
    <article className="halftone panel anim-pop p-8 text-center space-y-6 relative overflow-hidden border-2 border-spider-red/80 shadow-[0_0_25px_rgba(229,34,59,0.3)]">
      {/* Spider Web Corner Badges */}
      <div className="absolute top-2 left-3 text-spider-red text-lg opacity-60">🕸️</div>
      <div className="absolute top-2 right-3 text-spider-red text-lg opacity-60">🕸️</div>

      {/* Spider-Sense Header */}
      <div className="inline-flex items-center gap-2 border-2 border-spider-red/80 bg-spider-red/15 px-4 py-1 text-spider-red text-xs font-display tracking-widest uppercase rounded shadow animate-pulse">
        ⚡ SPIDER-SENSE BRIEFING ⚡
      </div>

      <div className="text-5xl animate-bounce my-1">{cfg.icon}</div>

      <div className="space-y-3">
        <div className="flex justify-center my-2">
          <SpiderTimer
            secondsLeft={secondsLeft}
            totalSeconds={10}
            urgent={secondsLeft <= 3}
            size={95}
            format="seconds"
            phaseLabel="RULES"
          />
        </div>
        <h2 className={`font-display-xl text-3xl uppercase italic tracking-wide ${cfg.color}`}>{cfg.title}</h2>
        <span className="inline-block text-xs font-bold px-3 py-1 border border-paper-white/20 bg-ink-black/80 text-comic-yellow rounded shadow">
          ★ Worth {points} Points ★
        </span>
      </div>

      <div className={`text-left border-2 p-5 space-y-2.5 rounded backdrop-blur-sm ${cfg.bgBorder}`}>
        <p className="font-display text-sm uppercase tracking-wider text-paper-white mb-2 flex items-center gap-2">
          <span>🕸️</span> RULES & DIRECTIVES:
        </p>
        {cfg.points.map((pt, i) => (
          <div key={i} className="font-mono text-xs text-paper-white/90 flex items-start gap-2.5">
            <span className="font-bold text-glitch-cyan text-sm">0{i + 1}.</span>
            <span className="leading-relaxed">{pt}</span>
          </div>
        ))}
      </div>

      <div className="border border-paper-white/20 bg-ink-black/90 p-3 text-center text-xs font-mono text-paper-white/80 flex items-center justify-center gap-2">
        <span className="text-glitch-cyan font-bold">🕸️ THWIP!</span>
        <span>Auto-directing to game screen when timer reaches 0s…</span>
      </div>
    </article>
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

/**
 * The window stays open for the coordinator's full allotted time — a
 * submission doesn't move a team on early (see `round1Phase`), so this has
 * two modes depending on whether one exists yet: the upload dropzone, or a
 * status summary with a "Delete & try again" button. Deleting withdraws the
 * current attempt (and reverses its score if it had already been judged —
 * see the image route's DELETE handler) and drops back to the dropzone.
 */
function ImageReplication({ game, disabled, onChanged }: { game: Round1Game; disabled: boolean; onChanged: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const hasSubmission = game.status !== undefined && game.status !== "not-started";
  const displayImage = preview || game.uploadedImage;

  async function handleFile(file: File) {
    setStatus("uploading");
    setError(null);
    try {
      const dataUrl = await shrinkImage(file);
      setPreview(dataUrl);

      const uploadRes = await fetch("/api/quiz/image", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeSlug: game.slug, dataUrl }),
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
        body: JSON.stringify({ event: "quiz", challengeSlug: game.slug, payload: uploadBody.imageId }),
      });
      if (!submitRes.ok) {
        const b = await submitRes.json();
        setError(b.error ?? "Submission failed");
        setStatus("idle");
        return;
      }

      setStatus("idle");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
      setStatus("idle");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/quiz/image?challengeSlug=${encodeURIComponent(game.slug)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not withdraw that submission");
        return;
      }
      setPreview(null);
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  const points = game.verdict?.points;

  return (
    <div>
      {game.referenceImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={game.referenceImage} alt="The reference image to recreate" className="mt-1 mb-4 w-full max-w-xs border-2 border-paper-white/15" />
      )}
      <p className="mb-3 text-xs text-paper-white/50">
        Prompt, generate, upload — you can delete and redo as many times as you like until the window closes.
      </p>

      {hasSubmission || displayImage ? (
        <div className="halftone panel border-2 border-glitch-cyan/60 p-4 relative space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-white/10 pb-3">
            <div>
              <span className="font-comic text-base text-glitch-cyan flex items-center gap-1.5">
                ✓ Image Saved & Uploaded
              </span>
            </div>
          </div>

          <div className="flex justify-center p-2 bg-ink-black/60 border border-paper-white/15">
            {displayImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={displayImage} alt="Your uploaded recreation" className="max-h-64 object-contain rounded" />
            ) : (
              <div className="py-8 text-center text-xs text-paper-white/45">Image uploaded and submitted</div>
            )}
          </div>

          {!disabled && (
            <label className="block text-center cursor-pointer text-xs text-glitch-cyan hover:underline py-1">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              {status === "uploading" ? "Uploading new image…" : "Click to replace with a different image"}
            </label>
          )}

          {disabled && <p className="text-xs text-paper-white/45 text-center">Window closed — submission final.</p>}
        </div>
      ) : (
        <label
          className={`grid cursor-pointer place-items-center border-2 border-dashed px-4 py-8 text-center transition-colors border-paper-white/25 hover:border-paper-white/45 ${
            disabled ? "pointer-events-none opacity-40" : ""
          }`}
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
          <span className="font-comic text-2xl text-paper-white/70">Upload your image</span>
          <span className="mt-1 text-xs text-paper-white/45">JPEG, PNG or WebP — resized automatically</span>
        </label>
      )}

      {error && <p className="mt-2 text-xs text-signal-wrong">{error}</p>}
    </div>
  );
}

/**
 * Four tiles, revealed one at a time on the coordinator's schedule. A team
 * can guess as often as they like — a wrong guess costs nothing but the
 * attempt, since the puzzle itself is the difficulty, not a one-shot penalty.
 */
function ConnectionsGame({ game, disabled, onSolved }: { game: Round1Game; disabled: boolean; onSolved: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [lockedAnswer, setLockedAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pop, setPop] = useState(false);
  const prevCount = useRef(game.images?.length ?? 0);

  useEffect(() => {
    setLockedAnswer(null);
    setValue("");
    setError(null);
  }, [game.slug, game.puzzleIndex]);

  useEffect(() => {
    const count = game.images?.length ?? 0;
    if (count > prevCount.current) {
      setPop(true);
      const t = window.setTimeout(() => setPop(false), 650);
      prevCount.current = count;
      return () => window.clearTimeout(t);
    }
    prevCount.current = count;
  }, [game.images?.length]);

  async function submit() {
    if (!value.trim() || busy || lockedAnswer) return;
    const submittedVal = value.trim();
    setBusy(true);
    setError(null);
    setLockedAnswer(submittedVal);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: game.slug, payload: submittedVal }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Submission failed");
        setLockedAnswer(null);
        return;
      }
      onSolved();
    } catch {
      setError("Submission failed");
      setLockedAnswer(null);
    } finally {
      setBusy(false);
    }
  }

  const images = game.images ?? [];
  const total = game.totalImages ?? 4;
  const allTilesRevealed = images.length >= total;

  const [finalSecondsLeft, setFinalSecondsLeft] = useState(10);
  const hasTimedOut = useRef(false);

  const handleTimeout = useCallback(async () => {
    try {
      await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: game.slug, payload: "__timeout__" }),
      });
    } finally {
      onSolved();
    }
  }, [game.slug, onSolved]);

  useEffect(() => {
    setFinalSecondsLeft(10);
    hasTimedOut.current = false;
  }, [game.slug, game.puzzleIndex, images.length]);

  useEffect(() => {
    if (!allTilesRevealed || disabled) return;
    const timer = setInterval(() => {
      setFinalSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          if (!hasTimedOut.current) {
            hasTimedOut.current = true;
            void handleTimeout();
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [allTilesRevealed, disabled, handleTimeout]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-paper-white/50">
            A handful of pictures, one shared technical term. The coordinator reveals a new tile live — type it the
            moment you&apos;re sure.
          </p>
          {allTilesRevealed && (
            <p className="mt-1 font-comic text-xs text-spider-red animate-pulse">
              ⚡ All tiles revealed! Final 10-second countdown to answer!
            </p>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-3 pl-3">
          {allTilesRevealed && (
            <SpiderTimer
              secondsLeft={finalSecondsLeft}
              totalSeconds={10}
              urgent={finalSecondsLeft <= 4}
              size={70}
              format="seconds"
              phaseLabel="10S LEFT"
            />
          )}
          <span className="text-[0.65rem] uppercase tracking-widest text-paper-white/40">
            Puzzle {game.puzzleIndex ?? 1} of {game.totalPuzzles ?? 5}
          </span>
        </div>
      </div>

      {game.clue && (
        <p className="anim-pop mb-3 border-l-4 border-gadget-pink bg-gadget-pink/10 px-4 py-3 text-sm text-paper-white">
          <span className="font-comic mr-2 text-base text-gadget-pink">Clue</span>
          {game.clue}
        </p>
      )}

      <div className={`grid gap-3 ${
        total === 2 ? "grid-cols-2 max-w-xl mx-auto" :
        total === 3 ? "grid-cols-1 sm:grid-cols-3" :
        "grid-cols-2 sm:grid-cols-4"
      }`}>
        {Array.from({ length: total }).map((_, i) => {
          const revealed = i < images.length;
          return (
            <div
              key={i}
              className={`aspect-video overflow-hidden border-2 ${
                revealed ? "border-glitch-cyan/50" : "border-dashed border-paper-white/15"
              } ${revealed && i === images.length - 1 && pop ? "anim-pop" : ""}`}
            >
              {revealed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i]} alt="" className="h-full w-full object-contain bg-ink-black/80 p-1" />
              ) : (
                <div className="grid h-full place-items-center bg-ink-black/40 text-[0.65rem] uppercase tracking-widest text-paper-white/25">
                  Locked
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[0.7rem] text-paper-white/40">
        {images.length >= total ? "All tiles are up." : `${images.length} of ${total} tiles revealed so far.`}
      </p>

      {lockedAnswer ? (
        <div className="mt-4 border-2 border-glitch-cyan/60 bg-glitch-cyan/10 p-4 text-center">
          <p className="font-comic text-sm text-glitch-cyan">🔒 Answer Submitted & Locked</p>
          <p className="mt-1 font-mono text-base font-bold text-paper-white">&quot;{lockedAnswer}&quot;</p>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="The shared technical term"
            disabled={disabled || busy || !!lockedAnswer || game.solved}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            data-web-target=""
            className="w-full border-2 border-paper-white/20 bg-ink-black/60 px-4 py-3 text-base text-paper-white outline-none placeholder:text-paper-white/30 focus:border-glitch-cyan disabled:opacity-40"
          />
          <button
            type="button"
            data-web-target=""
            onClick={submit}
            disabled={busy || disabled || !value.trim() || !!lockedAnswer || game.solved}
            className="comic-btn comic-btn-cyan shrink-0"
          >
            {busy ? "…" : "Lock it in"}
          </button>
        </div>
      )}

      {error && <p className="anim-shake mt-2 text-xs text-signal-wrong">{error}</p>}
      {game.solved && <p className="mt-3 font-comic text-lg text-glitch-cyan">Solved! Unlocking next puzzle…</p>}
    </div>
  );
}

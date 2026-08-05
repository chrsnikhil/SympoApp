"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Celebration from "./Celebration";
import FrozenScreen from "./FrozenScreen";
import MemoryGrid from "./MemoryGrid";
import ProtectedImage from "./ProtectedImage";
import ScreenshotGuard from "./ScreenshotGuard";
import DitheredImage from "./DitheredImage";
import FlickerNotice from "./FlickerNotice";
import { useDitherSetting } from "./useDitherSetting";
import SpiderTimer from "./SpiderTimer";
import { useProctorStrikes } from "@/lib/quiz/useProctorStrikes";

type Phase = "image" | "connections" | "memory" | "done";

interface Round1Game {
  slug: string;
  title: string;
  format: string;
  points: number;
  opensAt: string | null;
  closesAt: string | null;
  // image
  referenceImage?: string | boolean | null;
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
  solvedVerdict?: { correct: boolean; points: number; rank?: number } | null;
  attempts?: number;
  attemptsHistory?: Array<{
    imageIndex: number;
    payload: string;
    correct: boolean;
    points: number;
    rank?: number | null;
    reason?: string | null;
    penalty?: number | null;
  }>;
}

interface Round1Response {
  phase: Phase;
  completedPhases: string[];
  game: Round1Game | null;
  serverTime?: string;
  /**
   * Tab-switch strike/freeze state (see `useProctorStrikes`). Never true
   * during the "image" phase — that game never reports a strike-eligible
   * event — but always present so a reload during "connections"/"memory"
   * picks the freeze back up without waiting on the client-side hook.
   */
  frozen?: boolean;
  frozenReason?: string | null;
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
export default function Round1Games({ teamName }: { teamName: string }) {
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
    const pollInterval = data?.phase === "connections" ? 1000 : 2000;
    const id = setInterval(load, pollInterval);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (transitionTimer.current) window.clearTimeout(transitionTimer.current);
    };
  }, [load, data?.phase]);

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

      {/* Before the games, not after — informed consent is only informed if it
          arrives before the flicker does. Renders nothing when the flag is off. */}
      <FlickerNotice />

      <PhaseTracker phase={data.phase} />

      {data.phase === "done" ? (
        <div className="halftone panel anim-pop relative overflow-hidden p-8 text-center">
          <Celebration />
          <p className="display-title chromatic text-3xl text-paper-white sm:text-4xl">Round 1 Complete</p>
          <p className="mt-3 text-sm text-paper-white/60">Waiting for the coordinator to start Round 2…</p>
        </div>
      ) : (
        <PhaseCard data={data} now={nowMs} onChanged={load} teamName={teamName} />
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
              Game {step}
            </div>
            {i < STEPS.length - 1 && <span className="text-paper-white/20">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function PhaseCard({
  data,
  now,
  onChanged,
  teamName,
}: {
  data: Round1Response;
  now: number;
  onChanged: () => void;
  teamName: string;
}) {
  const { game, phase } = data;

  // Tab-switch strikes/freeze — armed on Connections and the Memory Game,
  // never on Image Replication (teams are expected to tab out to an AI
  // generator there). `data.frozen` (from the round1 poll, refreshed every
  // 1-2s) is the sole source of truth for whether the freeze screen shows —
  // it's what lets an admin's "unfreeze" click actually take effect.
  const strikesActive = phase === "connections" || phase === "memory";
  const isFrozen = strikesActive && !!data.frozen;
  const { warning } = useProctorStrikes(1, strikesActive, isFrozen);
  const frozenReason = data.frozenReason ?? null;

  if (!game) return null;

  const currentNow = now > 0 ? now : Date.now();

  const RULES_DURATION_MS = 15_000; // 15-second pre-game rules gate

  const phaseStartRef = useRef<Record<string, number>>({});
  if (!phaseStartRef.current[phase]) {
    phaseStartRef.current[phase] = currentNow;
  }
  const phaseStartMs = phaseStartRef.current[phase];

  const DEFAULT_GAME_SECONDS = phase === "image" ? 210 : 270; // Game 1 is 3m 30s

  // When the server provides opensAt/closesAt, use those directly.
  // Otherwise, push the effective open time forward by the rules duration
  // so the game timer only starts counting after the rules screen ends.
  const openMs = game.opensAt
    ? new Date(game.opensAt).getTime()
    : phaseStartMs + RULES_DURATION_MS;
  const closeMs = game.closesAt
    ? new Date(game.closesAt).getTime()
    : openMs + DEFAULT_GAME_SECONDS * 1000;

  // Dedicated 10-second pre-game rules gate shown for 10s on entering each game phase
  const [seenRules, setSeenRules] = useState<Record<string, boolean>>({});
  const [rulesTimer, setRulesTimer] = useState<number>(15);

  useEffect(() => {
    if (phase === "done") return;
    if (!seenRules[phase]) {
      setRulesTimer(15);
      const timer = setInterval(() => {
        setRulesTimer((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setSeenRules((s) => ({ ...s, [phase]: true }));
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [phase, seenRules]);

  const isRulesShowing = phase !== "done" && !seenRules[phase];

  const notOpenYet = game.opensAt && currentNow < new Date(game.opensAt).getTime();
  const closed = !!(game.closesAt && currentNow > new Date(game.closesAt).getTime());

  const totalSeconds = Math.max(1, Math.round((closeMs - openMs) / 1000));
  const secondsLeft = Math.max(0, Math.ceil((closeMs - currentNow) / 1000));
  const timerActive = !isRulesShowing && !notOpenYet && !closed && secondsLeft > 0;

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

  /* DEDICATED PRE-GAME RULES GATE — 10-SECOND BRIEFING COUNTDOWN */
  if (isRulesShowing) {
    return (
      <PreGameRulesGate
        phase={phase}
        points={game.points}
        secondsLeft={rulesTimer}
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

        {warning && !isFrozen && (
          <div className="anim-pop mb-4 border-2 border-comic-yellow bg-comic-yellow/10 px-4 py-3 text-xs font-comic text-comic-yellow">
            ⚠️ {warning.message}
          </div>
        )}

        {notOpenYet ? (
          <p className="text-sm text-paper-white/50">Waiting for the coordinator to open this game…</p>
        ) : isFrozen ? (
          <FrozenScreen reason={frozenReason} variant="dark" />
        ) : phase === "image" ? (
          <ScreenshotGuard>
            <ImageReplication
              game={game}
              disabled={closed}
              onChanged={onChanged}
              openMs={openMs}
              currentNow={currentNow}
              teamName={teamName}
            />
          </ScreenshotGuard>
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
      title: "GAME 1: IMAGE REPLICATION",
      color: "text-glitch-cyan",
      bgBorder: "border-glitch-cyan bg-glitch-cyan/10",
      icon: "",
      points: [
        "Reference Image Display: 50 seconds at start (reappears for 30s at 2m 30s mark).",
        "Image Generation & Submission Time: 3 minutes 30 seconds total.",
        "Use ANY AI image-generation tool to recreate the image as closely as possible.",
        "Upload your final generated image before the timer ends.",
        "Only the LAST submitted image before the deadline will be evaluated.",
        "Late or no submission will receive 0 points.",
      ],
    },
    connections: {
      title: "GAME 2: CONNECTIONS",
      color: "text-comic-yellow",
      bgBorder: "border-comic-yellow bg-comic-yellow/10",
      icon: "",
      points: [
        "A series of images will be revealed one by one on screen.",
        "Each image acts as a new clue to identify the single connecting word or phrase.",
        "Teams are allowed ONLY ONE answer submission after each image is revealed.",
        "If your answer is incorrect, you must wait for the next image tile before trying again.",
        "Maximum number of attempts = total images shown (e.g., 4 images = 4 attempts).",
      ],
    },
    memory: {
      title: "GAME 3: MEMORY GAME",
      color: "text-gadget-pink",
      bgBorder: "border-gadget-pink bg-gadget-pink/10",
      icon: "",
      points: [
        "16 face-down cards (8 matching Spider-Verse character pairs) displayed on grid.",
        "Flip two cards at a time to find matching pairs.",
        "If cards match, they stay face up. If they do not match, they automatically flip back.",
        "Objective: Match all 8 pairs using the fewest flips possible within the flip limit.",
        "Game ends when all 8 pairs are matched, OR maximum flip limit is reached.",
      ],
    },
  };

  const cfg = rulesConfig[phase];

  return (
    <article className="halftone panel anim-pop p-8 text-center space-y-6 relative overflow-hidden border-2 border-spider-red/80 shadow-[0_0_25px_rgba(229,34,59,0.3)]">
      {/* Spider-Sense Header */}
      <div className="inline-flex items-center gap-2 border-2 border-spider-red/80 bg-spider-red/15 px-4 py-1 text-spider-red text-xs font-display tracking-widest uppercase rounded shadow animate-pulse">
        SPIDER-SENSE BRIEFING
      </div>

      <div className="space-y-3">
        <div className="flex justify-center my-2">
          <SpiderTimer
            secondsLeft={secondsLeft}
            totalSeconds={15}
            urgent={secondsLeft <= 3}
            size={95}
            format="seconds"
            phaseLabel="RULES"
          />
        </div>
        <h2 className={`font-display-xl text-3xl uppercase italic tracking-wide ${cfg.color}`}>{cfg.title}</h2>
        <span className="inline-block text-xs font-bold px-3 py-1 border border-paper-white/20 bg-ink-black/80 text-comic-yellow rounded shadow">
          Worth {points} Points
        </span>
      </div>

      <div className={`text-left border-2 p-5 space-y-2.5 rounded backdrop-blur-sm ${cfg.bgBorder}`}>
        <p className="font-display text-sm uppercase tracking-wider text-paper-white mb-2 flex items-center gap-2">
          RULES & DIRECTIVES:
        </p>
        {cfg.points.map((pt, i) => (
          <div key={i} className="font-mono text-xs text-paper-white/90 flex items-start gap-2.5">
            <span className="font-bold text-glitch-cyan text-sm">0{i + 1}.</span>
            <span className="leading-relaxed">{pt}</span>
          </div>
        ))}
      </div>

      <div className="border border-paper-white/20 bg-ink-black/90 p-3 text-center text-xs font-mono text-paper-white/80 flex items-center justify-center gap-2">
        <span className="text-glitch-cyan font-bold">THWIP!</span>
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
function ImageReplication({
  game,
  disabled,
  onChanged,
  openMs,
  currentNow,
  teamName,
}: {
  game: Round1Game;
  disabled: boolean;
  onChanged: () => void;
  openMs: number;
  currentNow: number;
  teamName: string;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // "saved" is the normal state for the whole round: the image is banked and
  // replaceable, and nothing is judged until the clock hits zero.
  const [status, setStatus] = useState<
    "idle" | "uploading" | "saved" | "judging" | "scored" | "rejected_watermark" | "failed"
  >("idle");
  const [evalResult, setEvalResult] = useState<{ similarity?: number; final_score?: number; model_used?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [watermarkError, setWatermarkError] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const displayImage = preview || game.uploadedImage;
  const isJudged = game.verdict !== undefined && game.verdict !== null;

  /**
   * Reference visibility schedule.
   *
   * The reference is deliberately NOT on screen for the whole game. Teams study
   * it, then work from memory — which is also the only screenshot control that
   * genuinely holds, since nothing can capture pixels that are not being
   * painted.
   *
   * These were bare seconds (50 / 150 / 180) tuned to a 3m30s round. The round
   * is now 8 minutes, which left the last peek ending at the 3-minute mark and
   * five minutes of play with no reference at all. Deriving the peek from the
   * round's own length keeps the shape of the game if the duration changes
   * again, rather than silently drifting out of proportion.
   *
   * The initial study window stays a fixed 50s: how long it takes to take an
   * image in does not scale with how long you then have to reproduce it.
   */
  const elapsedSeconds = Math.max(0, Math.floor((currentNow - openMs) / 1000));
  // Round length comes from the window the SERVER served for this game, NOT
  // from importing the duration constant. That constant lives in
  // `lib/quiz/imageRound.ts`, which reaches db/client and therefore the mongodb
  // driver; importing it into a "use client" component drags a Node driver into
  // the browser bundle and the build fails outright.
  //
  // Deriving it here is better than a shared constant anyway: if a coordinator
  // opens the game with an explicit closesAt, the peek follows the window teams
  // are actually playing rather than the default.
  const roundSeconds = Math.max(
    1,
    Math.round(((game.closesAt ? new Date(game.closesAt).getTime() : openMs) - openMs) / 1000)
  );

  const INITIAL_VIEW_SECONDS = 50;
  const PEEK_SECONDS = 30;
  /** Same relative position the 3m30s round used: 150/210 ≈ 71% through. */
  const peekStart = Math.round(roundSeconds * 0.71);
  const peekEnd = peekStart + PEEK_SECONDS;

  const isInitialVisible = elapsedSeconds < INITIAL_VIEW_SECONDS;
  const initialSecondsLeft = Math.max(0, INITIAL_VIEW_SECONDS - elapsedSeconds);

  const isMidGameVisible = elapsedSeconds >= peekStart && elapsedSeconds < peekEnd;
  const midGameSecondsLeft = Math.max(0, peekEnd - elapsedSeconds);

  const isReferenceVisible = isInitialVisible || isMidGameVisible;

  const [refDataUrl, setRefDataUrl] = useState<string | null>(null);
  // Server-issued, logged against this team — burnt into the watermark so a
  // leaked screenshot identifies who was holding it.
  const [refSessionId, setRefSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (game.referenceImage && !refDataUrl) {
      fetch("/api/quiz/round1/reference", { cache: "no-store" })
        .then((r) => r.json())
        .then((json) => {
          if (json.dataUrl) {
            setRefDataUrl(json.dataUrl);
            setRefSessionId(json.sessionId ?? null);
          }
        })
        .catch(console.error);
    }
  }, [game.referenceImage, refDataUrl]);

  // Poll from the moment an image is banked. Before the deadline this just
  // reports "saved"; crossing the deadline is what makes the server run the
  // round's single evaluation pass, and the result appears here.
  useEffect(() => {
    if (status !== "saved" && status !== "judging") return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/round1/submit?challengeSlug=${encodeURIComponent(game.slug)}`);
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;

        if (json.status === "judging" && status === "saved") {
          setStatus("judging");
        }

        if (json.status === "scored") {
          setStatus("scored");
          setEvalResult({
            similarity: json.similarity,
            final_score: json.final_score,
            model_used: json.model_used,
          });
          onChanged();
        } else if (json.status === "rejected_watermark") {
          setStatus("rejected_watermark");
          setWatermarkError(true);
          setError("that's the reference image, not your generation");
        } else if (json.status === "failed") {
          setStatus("failed");
          setError(json.error || "Image evaluation failed. Please try uploading again.");
        }
      } catch (err) {
        console.error("[ImageReplication] Polling error:", err);
      }
    };

    void poll();
    const interval = setInterval(poll, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [status, game.slug, onChanged]);

  async function handleFile(file: File) {
    if (disabled) return;
    setStatus("uploading");
    setError(null);
    setWatermarkError(false);
    try {
      const dataUrl = await shrinkImage(file);
      setPreview(dataUrl);

      // Submit via the new unified /api/round1/submit route
      const submitRes = await fetch("/api/round1/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeSlug: game.slug, dataUrl }),
      });

      const body = await submitRes.json();
      if (!submitRes.ok) {
        setError(body.error ?? "Submission failed");
        // A 403 means the clock ran out mid-upload — the previously banked
        // image stands, so don't drop back to "no upload".
        setStatus(body.locked ? "judging" : "idle");
        return;
      }

      // Banked, not judged. The team can keep replacing it until time is up.
      setSubmissionId(body.imageId ?? body.submissionId ?? null);
      setStatus("saved");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that file");
      setStatus("idle");
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    setWatermarkError(false);
    try {
      const res = await fetch(`/api/quiz/image?challengeSlug=${encodeURIComponent(game.slug)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not withdraw that submission");
        return;
      }
      setPreview(null);
      setSubmissionId(null);
      setStatus("idle");
      setEvalResult(null);
      onChanged();
    } finally {
      setDeleting(false);
    }
  }

  const currentPoints = evalResult?.final_score ?? game.verdict?.points;

  return (
    <div>
      {/* Reference Image Display with 50s initial view + 30s mid-game peek at 2m 30s */}
      {game.referenceImage && (
        <div className="mb-4">
          {isReferenceVisible ? (
            <div className="border-2 border-glitch-cyan bg-glitch-cyan/10 p-3 rounded space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs uppercase tracking-wider text-glitch-cyan flex items-center gap-1.5">
                  {isInitialVisible ? "Reference Image Display" : "Mid-Game Bonus Peek!"}
                </span>
                <span className="font-mono text-xs font-bold text-comic-yellow bg-ink-black px-2 py-0.5 rounded border border-comic-yellow/40">
                  Hides in {isInitialVisible ? initialSecondsLeft : midGameSecondsLeft}s
                </span>
              </div>
              {refDataUrl ? (
                <ProtectedImage
                  src={refDataUrl}
                  sessionId={refSessionId}
                  alt="The reference image to recreate"
                  teamName={teamName}
                  className="border-2 border-paper-white/20 bg-ink-black/80"
                  protectFocusLoss
                />
              ) : (
                <div className="flex h-64 items-center justify-center border-2 border-paper-white/20 bg-ink-black/80">
                  <span className="font-comic text-paper-white/40">Loading Secure Image…</span>
                </div>
              )}
              <p className="text-[10px] text-paper-white/50 text-center">
                🔒 Watermarked with your team name — screenshots or photos of this image are traceable.
              </p>
            </div>
          ) : (
            <div className="border-2 border-dashed border-paper-white/20 bg-ink-black/60 p-4 text-center rounded space-y-1.5">
              <p className="font-display text-xs uppercase tracking-wider text-paper-white/90">Reference Image Hidden</p>
              <p className="text-[11px] text-paper-white/70">
                {elapsedSeconds < 150
                  ? "Reference image was visible for the first 50s. It will reappear for 30s at the 2m 30s mark (1min before deadline)!"
                  : "All reference image peeks completed. Submit your final creation before the deadline!"}
              </p>
            </div>
          )}
        </div>
      )}

      <p className="mb-3 text-xs text-paper-white/70 font-semibold">
        Use any AI tool to recreate the image, then drag & drop or upload your result before the deadline.
      </p>

      {/* Watermark Error Banner */}
      {watermarkError && (
        <div className="mb-4 border-2 border-signal-wrong bg-signal-wrong/15 p-4 rounded text-center space-y-2">
          <p className="font-display text-sm text-signal-wrong uppercase tracking-wide flex items-center justify-center gap-2">
            ⚠️ Watermark Violation Detected!
          </p>
          <p className="text-xs text-paper-white/90 font-mono">
            "That's the reference image, not your generation!"
          </p>
          <p className="text-[11px] text-paper-white/60">
            Copying or re-uploading the original reference image is not allowed. Please generate an authentic AI image recreation.
          </p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="mt-2 inline-block px-4 py-1.5 text-xs font-comic uppercase tracking-wider border border-paper-white/30 bg-ink-black hover:bg-paper-white/10 text-paper-white rounded"
          >
            {deleting ? "Clearing…" : "Try Again with Fresh Image"}
          </button>
        </div>
      )}

      {/* Uploaded / Judging / Scored View */}
      {displayImage && !watermarkError ? (
        <div className="halftone panel border-2 border-glitch-cyan/60 p-4 relative space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-paper-white/10 pb-3">
            <div>
              <span className="font-comic text-base text-glitch-cyan flex items-center gap-1.5">
                {status === "uploading"
                  ? "Uploading Image…"
                  : status === "judging"
                  ? "Time's Up — Evaluating…"
                  : isJudged || status === "scored"
                  ? "Image Evaluated & Scored"
                  : status === "saved"
                  ? "Image Locked In — Replaceable Until Time"
                  : "Image Saved & Uploaded"}
              </span>
            </div>

            {/* Score Badge */}
            {(isJudged || status === "scored") && currentPoints !== undefined && (
              <div className="flex items-center gap-2 border border-comic-yellow/50 bg-comic-yellow/10 px-3 py-1 rounded">
                <span className="text-xs font-mono uppercase text-comic-yellow font-bold">Score:</span>
                <span className="text-sm font-comic text-comic-yellow">{currentPoints} / 10 pts</span>
                {evalResult?.similarity !== undefined && (
                  <span className="text-[10px] text-paper-white/60 font-mono">
                    ({Math.round(evalResult.similarity * 100)}% match)
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-center p-2 bg-ink-black/60 border border-paper-white/15 relative">
            <ProtectedImage src={displayImage} alt="Your uploaded recreation" teamName={teamName} className="rounded" />

            {/* Judging only ever runs after the clock hits zero. */}
            {status === "judging" && (
              <div className="absolute inset-0 bg-ink-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center space-y-3">
                <div className="w-10 h-10 border-4 border-glitch-cyan border-t-transparent rounded-full animate-spin"></div>
                <p className="font-comic text-base text-glitch-cyan animate-pulse">
                  ⚡ AI Evaluation in Progress…
                </p>
                <p className="text-xs text-paper-white/70 font-mono">
                  Judging your final image & inspecting watermarks…
                </p>
              </div>
            )}
          </div>

          {status === "saved" && (
            <p className="text-center text-[11px] font-mono text-comic-yellow/90 pt-1">
              Not judged yet — you can replace this as many times as you like. Only your LAST image is scored, when the timer ends.
            </p>
          )}

          {!disabled && status !== "judging" && status !== "scored" && (
            <div className="flex items-center justify-center gap-4 pt-1">
              <label className="cursor-pointer text-xs text-glitch-cyan hover:underline py-1">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
                Replace image
              </label>

              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-signal-wrong hover:underline py-1"
              >
                {deleting ? "Deleting…" : "Delete & start over"}
              </button>
            </div>
          )}

          {disabled && <p className="text-xs text-paper-white/45 text-center">Window closed — submission final.</p>}
        </div>
      ) : (
        /* Drag and Drop Dropzone */
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void handleFile(file);
          }}
          className={`grid cursor-pointer place-items-center border-2 border-dashed px-4 py-8 text-center transition-all rounded ${
            isDragging
              ? "border-glitch-cyan bg-glitch-cyan/15 scale-[1.01]"
              : "border-paper-white/25 hover:border-paper-white/45 bg-ink-black/40"
          } ${disabled || status === "uploading" ? "pointer-events-none opacity-40" : ""}`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={disabled || status === "uploading"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
          <span className="font-comic text-2xl text-paper-white/80">
            {status === "uploading" ? "Uploading Image…" : isDragging ? "Drop your image here!" : "Drag & drop or upload your image"}
          </span>
          <span className="mt-1.5 text-xs text-paper-white/50 font-mono">
            Supports JPEG, PNG or WebP (max 10MB)
          </span>
        </label>
      )}

      {error && !watermarkError && <p className="mt-2 text-xs text-signal-wrong text-center">{error}</p>}
    </div>
  );
}

/**
 * Four tiles, revealed one at a time on the coordinator's schedule. A team
 * can guess as often as they like — a wrong guess costs nothing but the
 * attempt, since the puzzle itself is the difficulty, not a one-shot penalty.
 */
function ConnectionsGame({ game, disabled, onSolved }: { game: Round1Game; disabled: boolean; onSolved: () => void }) {
  const { ditherEnabled } = useDitherSetting();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);

  const images = game.images ?? [];
  const totalImages = game.totalImages ?? 4;
  const history = game.attemptsHistory ?? [];
  const isSolved = game.solved === true;

  const revealedCount = images.length;
  const isCompleted = isSolved || (history.length >= totalImages && revealedCount >= totalImages);

  const [localSubmissionCountForTile, setLocalSubmissionCountForTile] = useState(0);
  const prevRevealedRef = useRef(revealedCount);
  useEffect(() => {
    if (revealedCount !== prevRevealedRef.current) {
      setLocalSubmissionCountForTile(0);
      prevRevealedRef.current = revealedCount;
    }
  }, [revealedCount]);

  // Check if team has already submitted an attempt for the currently revealed tile count
  const hasSubmittedForCurrentTile = history.length >= totalImages || localSubmissionCountForTile >= 1 || history.length >= revealedCount;
  const lastAttempt = history[history.length - 1];

  // Final 10-second countdown once ALL tiles are revealed by the coordinator
  const allTilesRevealed = revealedCount >= totalImages;
  const [finalSecondsLeft, setFinalSecondsLeft] = useState(10);
  const [hasTimedOut, setHasTimedOut] = useState(false);

  // Only reset state when the puzzle itself changes (new slug = new puzzle)
  const prevSlugRef = useRef(game.slug);
  useEffect(() => {
    if (prevSlugRef.current !== game.slug) {
      prevSlugRef.current = game.slug;
      setValue("");
      setBusy(false);
      setError(null);
      setHasTimedOut(false);
      setFinalSecondsLeft(10);
    }
  }, [game.slug]);

  const handleTimeout = useCallback(async () => {
    if (hasTimedOut || isCompleted || disabled) return;
    setHasTimedOut(true);
    try {
      await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: game.slug, payload: "__timeout__" }),
      });
    } finally {
      onSolved();
    }
  }, [game.slug, isCompleted, disabled, onSolved, hasTimedOut]);

  // Only start the 10-second final countdown when ALL tiles are revealed,
  // the team hasn't submitted for the last tile yet, puzzle isn't done,
  // and we haven't already timed out
  useEffect(() => {
    if (!allTilesRevealed || disabled || hasSubmittedForCurrentTile || isCompleted || hasTimedOut) return;
    setFinalSecondsLeft(10);

    const timer = setInterval(() => {
      setFinalSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timer);
          void handleTimeout();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [allTilesRevealed, disabled, hasSubmittedForCurrentTile, isCompleted, hasTimedOut, handleTimeout]);

  async function submit() {
    if (submittingRef.current || busy || disabled || hasSubmittedForCurrentTile || isCompleted) return;
    if (!value.trim()) {
      setError("Please type your answer in the box first!");
      inputRef.current?.focus();
      return;
    }
    submittingRef.current = true;
    const submittedVal = value.trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: game.slug, payload: submittedVal }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? "Submission failed");
        return;
      }
      setValue("");
      setLocalSubmissionCountForTile(c => c + 1);
      onSolved();
    } catch {
      setError("Submission failed");
    } finally {
      setBusy(false);
      submittingRef.current = false;
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 border-b border-paper-white/10 pb-3">
        <div>
          <span className="text-xs font-semibold text-paper-white/50">
            Puzzle {game.puzzleIndex ?? 1} of {game.totalPuzzles ?? 5} • {totalImages} Image Tiles
          </span>
          <p className="text-xs text-paper-white/80 mt-0.5">
            A handful of pictures, one shared technical term. The coordinator reveals each tile live!
          </p>
          {allTilesRevealed && !isCompleted && (
            <p className="mt-1 font-comic text-xs text-spider-red animate-pulse">
              All tiles revealed! Final 10-second countdown to answer!
            </p>
          )}
        </div>

        <div className="shrink-0 flex items-center gap-3">
          {allTilesRevealed && !isCompleted && !hasSubmittedForCurrentTile && (
            <SpiderTimer
              secondsLeft={finalSecondsLeft}
              totalSeconds={10}
              urgent={finalSecondsLeft <= 4}
              size={70}
              format="seconds"
              phaseLabel="10S LEFT"
            />
          )}
        </div>
      </div>

      {game.clue && (
        <p className="anim-pop border-l-4 border-gadget-pink bg-gadget-pink/10 px-4 py-3 text-sm text-paper-white">
          <span className="font-comic mr-2 text-base text-gadget-pink">CLUE:</span>
          {game.clue}
        </p>
      )}

      {/* TILE IMAGE GRID — REVEALED LIVE BY COORDINATOR */}
      <div
        className={`grid gap-3 ${
          totalImages === 2 ? "grid-cols-2 max-w-xl mx-auto" :
          totalImages === 3 ? "grid-cols-1 sm:grid-cols-3" :
          "grid-cols-2 sm:grid-cols-4"
        }`}
      >
        {Array.from({ length: totalImages }).map((_, i) => {
          const isRevealed = i < revealedCount;
          return (
            <div
              key={i}
              className={`aspect-video overflow-hidden border-2 relative ${
                isRevealed ? "border-glitch-cyan/60 bg-ink-black/80" : "border-dashed border-paper-white/15 bg-ink-black/40"
              }`}
            >
              {isRevealed && images[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <DitheredImage
                  src={images[i]}
                  alt={`Tile ${i + 1}`}
                  dither={ditherEnabled}
                  fit="contain"
                  className="h-full w-full p-1"
                />
              ) : (
                <div className="grid h-full place-items-center text-[0.65rem] uppercase tracking-widest text-paper-white/30 font-mono">
                  TILE {i + 1}
                </div>
              )}
              <div className="absolute top-1 left-1 bg-ink-black/80 text-[10px] font-mono px-1.5 py-0.5 text-paper-white/70 border border-paper-white/20 rounded">
                #{i + 1}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-paper-white/80">
        <span>{allTilesRevealed ? "All tiles revealed by coordinator." : `${revealedCount} of ${totalImages} tiles revealed.`}</span>
        <span className="text-comic-yellow font-bold uppercase tracking-wider">
          Attempt {Math.min(history.length, totalImages)} of {totalImages} (1 try per revealed tile)
        </span>
      </div>

      {/* ANSWER INPUT FORM */}
      {!isCompleted ? (
        <div className="space-y-3 pt-2">
          {hasSubmittedForCurrentTile || (allTilesRevealed && finalSecondsLeft === 0) || hasTimedOut ? (
            <div className="border-2 border-comic-yellow/50 bg-ink-black/80 p-4 text-center rounded space-y-1">
              <p className="font-comic text-sm text-comic-yellow">
                🔒 {allTilesRevealed && finalSecondsLeft === 0 ? "Time's Up! Attempt Window Closed." : `Attempt ${history.length} Submitted: "${lastAttempt?.payload === "__timeout__" ? "No Answer" : lastAttempt?.payload}"`}
              </p>
              <p className="text-xs text-paper-white/70">
                ⏳ Waiting for the coordinator to open the next puzzle for all teams…
              </p>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={
                  revealedCount === 0
                    ? "Waiting for coordinator to reveal Tile 1..."
                    : `Type answer for Tile ${revealedCount} (1 try per tile)...`
                }
                disabled={disabled || busy || revealedCount === 0}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                data-web-target=""
                className="w-full border-2 border-paper-white/20 bg-ink-black/80 px-4 py-3 text-base text-paper-white outline-none placeholder:text-paper-white/30 focus:border-glitch-cyan disabled:opacity-40 rounded"
              />
              <button
                type="button"
                data-web-target=""
                onClick={submit}
                disabled={busy || disabled || revealedCount === 0}
                className="comic-btn comic-btn-cyan shrink-0"
              >
                {busy ? "…" : "Lock it in"}
              </button>
            </div>
          )}

          {error && <p className="anim-shake text-xs text-signal-wrong font-bold">{error}</p>}
        </div>
      ) : (
        <div className="border-2 border-signal-good bg-signal-good/10 p-5 text-center rounded space-y-2">
          <p className="font-display-xl text-xl text-signal-good uppercase tracking-wider">
            {isSolved ? "PUZZLE COMPLETED!" : "PUZZLE CONCLUDED"}
          </p>
          {game.solvedVerdict && (
            <p className="font-headline-lg text-sm text-paper-white">
              Awarded <span className="text-comic-yellow font-bold">+{game.solvedVerdict.points} PTS</span>
              {game.solvedVerdict.rank && ` • Rank #${game.solvedVerdict.rank}`}
            </p>
          )}
          <p className="text-xs text-glitch-cyan font-mono animate-pulse">
            ⏳ Locked in! Waiting for the coordinator to open the next puzzle for all teams…
          </p>
        </div>
      )}

      {/* ATTEMPTS HISTORY */}
      {history.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-paper-white/10">
          <p className="text-xs font-bold uppercase tracking-wider text-paper-white/50">STAGE ATTEMPTS HISTORY:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {history.map((h, idx) => {
              const isWin = h.correct;
              const isTimeout = h.payload === "__timeout__" || h.reason === "no-answer";
              return (
                <div
                  key={idx}
                  className={`border-2 p-3 text-xs rounded space-y-1 ${
                    isWin
                      ? "border-signal-good bg-signal-good/15 text-signal-good font-bold"
                      : isTimeout
                        ? "border-comic-yellow/50 bg-comic-yellow/10 text-comic-yellow"
                        : "border-signal-wrong/50 bg-signal-wrong/10 text-signal-wrong"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold uppercase">Attempt #{h.imageIndex}:</span>
                    <span>
                      {isWin
                        ? `Correct (+${h.points} pts${h.rank ? `, Rank #${h.rank}` : ""})`
                        : isTimeout
                          ? `No Answer (${h.points} pts penalty)`
                          : `Wrong Answer (${h.points} pts penalty)`}
                    </span>
                  </div>
                  {!isTimeout && <p className="font-mono text-[11px] opacity-80">&quot;{h.payload}&quot;</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizRound } from "@/lib/db/types";
import { WebNet } from "./WebShooter";

/**
 * Rounds 2 & 3 — the two-phase 6s-read / 10s-select MCQ the rules doc
 * specifies. The countdown here is DISPLAY ONLY: it counts down from the
 * deadlines the server issued, and nothing it does affects scoring — the
 * verdict is decided from the serve record server-side. If a laptop clock
 * drifts, the team sees a slightly wrong number and still gets marked
 * correctly.
 *
 * Auto-advances to the next question once this one closes (verdict shown, or
 * the select window expires) — no "Next question" click needed, which is what
 * the rules doc's "auto-advance" note for Round 3 asks for; applied to both
 * MCQ rounds here since the timing is server-driven either way.
 *
 * Per the rules doc, correct answers are never revealed mid-round — the
 * verdict panel below only ever says right/wrong and points, never which
 * option was correct.
 */

interface Question {
  slug: string;
  title: string;
  round: QuizRound;
  points: number;
  options: string[];
  readUntil: string;
  answerableUntil: string;
  eliminated: number[];
  hint: string | null;
  index: number;
  total: number;
}

interface Verdict {
  correct: boolean;
  points: number;
  meta?: Record<string, unknown>;
}

interface ComebackStatus {
  bottomStreak: number;
  ability: "extra-time" | "fifty-fifty" | "hint" | "skip" | null;
  info: { label: string; icon: string; description: string } | null;
  usableOnSlug: string | null;
  used: boolean;
}

const AUTO_ADVANCE_DELAY_MS = 1600;

export default function Mcq2Phase({
  round,
  persona,
}: {
  round: QuizRound;
  persona: { colour: string; webColour: string; shout: string; miss: string };
}) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<number | null>(null);
  const [webHit, setWebHit] = useState({ x: 50, y: 50 });
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Seeded at 0 rather than Date.now() — reading the clock during render is
  // an impure call React Compiler needs render to be free of; the ticking
  // effect below sets the real value the moment it mounts.
  const [now, setNow] = useState(0);
  const [comeback, setComeback] = useState<ComebackStatus | null>(null);

  const inFlight = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChoice(null);
    setVerdict(null);
    try {
      const res = await fetch(`/api/quiz/serve?round=${round}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not load the question");
        setQuestion(null);
      } else if (body.done) {
        setDone(true);
        setQuestion(null);
      } else {
        setQuestion(body);
      }
    } catch {
      setError("Network problem — check your connection");
    } finally {
      setLoading(false);
    }
  }, [round]);

  const loadComeback = useCallback(async () => {
    if (round !== 3) return;
    const res = await fetch("/api/quiz/comeback", { cache: "no-store" });
    if (res.ok) setComeback(await res.json());
  }, [round]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      await loadQuestion();
      if (cancelled) return;
      await loadComeback();
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadQuestion, loadComeback]);

  useEffect(() => {
    // No immediate setNow() call here — an effect body must not call
    // setState synchronously. The 200ms cadence means the first real tick
    // lands imperceptibly after mount anyway.
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const readUntilMs = question ? new Date(question.readUntil).getTime() : 0;
  const answerableUntilMs = question ? new Date(question.answerableUntil).getTime() : 0;
  const phase: "read" | "select" | "closed" = !question
    ? "closed"
    : now < readUntilMs
      ? "read"
      : now < answerableUntilMs
        ? "select"
        : "closed";

  // Auto-advance once the question closes, whether by verdict or by time.
  useEffect(() => {
    if (!question) return;
    if (verdict || phase === "closed") {
      if (advanceTimer.current) return;
      advanceTimer.current = setTimeout(() => {
        advanceTimer.current = null;
        void loadQuestion();
        void loadComeback();
      }, AUTO_ADVANCE_DELAY_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict, phase]);

  async function submit() {
    if (!question || inFlight.current || choice === null) return;
    inFlight.current = true;
    setSubmitting(true);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ event: "quiz", challengeSlug: question.slug, payload: String(choice) }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Submission failed");
      else setVerdict(body);
    } catch {
      setError("Network problem — your answer may not have been recorded");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  async function useAbility() {
    if (!question) return;
    const res = await fetch("/api/quiz/power", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengeSlug: question.slug }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "Could not use your ability");
      return;
    }
    await loadComeback();
    if (body.effect?.ability === "skip") {
      await loadQuestion();
    } else {
      const res2 = await fetch(`/api/quiz/serve?round=${round}`, { cache: "no-store" });
      if (res2.ok) setQuestion(await res2.json());
    }
  }

  const readSecondsLeft = Math.max(0, Math.ceil((readUntilMs - now) / 1000));
  const selectSecondsLeft = Math.max(0, Math.ceil((answerableUntilMs - now) / 1000));
  const urgent = phase === "select" && selectSecondsLeft <= 3;

  return (
    <div>
      {error && (
        <div role="alert" className="anim-shake mb-6 border-2 border-signal-wrong bg-signal-wrong/10 px-4 py-3 text-sm text-signal-wrong">
          {error}
        </div>
      )}

      {loading && !question && <p className="font-comic text-2xl text-paper-white/40">Loading…</p>}

      {done && (
        <div className="halftone panel anim-pop p-10 text-center">
          <div className="relative">
            <div className="text-5xl">🕸</div>
            <h2 className="display-title chromatic mt-4 text-3xl text-paper-white">Round complete</h2>
            <p className="mx-auto mt-3 max-w-sm text-sm text-paper-white/60">
              Every question answered. Standings are live — hold tight while the coordinator makes the cut.
            </p>
          </div>
        </div>
      )}

      {question && (
        <article key={question.slug} className={`halftone panel anim-glitch-in p-6 ${urgent ? "panel-accent" : ""}`}>
          <div className="relative">
            <div className="mb-4 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.2em] text-paper-white/45">
              <span>
                Question <span className="tabular-nums text-paper-white/70">{question.index}</span> of{" "}
                <span className="tabular-nums text-paper-white/70">{question.total}</span>
              </span>
              <span className="text-glitch-cyan">{question.points} pts</span>
            </div>

            <h2 className="text-lg font-semibold leading-snug text-paper-white sm:text-xl">{question.title}</h2>

            {!verdict && (
              <div className="mt-4">
                {phase === "read" && (
                  <p className="font-comic text-sm text-web-blue-light">
                    READ — answering opens in <span className="tabular-nums">{readSecondsLeft}s</span>
                  </p>
                )}
                {phase === "select" && (
                  <div
                    aria-live="off"
                    className={`font-comic text-right text-xl ${urgent ? "text-spider-red" : "text-glitch-cyan"}`}
                  >
                    {selectSecondsLeft}s to answer
                  </div>
                )}
                {phase === "closed" && <p className="font-comic text-sm text-signal-wrong">TIME&apos;S UP</p>}
              </div>
            )}

            {question.hint && (
              <p className="anim-pop mt-4 border-l-4 border-gadget-pink bg-gadget-pink/10 px-4 py-3 text-sm text-paper-white">
                <span className="font-comic mr-2 text-base text-gadget-pink">Intel</span>
                {question.hint}
              </p>
            )}

            {!verdict && (
              <div className="mt-6">
                <ul className="grid gap-2">
                  {question.options.map((opt, i) => {
                    const struck = question.eliminated.includes(i);
                    const picked = choice === i;
                    const disabled = struck || phase !== "select";
                    return (
                      <li key={i}>
                        <button
                          type="button"
                          data-web-target=""
                          disabled={disabled}
                          aria-pressed={picked}
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            const hit =
                              e.clientX === 0 && e.clientY === 0
                                ? { x: 50, y: 50 }
                                : { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
                            setWebHit(hit);
                            setChoice(i);
                          }}
                          style={picked ? { borderColor: persona.colour } : undefined}
                          className={`relative w-full overflow-hidden border-2 px-4 py-3 text-left text-sm transition-[transform,border-color,background-color] duration-100 ${
                            struck
                              ? "cursor-not-allowed border-paper-white/8 text-paper-white/25 line-through"
                              : picked
                                ? "bg-paper-white/[0.06] text-paper-white"
                                : "border-paper-white/15 text-paper-white hover:border-paper-white/40 disabled:opacity-40"
                          }`}
                        >
                          {picked && <WebNet colour={persona.webColour} originX={webHit.x} originY={webHit.y} />}
                          <span className="relative flex items-start">
                            <span className="mr-3 font-display" style={{ color: picked ? persona.colour : "rgba(242,239,233,0.4)" }}>
                              {String.fromCharCode(65 + i)}
                            </span>
                            <span>{opt}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting || phase !== "select" || choice === null}
                  className="comic-btn comic-btn-cyan mt-5"
                >
                  {submitting ? "Sending…" : "Lock it in"}
                </button>
              </div>
            )}

            {verdict && (
              <div className="mt-6 anim-pop">
                {verdict.correct ? (
                  <div className="border-2 border-l-8 border-glitch-cyan bg-glitch-cyan/10 px-4 py-3" style={{ borderLeftColor: persona.colour }}>
                    <p className="font-comic text-2xl text-glitch-cyan">
                      {persona.shout} +{verdict.points}
                    </p>
                  </div>
                ) : (
                  <div className="border-2 border-l-8 border-signal-wrong bg-signal-wrong/10 px-4 py-3" style={{ borderLeftColor: persona.colour }}>
                    <p className="font-comic text-2xl text-signal-wrong">{persona.miss}</p>
                  </div>
                )}
                <p className="mt-2 text-xs text-paper-white/40">Next question in a moment…</p>
              </div>
            )}
          </div>
        </article>
      )}

      {round === 3 && comeback?.ability && !comeback.used && comeback.usableOnSlug === question?.slug && !verdict && (
        <section className="halftone panel mt-6 p-5">
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="anim-surge">
              <div className="font-comic text-2xl text-gadget-pink">
                <span className="mr-1.5">{comeback.info?.icon}</span>
                {comeback.info?.label}
              </div>
              <div className="mt-0.5 text-xs text-paper-white/60">{comeback.info?.description}</div>
            </div>
            <button type="button" onClick={useAbility} disabled={phase !== "select"} className="comic-btn comic-btn-pink">
              Use it
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QuizRound } from "@/lib/db/types";
import Celebration from "./Celebration";

import SpiderTimer from "./SpiderTimer";

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
  image?: string | null;
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

const AUTO_ADVANCE_DELAY_MS = 3400;

function parseQuestionTitle(title: string) {
  if (!title) return { prompt: "", code: null };
  const lines = title.split("\n");

  const isCodeLine = (line: string) => {
    const t = line.trim();
    return (
      t.startsWith("#include") ||
      t.startsWith("using namespace") ||
      t.startsWith("def ") ||
      t.startsWith("class ") ||
      t.startsWith("import ") ||
      t.startsWith("int main") ||
      t.startsWith("int f(") ||
      t.startsWith("int ") ||
      t.startsWith("void ") ||
      t.startsWith("struct ") ||
      t.startsWith("public static") ||
      t.startsWith("x = ") ||
      t.startsWith("print(") ||
      t.startsWith("cout") ||
      t.startsWith("return ") ||
      t.includes("nonlocal ") ||
      (t.includes("{") && !t.toLowerCase().startsWith("what")) ||
      (t.includes("}") && t.length < 5)
    );
  };

  const firstCodeIdx = lines.findIndex(isCodeLine);
  if (firstCodeIdx !== -1) {
    const prompt = lines.slice(0, firstCodeIdx).join("\n").trim();
    const code = lines.slice(firstCodeIdx).join("\n").trim();
    return { prompt: prompt || title, code };
  }

  return { prompt: title, code: null };
}

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
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(0);
  const [comeback, setComeback] = useState<ComebackStatus | null>(null);

  const inFlight = useRef(false);
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clockSkewMs = useRef(0);

  const loadQuestion = useCallback(async () => {
    setLoading(true);
    setError(null);
    setChoice(null);
    setVerdict(null);
    try {
      const fetchStart = Date.now();
      const res = await fetch(`/api/quiz/serve?round=${round}`, { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Could not load the question");
        setQuestion(null);
      } else if (body.done) {
        setDone(true);
        setQuestion(null);
      } else {
        if (body.serverNow) {
          clockSkewMs.current = fetchStart - new Date(body.serverNow).getTime();
        }
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
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
  }, []);

  const syncedNow = (now > 0 ? now : Date.now()) - clockSkewMs.current;
  const readUntilMs = question ? new Date(question.readUntil).getTime() : 0;
  const answerableUntilMs = question ? new Date(question.answerableUntil).getTime() : 0;
  const phase: "read" | "select" | "closed" = !question
    ? "closed"
    : syncedNow < readUntilMs
      ? "read"
      : syncedNow < answerableUntilMs
        ? "select"
        : "closed";

  useEffect(() => {
    if (!question) return;
    if (phase === "closed") {
      const timer = setInterval(() => {
        void loadQuestion();
        void loadComeback();
      }, 500);
      return () => clearInterval(timer);
    }
  }, [phase, question, loadQuestion, loadComeback]);

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

  const readSecondsLeft = Math.max(0, Math.ceil((readUntilMs - syncedNow) / 1000));
  const selectSecondsLeft = Math.max(0, Math.ceil((answerableUntilMs - syncedNow) / 1000));
  const urgent = phase === "select" && selectSecondsLeft <= 3;
  const letters = ["A", "B", "C", "D"];
  const tilts = ["comic-tilt-left", "", "comic-tilt-right", "-rotate-1"];

  return (
    <div>
      {error && (
        <div role="alert" className="pop-in mb-6 comic-border bg-primary text-on-primary p-4 font-headline-lg text-caption-bold uppercase">
          {error}
        </div>
      )}

      {loading && !question && (
        <p className="font-display-xl text-headline-lg uppercase text-on-surface-variant text-center my-12">Loading Question…</p>
      )}

      {done && (
        <div className="space-y-6">
          <div className="bg-surface comic-border p-10 text-center relative overflow-hidden comic-tilt-left">
            <div className="absolute inset-0 ben-day pointer-events-none opacity-20"></div>
            {round === 3 && <Celebration />}
            <div className="relative z-10">
              <h2 className="font-display-xl text-[40px] uppercase italic text-on-background mt-2">
                {round === 3 ? "Multiverse Complete" : "Round Complete"}
              </h2>
              <p className="font-body-md text-on-surface-variant max-w-md mx-auto mt-2">
                {round === 3
                  ? "That's every question across every universe. Check out your final standings!"
                  : "Every question answered! Standings are live."}
              </p>
            </div>
          </div>
        </div>
      )}

      {question && (
        <article key={question.slug} className="space-y-6">
          {/* Status / Timer Header bar */}
          <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <div className="bg-surface comic-border-sm p-2 flex items-center gap-3 comic-tilt-left">
              <SpiderTimer
                secondsLeft={phase === "read" ? readSecondsLeft : selectSecondsLeft}
                totalSeconds={phase === "read" ? 6 : 10}
                urgent={urgent}
                size={80}
                format="seconds"
                phaseLabel={phase === "read" ? "READ" : "PICK"}
              />
            </div>

            <div className="flex-1 min-w-[160px] bg-surface-container comic-border-sm h-6 relative overflow-hidden mx-2">
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-all duration-300"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      phase === "read"
                        ? ((readUntilMs - syncedNow) / 6000) * 100
                        : ((answerableUntilMs - syncedNow) / 10000) * 100
                    )
                  )}%`,
                }}
              />
            </div>

            <div className="bg-tertiary-fixed comic-border-sm p-3 comic-tilt-right">
              <span className="font-label-sm uppercase text-[10px] block leading-none">Points</span>
              <span className="font-display-xl text-headline-lg-mobile">{question.points}</span>
            </div>
          </div>

          {/* Question Box */}
          {(() => {
            const parsed = parseQuestionTitle(question.title);
            return (
              <div className="bg-surface-container-lowest comic-border p-6 md:p-10 relative overflow-hidden">
                <div className="absolute inset-0 ben-day pointer-events-none opacity-10"></div>
                <p className="font-label-sm text-primary uppercase tracking-[0.2em] mb-3 relative z-10">
                  Question {question.index} / {question.total}
                </p>
                
                <h2 className="font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface leading-tight relative z-10 whitespace-pre-line mb-3">
                  {parsed.prompt}
                </h2>

                {parsed.code && (
                  <div className="relative z-10 my-4 comic-border rounded-lg overflow-hidden bg-[#0a0b0e] shadow-xl">
                    <div className="bg-[#16171d] border-b-2 border-ink-black px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-spider-red inline-block border border-ink-black" />
                        <span className="w-3 h-3 rounded-full bg-comic-yellow inline-block border border-ink-black" />
                        <span className="w-3 h-3 rounded-full bg-signal-good inline-block border border-ink-black" />
                      </div>
                      <span className="font-mono text-[11px] font-bold text-glitch-cyan uppercase tracking-widest flex items-center gap-1.5">
                        CODE SNIPPET
                      </span>
                    </div>
                    <pre className="p-4 sm:p-6 font-mono text-sm md:text-base text-glitch-cyan leading-relaxed overflow-x-auto whitespace-pre bg-[#0a0b0e] border-t border-paper-white/10">
                      <code>{parsed.code}</code>
                    </pre>
                  </div>
                )}

                {question.image && (
                  <div className="relative z-10 my-4 flex justify-center">
                    <img
                      src={question.image}
                      alt="Question Image"
                      className="max-h-72 w-auto object-contain comic-border bg-surface p-2 shadow-md"
                    />
                  </div>
                )}
              </div>
            );
          })()}

          {question.hint && (
            <div className="bg-tertiary-fixed p-4 comic-border comic-tilt-left">
              <span className="font-label-sm text-on-tertiary-fixed-variant uppercase text-[11px] block font-bold">Intel Hint</span>
              <p className="font-body-md text-on-tertiary-fixed font-bold italic">{question.hint}</p>
            </div>
          )}

          {/* Options Grid */}
          {!verdict && (
            <div>
              {phase === "read" ? (
                <div className="bg-surface comic-border p-8 text-center comic-tilt-right">
                  <div className="font-display-xl text-headline-lg text-on-surface-variant uppercase mb-1">Options Locked</div>
                  <p className="font-label-sm text-on-surface-variant uppercase text-xs">
                    Reading window active — options reveal in {readSecondsLeft}s
                  </p>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-panel-gap">
                    {question.options.map((opt, i) => {
                      const struck = question.eliminated.includes(i);
                      const picked = choice === i;
                      const disabled = struck || phase !== "select" || verdict !== null;
                      return (
                        <button
                          key={i}
                          type="button"
                          data-web-target
                          disabled={disabled}
                          onClick={() => setChoice(i)}
                          className={`quiz-answer group relative comic-border p-6 ${tilts[i % 4]} hover:rotate-0 hover:scale-105 transition-all duration-200 text-left overflow-hidden min-h-[125px] ${
                            picked
                              ? "bg-primary/20 border-4 border-primary shadow-[8px_8px_0px_rgba(27,27,28,1)] scale-[1.02]"
                              : "bg-surface"
                          } ${disabled ? "opacity-35 cursor-not-allowed" : ""}`}
                        >
                          {/* Full Spider Web Overlay covering 100% of the selected option card */}
                          {picked && (
                            <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
                              {/* Web texture mask covering full container */}
                              <div
                                className="absolute inset-0 opacity-45 animate-pulse"
                                style={{
                                  backgroundColor: persona.colour ?? "#e5223b",
                                  WebkitMaskImage: "url(/quiz/web.svg)",
                                  maskImage: "url(/quiz/web.svg)",
                                  WebkitMaskSize: "cover",
                                  maskSize: "cover",
                                  WebkitMaskRepeat: "no-repeat",
                                  maskRepeat: "no-repeat",
                                  WebkitMaskPosition: "center",
                                  maskPosition: "center",
                                }}
                              />
                              {/* Radial web strands reaching all 4 corners and edges */}
                              <svg className="w-full h-full absolute inset-0 opacity-60" viewBox="0 0 400 150" preserveAspectRatio="none" fill="none" stroke={persona.colour ?? "#e5223b"}>
                                <path d="M 0,0 L 400,150 M 400,0 L 0,150 M 200,0 L 200,150 M 0,75 L 400,75" strokeWidth="2.5" opacity="0.6" />
                                <polygon points="200,25 300,75 200,125 100,75" strokeWidth="2" opacity="0.5" fill={`${persona.colour ?? "#e5223b"}22`} />
                                <polygon points="200,8 375,75 200,142 25,75" strokeWidth="1.5" opacity="0.4" />
                                <path d="M 0 0 Q 70 30 100 0 M 0 0 Q 30 70 0 100" strokeWidth="2.5" />
                                <path d="M 400 0 Q 330 30 300 0 M 400 0 Q 370 70 400 100" strokeWidth="2.5" />
                                <path d="M 0 150 Q 70 120 100 150 M 0 150 Q 30 80 0 50" strokeWidth="2.5" />
                                <path d="M 400 150 Q 330 120 300 150 M 400 150 Q 370 80 400 50" strokeWidth="2.5" />
                              </svg>
                              {/* Top-right "WEB LOCKED" badge */}
                              <div className="absolute top-2 right-2 bg-primary text-on-primary px-2.5 py-0.5 comic-border text-[10px] font-headline-lg uppercase tracking-wider shadow">
                                WEB LOCKED
                              </div>
                            </div>
                          )}

                          <span className={`absolute top-2 left-2 font-display-xl text-2xl transition-colors ${
                            picked ? "text-primary font-black opacity-100 scale-110" : "text-surface-container-highest opacity-70"
                          }`}>
                            {letters[i]}
                          </span>

                          <div className="relative z-10 h-full flex flex-col justify-end pt-5">
                            <span className={`font-headline-lg text-headline-lg-mobile transition-all ${
                              picked ? "text-primary font-black text-lg sm:text-xl drop-shadow" : "text-on-surface"
                            }`}>
                              {opt}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting || phase !== "select" || choice === null || verdict !== null}
                      className="relative bg-primary px-10 py-5 comic-border comic-tilt-right transition-all duration-100 hover:translate-x-1 hover:translate-y-1 hover:shadow-none shadow-[8px_8px_0px_0px_rgba(27,27,28,1)] active:scale-95 disabled:opacity-40"
                    >
                      <span className="font-display-xl text-headline-lg-mobile text-on-primary uppercase tracking-widest">
                        {verdict ? "LOCKED IN" : submitting ? "Locking in…" : "Lock it in"}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Verdict Box */}
          {verdict && (
            <div className="pop-in mt-6">
              {verdict.correct ? (
                <div className="bg-tertiary-fixed text-on-tertiary-fixed comic-border p-6 comic-tilt-left text-center">
                  <div className="font-display-xl text-[36px] uppercase leading-none">{persona.shout}</div>
                  <div className="font-label-sm uppercase text-sm mt-1">+{verdict.points} Points Earned!</div>
                </div>
              ) : (
                <div className="bg-primary text-on-primary comic-border p-6 comic-tilt-right text-center">
                  <div className="font-display-xl text-[36px] uppercase leading-none">{persona.miss}</div>
                  <div className="font-label-sm uppercase text-sm mt-1">No points awarded. Next question coming up...</div>
                </div>
              )}
            </div>
          )}
        </article>
      )}

      {/* Comeback Meter for Round 3 */}
      {round === 3 && (
        <section className="bg-surface comic-border p-6 mt-8 comic-tilt-left">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="font-display-xl text-headline-lg-mobile text-primary flex items-center gap-2">
                <span>COMEBACK METER</span>
                <span className="font-label-sm text-xs text-on-surface-variant">({comeback?.bottomStreak ?? 0} / 3 NOTCHES)</span>
              </div>
              <div className="font-label-sm text-xs text-on-surface-variant uppercase mt-1">
                Fills when finishing in bottom tier. Reaching 3 unlocks Multiverse Abilities!
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((notch) => {
                const filled = (comeback?.bottomStreak ?? 0) >= notch;
                return (
                  <div
                    key={notch}
                    className={`h-6 w-10 comic-border-sm transition-all duration-300 ${
                      filled ? "bg-tertiary-fixed" : "bg-surface-container"
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {comeback?.ability && !comeback.used && (!comeback.usableOnSlug || comeback.usableOnSlug === question?.slug) && !verdict && (
            <div className="mt-4 pt-4 border-t-2 border-dashed border-on-surface/20 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="font-display-xl text-headline-lg-mobile text-primary">
                  UNLOCKED: {comeback.info?.label}
                </div>
                <div className="font-label-sm text-xs text-on-surface-variant uppercase">{comeback.info?.description}</div>
              </div>
              <button
                type="button"
                onClick={useAbility}
                disabled={phase !== "select"}
                className="bg-primary text-on-primary font-display-xl text-caption-bold px-6 py-3 comic-border comic-tilt-right hover:scale-105 transition-transform"
              >
                Use Ability
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";

/**
 * Bench for the Round 1 vision judge.
 *
 * Pick a reference and a recreation, get the real verdict — same rubric, same
 * model, same prompt the event uses. Exists because the only other way to see a
 * judgement is to run a whole round: seed a database, log a team in, upload,
 * and wait for a deadline to pass.
 *
 * It shows every criterion rather than just the final mark, because the useful
 * question is not "what score" but "would I defend this score to the team that
 * got it".
 */

interface CriterionScore {
  key: string;
  score: number;
  note: string;
}

interface Verdict {
  cheating_detected: boolean;
  cheating_reason: string | null;
  cheating_confidence: string | null;
  similarity: number;
  criteria: CriterionScore[];
  summary: string;
  elapsedMs: number;
  model: string | null;
  rubric: Array<{ key: string; label: string; weight: number }>;
}

function useDataUrl(): [string | null, (f: File | null) => void] {
  const [url, setUrl] = useState<string | null>(null);
  return [
    url,
    (file) => {
      if (!file) return setUrl(null);
      const reader = new FileReader();
      reader.onload = () => setUrl(String(reader.result));
      reader.readAsDataURL(file);
    },
  ];
}

export default function JudgePreview() {
  const [reference, setReference] = useDataUrl();
  const [submission, setSubmission] = useDataUrl();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Preload the real Round 1 reference so only the recreation needs picking —
  // comparing against the actual reference is the only comparison that matters.
  useEffect(() => {
    fetch("/api/dev/reference")
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => {
        if (!b) return;
        const reader = new FileReader();
        reader.onload = () => setReference(new File([b], "reference"));
        reader.readAsDataURL(b);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run() {
    setBusy(true);
    setError(null);
    setVerdict(null);
    try {
      const res = await fetch("/api/dev/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference, submission }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? `HTTP ${res.status}`);
      else setVerdict(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const weightOf = (key: string) => verdict?.rubric.find((r) => r.key === key)?.weight ?? 0;
  const labelOf = (key: string) => verdict?.rubric.find((r) => r.key === key)?.label ?? key;

  return (
    <main className="mx-auto max-w-4xl space-y-5 p-6 text-paper-white">
      <h1 className="font-display text-2xl">Vision judge bench</h1>
      <p className="text-sm text-paper-white/60">
        Real judge, real rubric, real model. Development only — this route 404s in production.
      </p>

      <div className="panel grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-bold">Reference</p>
          <p className="mb-2 text-xs text-paper-white/50">Loaded automatically; override to try another.</p>
          <input type="file" accept="image/*" onChange={(e) => setReference(e.target.files?.[0] ?? null)} className="text-xs" />
          {reference && <img src={reference} alt="reference" className="mt-2 max-h-48 border border-paper-white/20" />}
        </div>
        <div>
          <p className="mb-1 text-sm font-bold">Team&apos;s recreation</p>
          <p className="mb-2 text-xs text-paper-white/50">Try a real AI generation, and a screenshot of the reference.</p>
          <input type="file" accept="image/*" onChange={(e) => setSubmission(e.target.files?.[0] ?? null)} className="text-xs" />
          {submission && <img src={submission} alt="submission" className="mt-2 max-h-48 border border-paper-white/20" />}
        </div>
      </div>

      <button
        type="button"
        onClick={run}
        disabled={!reference || !submission || busy}
        className="comic-btn px-4 py-2 disabled:opacity-40"
      >
        {busy ? "Judging…" : "Judge it"}
      </button>

      {error && <div className="panel border-spider-red p-4 text-sm text-spider-red">{error}</div>}

      {verdict && (
        <div className="panel space-y-3 p-4">
          <div className="flex flex-wrap items-baseline gap-4">
            <span className="font-display text-3xl text-comic-yellow">
              {(verdict.similarity * 100).toFixed(2)}%
            </span>
            <span className="text-sm text-paper-white/60">
              similarity {verdict.similarity.toFixed(4)} · {verdict.elapsedMs}ms · {verdict.model}
            </span>
          </div>

          {verdict.cheating_detected && (
            <div className="border-2 border-spider-red p-3 text-sm">
              <p className="font-bold text-spider-red">
                REJECTED — integrity check ({verdict.cheating_confidence} confidence)
              </p>
              <p className="text-paper-white/80">{verdict.cheating_reason}</p>
              <p className="mt-1 text-xs text-paper-white/50">All criteria forced to 0; this scores nothing.</p>
            </div>
          )}

          <p className="text-sm italic text-paper-white/80">{verdict.summary}</p>

          <table className="w-full text-left text-xs">
            <thead className="text-paper-white/50">
              <tr>
                <th className="py-1">Criterion</th>
                <th>Weight</th>
                <th>Score</th>
                <th>Contribution</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {verdict.criteria.map((c) => (
                <tr key={c.key} className="border-t border-paper-white/10">
                  <td className="py-1 font-bold">{labelOf(c.key)}</td>
                  <td>{weightOf(c.key)}</td>
                  <td className="font-mono text-comic-yellow">{c.score}/10</td>
                  <td className="font-mono text-paper-white/60">{c.score * weightOf(c.key)}</td>
                  <td className="text-paper-white/70">{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

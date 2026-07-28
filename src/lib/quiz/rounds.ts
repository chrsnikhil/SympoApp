import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import type { QuizRound } from "@/lib/db/types";

/**
 * Round progression and the cuts between rounds, per the official rules doc
 * (this overrides the earlier 20-MCQ/gadget/three-minigame draft — see the
 * build guide's §4 for why).
 *
 *   Round 1  "Final Universe"  every team     3 mini-games, combined score  → shortlist
 *   Round 2  "Universe 1"      shortlisted    warm-up MCQs, 6s read+10s pick → shortlist
 *   Round 3  "Universe 2"      finalists       same timing + comeback meter  → winner(s)
 *
 * Qualification is stored, not recomputed. Once the coordinator makes the cut,
 * the set of teams in the next round is a fact in the database — so a late
 * score correction can't silently change who was allowed to play.
 *
 * `advances` is a DEFAULT the coordinator can override per-event by passing an
 * explicit count to `advanceFrom` — the rules doc says "shortlisted teams"
 * without committing to a fixed number for a variable-sized field.
 */
export interface RoundSpec {
  round: QuizRound;
  title: string;
  /** Default teams that carry into the NEXT round. null = final round. */
  defaultAdvances: number | null;
}

export const ROUNDS: Record<QuizRound, RoundSpec> = {
  1: { round: 1, title: "Final Universe", defaultAdvances: 8 },
  2: { round: 2, title: "Universe 1 — Warm-up", defaultAdvances: 4 },
  3: { round: 3, title: "Universe 2 — Multiverse Abilities", defaultAdvances: null },
};

/**
 * Round 1 is open to every registered team — there's no qualification doc for
 * it, and requiring one would mean a registration step that can silently fail
 * and lock a team out of the event they turned up for.
 */
export async function isQualified(teamId: ObjectId, round: QuizRound): Promise<boolean> {
  if (round === 1) return true;
  const quals = await collections.roundQualifications();
  return (await quals.findOne({ round, teamId })) !== null;
}

export interface Standing {
  teamId: string;
  teamName: string;
  avatar: string | null;
  points: number;
  /** Tie-break key, ascending — see round-specific notes below. Seconds. */
  tiebreakSeconds: number;
  answered: number;
}

/** The quiz challenge slugs that belong to a round, in display order. */
export async function slugsInRound(round: QuizRound): Promise<string[]> {
  const challenges = await collections.challenges();
  const list = await challenges.find({ type: "quiz", "config.round": round }).toArray();
  return list.sort((a, b) => (a.config.order ?? 0) - (b.config.order ?? 0)).map((c) => c.slug);
}

/**
 * Standings within a round, ranked by combined points then by the tie-break.
 *
 * Round 1: the tie-break is when a team finished its LAST of the three
 * mini-games (earliest wins) — the rules doc doesn't specify a Round 1
 * tiebreak, so this follows the platform's general "server clock decides
 * ties" principle rather than leaving it undefined.
 *
 * Rounds 2/3: the tie-break is total answer time across every question
 * actually answered (servedAt → answeredAt, summed; an unanswered question
 * charges its full 16s window) — same reasoning, and it's what the Round 3
 * "handle a tie at the top" question in the build guide defaults to.
 */
export async function standings(round: QuizRound): Promise<Standing[]> {
  const [teamsCol, scores, subs] = await Promise.all([
    collections.teams(),
    collections.scoreEvents(),
    collections.submissions(),
  ]);

  const roundSlugs = new Set(await slugsInRound(round));
  const teamDocs = await teamsCol.find({}).toArray();
  const teamById = new Map(teamDocs.map((t) => [String(t._id), t]));

  // Points come from the ledger, sliced to this round's slugs. The pipeline
  // writes reasons as `quiz:<slug>` and knows nothing about rounds.
  const ledger = await scores.find({ event: "quiz" }).toArray();
  const points = new Map<string, number>();
  for (const row of ledger) {
    if (!roundSlugs.has(row.reason.replace(/^quiz:/, ""))) continue;
    const key = String(row.teamId);
    points.set(key, (points.get(key) ?? 0) + row.points);
  }

  const tiebreak = new Map<string, number>();
  const answered = new Map<string, number>();

  if (round === 1) {
    // Latest receivedAt among this team's round-1 submissions = when they
    // finished their third game. Earlier is better, so this becomes the
    // ascending tiebreak key directly (as a unix-seconds timestamp).
    const roundSubs = await subs
      .find({ type: "quiz", status: "done" })
      .toArray();
    const challenges = await collections.challenges();
    const chDocs = await challenges.find({ type: "quiz", "config.round": 1 }).toArray();
    const chById = new Map(chDocs.map((c) => [String(c._id), c]));
    for (const s of roundSubs) {
      const ch = chById.get(String(s.challengeId));
      if (!ch) continue;
      const key = String(s.teamId);
      const at = s.receivedAt.getTime() / 1000;
      tiebreak.set(key, Math.max(tiebreak.get(key) ?? 0, at));
      answered.set(key, (answered.get(key) ?? 0) + 1);
    }
  } else {
    const serves = await collections.quizServes();
    const roundServes = await serves.find({ round }).toArray();
    for (const s of roundServes) {
      const key = String(s.teamId);
      const limitMs = s.answerableUntil.getTime() - s.servedAt.getTime();
      const takenMs = s.answeredAt ? s.answeredAt.getTime() - s.servedAt.getTime() : limitMs;
      tiebreak.set(key, (tiebreak.get(key) ?? 0) + Math.max(0, takenMs) / 1000);
      if (s.answeredAt) answered.set(key, (answered.get(key) ?? 0) + 1);
    }
  }

  // Everyone who qualified for this round belongs in its table, even on zero
  // — otherwise a team that qualified but hasn't answered anything yet simply
  // vanishes, and "top N" comes up short.
  const involved = new Set<string>([...points.keys(), ...tiebreak.keys()]);
  if (round > 1) {
    const quals = await collections.roundQualifications();
    for (const q of await quals.find({ round }).toArray()) involved.add(String(q.teamId));
  } else {
    for (const t of teamDocs) {
      if (t.name !== "Quiz Control") involved.add(String(t._id));
    }
  }

  return [...involved]
    .map((teamId) => ({
      teamId,
      teamName: teamById.get(teamId)?.name ?? "Unknown",
      avatar: teamById.get(teamId)?.avatar ?? null,
      points: points.get(teamId) ?? 0,
      tiebreakSeconds: Math.round((tiebreak.get(teamId) ?? 0) * 10) / 10,
      answered: answered.get(teamId) ?? 0,
    }))
    .sort((a, b) => b.points - a.points || a.tiebreakSeconds - b.tiebreakSeconds);
}

/**
 * Make the cut into the next round. Idempotent: re-running it after a score
 * correction rewrites the qualification set rather than appending to it.
 */
export async function advanceFrom(round: QuizRound, count?: number): Promise<Standing[]> {
  const spec = ROUNDS[round];
  if (spec.defaultAdvances === null && count === undefined) {
    throw new Error(`Round ${round} is the final round`);
  }
  const advances = count ?? spec.defaultAdvances!;

  const table = await standings(round);
  const qualifying = table.slice(0, advances);
  const next = (round + 1) as QuizRound;

  const quals = await collections.roundQualifications();
  await quals.deleteMany({ round: next });
  if (qualifying.length > 0) {
    await quals.insertMany(
      qualifying.map((s, i) => ({
        round: next,
        teamId: new ObjectId(s.teamId),
        rank: i + 1,
        qualifiedAt: new Date(),
      }))
    );
  }
  return qualifying;
}

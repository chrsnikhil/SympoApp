import { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { getCached } from "@/lib/cache";
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
 * Cache round qualification sets for 3 seconds.
 */
export async function getCachedQualifications(round: QuizRound): Promise<Set<string>> {
  return getCached(`quals:${round}`, 3000, async () => {
    const quals = await collections.roundQualifications();
    const list = await quals.find({ round }).toArray();
    return new Set(list.map((q) => String(q.teamId)));
  });
}

/**
 * Round 1 is open to every registered team — there's no qualification doc for
 * it, and requiring one would mean a registration step that can silently fail
 * and lock a team out of the event they turned up for.
 */
export async function isQualified(teamId: ObjectId, round: QuizRound): Promise<boolean> {
  if (round === 1) return true;
  const set = await getCachedQualifications(round);
  return set.has(String(teamId));
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

/** All quiz challenge slugs up to and including the current round, for cumulative scoring. */
export async function slugsUpToRound(round: QuizRound): Promise<string[]> {
  const challenges = await collections.challenges();
  const list = await challenges.find({ type: "quiz", "config.round": { $lte: round } }).toArray();
  return list.map((c) => c.slug);
}

/**
 * Standings within a round, ranked by cumulative points from Round 1 up to current round then by tie-break.
 */
export async function standings(round: QuizRound): Promise<Standing[]> {
  return getCached(`standings:${round}`, 3000, () => computeStandings(round));
}

export async function computeStandings(round: QuizRound): Promise<Standing[]> {
  const [teamsCol, scores, subs] = await Promise.all([
    collections.teams(),
    collections.scoreEvents(),
    collections.submissions(),
  ]);

  const cumulativeSlugs = new Set(await slugsUpToRound(round));
  const teamDocs = await teamsCol.find({}).toArray();
  const teamById = new Map(teamDocs.map((t) => [String(t._id), t]));

  // Points come from the ledger, accumulating cumulatively across all rounds played so far.
  const ledger = await scores.find({ event: "quiz" }).toArray();
  const points = new Map<string, number>();
  for (const row of ledger) {
    const slug = row.reason.replace(/^quiz:/, "");
    if (cumulativeSlugs.has(slug)) {
      const key = String(row.teamId);
      points.set(key, (points.get(key) ?? 0) + row.points);
    }
  }

  const tiebreak = new Map<string, number>();
  const answered = new Map<string, number>();
  const correctAnswers = new Map<string, number>();
  const latestSubmission = new Map<string, number>();

  // Collect correct answers and latest submission timestamps
  const allDoneSubs = await subs.find({ type: "quiz", status: "done" }).toArray();
  for (const s of allDoneSubs) {
    const key = String(s.teamId);
    if (s.verdict?.correct) {
      correctAnswers.set(key, (correctAnswers.get(key) ?? 0) + 1);
    }
    const at = s.receivedAt.getTime();
    latestSubmission.set(key, Math.max(latestSubmission.get(key) ?? 0, at));
  }

  if (round === 1) {
    // Latest receivedAt among this team's round-1 submissions
    const challenges = await collections.challenges();
    const chDocs = await challenges.find({ type: "quiz", "config.round": 1 }).toArray();
    const chById = new Map(chDocs.map((c) => [String(c._id), c]));
    for (const s of allDoneSubs) {
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
      if (s.answeredAt) {
        answered.set(key, (answered.get(key) ?? 0) + 1);
        latestSubmission.set(key, Math.max(latestSubmission.get(key) ?? 0, s.answeredAt.getTime()));
      }
    }
  }

  // Who belongs in this round's table.
  //
  // A round's standings are the standings OF THAT ROUND'S FIELD — only the
  // teams qualified to play it. Round 3 used to admit every team that owned a
  // coin, scored on cumulative Round 1-3 points, which meant a team knocked
  // out in Round 1 could sit at rank #1 of a round it wasn't playing. That is
  // not a cosmetic problem: the Comeback Meter reads rank #1 off this table to
  // decide who is barred from earning bars, so the real Round 3 leader was
  // ranked #2 and collected powers, and the team the rule exists to exclude
  // was never even in the room.
  const playable = (t: (typeof teamDocs)[number]) => t.name !== "Quiz Control" && t.coin != null;
  const involved = new Set<string>();

  if (round === 1) {
    for (const t of teamDocs) if (playable(t)) involved.add(String(t._id));
  } else {
    const quals = await collections.roundQualifications();
    for (const q of await quals.find({ round }).toArray()) {
      const t = teamById.get(String(q.teamId));
      if (t && playable(t)) involved.add(String(q.teamId));
    }
  }

  // Once the coordinator ends the quiz the board stops being a round table and
  // becomes the whole-event recap, so everyone is shown. No question is served
  // after that, so this can't feed back into the meter.
  const isEnded = await isQuizEnded();
  if (isEnded) {
    for (const t of teamDocs) if (playable(t)) involved.add(String(t._id));
  }

  // Ranking Comparator (Official Specification):
  // 1. Highest total score
  // 2. Highest number of correct answers
  // 3. Lowest cumulative response time across all questions
  // 4. Earliest final submission time
  const ranked = [...involved].sort((a, b) => {
    // 1. Highest total score
    const pointsDiff = (points.get(b) ?? 0) - (points.get(a) ?? 0);
    if (pointsDiff !== 0) return pointsDiff;

    // 2. Highest number of correct answers
    const correctDiff = (correctAnswers.get(b) ?? 0) - (correctAnswers.get(a) ?? 0);
    if (correctDiff !== 0) return correctDiff;

    // 3. Lowest cumulative response time across all questions
    const aPlayed = tiebreak.has(a);
    const bPlayed = tiebreak.has(b);
    if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
    const timeDiff = (tiebreak.get(a) ?? 0) - (tiebreak.get(b) ?? 0);
    if (timeDiff !== 0) return timeDiff;

    // 4. Earliest final submission time
    return (latestSubmission.get(a) ?? Infinity) - (latestSubmission.get(b) ?? Infinity);
  });

  return ranked.map((teamId) => ({
    teamId,
    teamName: teamById.get(teamId)?.name ?? "Unknown",
    avatar: teamById.get(teamId)?.avatar ?? null,
    points: points.get(teamId) ?? 0,
    tiebreakSeconds: Math.round((tiebreak.get(teamId) ?? 0) * 10) / 10,
    answered: answered.get(teamId) ?? 0,
  }));
}

/** Cache quiz state document for 2 seconds. */
export async function getCachedQuizState() {
  return getCached("quiz-state", 2000, async () => {
    const state = await (await collections.quizState()).findOne({ _id: "quiz" });
    return state
      ? {
          started: Boolean(state.started),
          ended: Boolean(state.ended),
          startedAt: state.startedAt ? state.startedAt.toISOString() : null,
          round1StartedAt: state.round1StartedAt ? state.round1StartedAt.toISOString() : null,
          round2StartedAt: state.round2StartedAt ? state.round2StartedAt.toISOString() : null,
          round3StartedAt: state.round3StartedAt ? state.round3StartedAt.toISOString() : null,
        }
      : null;
  });
}

/** Cache all eliminated team IDs for 2 seconds. */
export async function getCachedEliminatedTeamIds(): Promise<Set<string>> {
  return getCached("eliminated-teams", 2000, async () => {
    const elims = await collections.roundEliminations();
    const list = await elims.find({}).toArray();
    return new Set(list.map((e) => String(e.teamId)));
  });
}

/** Get current active global round of the quiz event (1, 2, or 3). */
export async function getActiveQuizRound(): Promise<QuizRound> {
  return getCached("active-quiz-round", 2000, async () => {
    const quals = await collections.roundQualifications();
    const count3 = await quals.countDocuments({ round: 3 });
    if (count3 > 0) return 3;
    const count2 = await quals.countDocuments({ round: 2 });
    if (count2 > 0) return 2;
    return 1;
  });
}

/** Check if the coordinator has ended the quiz event. */
export async function isQuizEnded(): Promise<boolean> {
  const state = await getCachedQuizState();
  return Boolean(state?.ended);
}

/** Check if the coordinator has started the quiz event. */
export async function isQuizStarted(): Promise<boolean> {
  const state = await getCachedQuizState();
  return Boolean(state?.started);
}

/** Eliminate a specific team. Instantly redirects them to the solace screen. */
export async function eliminateTeam(teamIdStr: string): Promise<void> {
  const elims = await collections.roundEliminations();
  await elims.updateOne(
    { teamId: new ObjectId(teamIdStr) },
    { $set: { teamId: new ObjectId(teamIdStr), eliminatedAt: new Date() } },
    { upsert: true }
  );
}

/** Restore a previously eliminated team. */
export async function restoreTeam(teamIdStr: string): Promise<void> {
  const elims = await collections.roundEliminations();
  await elims.deleteOne({ teamId: new ObjectId(teamIdStr) });
}

/** Check if a team is currently eliminated. */
export async function isTeamEliminated(teamId: ObjectId): Promise<boolean> {
  const elimSet = await getCachedEliminatedTeamIds();
  if (elimSet.has(String(teamId))) return true;

  const activeRound = await getActiveQuizRound();
  if (activeRound > 1) {
    const qualified = await isQualified(teamId, activeRound);
    if (!qualified) return true;
  }
  return false;
}

/**
 * Make the cut into the next round. Qualifies remaining non-eliminated teams.
 */
export async function advanceFrom(round: QuizRound, count?: number): Promise<Standing[]> {
  const spec = ROUNDS[round];
  const table = await standings(round);
  const elims = await collections.roundEliminations();
  const elimDocs = await elims.find({}).toArray();
  const elimIds = new Set(elimDocs.map((e) => String(e.teamId)));

  const nonEliminated = table.filter((s) => !elimIds.has(s.teamId));
  const advances = count ?? (spec.defaultAdvances ? Math.min(nonEliminated.length, spec.defaultAdvances) : nonEliminated.length);
  const qualifying = nonEliminated.slice(0, advances);
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

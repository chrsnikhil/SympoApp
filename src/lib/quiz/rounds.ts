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
  const rawInvolved = new Set<string>([...points.keys(), ...tiebreak.keys()]);
  const involved = new Set<string>();
  for (const id of rawInvolved) {
    if (teamById.has(id) && teamById.get(id)?.name !== "Quiz Control") {
      involved.add(id);
    }
  }
  const isEnded = await isQuizEnded();
  if (round === 3 || isEnded) {
    for (const t of teamDocs) {
      if (t.name !== "Quiz Control") involved.add(String(t._id));
    }
  } else if (round > 1) {
    const quals = await collections.roundQualifications();
    for (const q of await quals.find({ round }).toArray()) {
      if (teamById.has(String(q.teamId))) involved.add(String(q.teamId));
    }
  } else {
    for (const t of teamDocs) {
      if (t.name !== "Quiz Control") involved.add(String(t._id));
    }
  }

  // Sorted on team IDs first, not the mapped rows — a team with NO tiebreak
  // entry (never submitted anything this round) must rank BELOW every team
  // that actually played, even at an equal 0 points. Defaulting its
  // tiebreakSeconds to 0 for *display* is fine (reads as "—" worth of
  // activity), but using that same 0 as the ascending sort key would rank a
  // team that did nothing ahead of one that genuinely finished at second 0 —
  // worse, ahead of everyone, since real timestamps are always > 0. This is
  // what let two stale, never-played teams outrank real competitors for a
  // cut slot.
  const ranked = [...involved].sort((a, b) => {
    const pointsDiff = (points.get(b) ?? 0) - (points.get(a) ?? 0);
    if (pointsDiff !== 0) return pointsDiff;
    const aPlayed = tiebreak.has(a);
    const bPlayed = tiebreak.has(b);
    if (aPlayed !== bPlayed) return aPlayed ? -1 : 1;
    return (tiebreak.get(a) ?? 0) - (tiebreak.get(b) ?? 0);
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

/** Get current active global round of the quiz event (1, 2, or 3). */
export async function getActiveQuizRound(): Promise<QuizRound> {
  const quals = await collections.roundQualifications();
  const count3 = await quals.countDocuments({ round: 3 });
  if (count3 > 0) return 3;
  const count2 = await quals.countDocuments({ round: 2 });
  if (count2 > 0) return 2;
  return 1;
}

/** Check if the coordinator has ended the quiz event. */
export async function isQuizEnded(): Promise<boolean> {
  const state = await (await collections.quizState()).findOne({ _id: "quiz" });
  return Boolean(state?.ended);
}

/** Check if the coordinator has started the quiz event. */
export async function isQuizStarted(): Promise<boolean> {
  const state = await (await collections.quizState()).findOne({ _id: "quiz" });
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
  const elims = await collections.roundEliminations();
  const found = await elims.findOne({ teamId });
  if (found) return true;

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

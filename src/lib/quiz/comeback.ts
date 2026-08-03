
import { randomInt } from "node:crypto";
import type { ObjectId } from "mongodb";
import { collections } from "@/lib/db/client";
import { standings } from "./rounds";
import type { Challenge, ComebackAbility, ComebackState, QuizRound, QuizServe } from "@/lib/db/types";

/**
 * Round 3's Comeback Meter — replaces the draft PDF's physical Spider Gadget
 * tokens with a purely server-computed mechanic, since Round 3 has no
 * scanning step: eligibility is earned by standing, not by holding a card.
 *
 * DOCUMENTED DEFAULTS (the rules doc names the mechanic but not its
 * parameters — confirm these with the coordinator before the day):
 *   - "bottom tier"   = bottom 25% of the live Round 3 standings (min 1 team)
 *   - "repeatedly"    = 3 consecutive questions finishing in that tier
 *   - the ability     = rolled at random from the same four effects the
 *                       original gadget system used (extra-time / fifty-fifty
 *                       / hint / skip)
 *   - usable for      = exactly the next question served after it's granted,
 *                       whether spent or not — then it expires
 */

const BOTTOM_TIER_FRACTION = 0.25;
const STREAK_THRESHOLD = 3;
const ABILITIES: readonly ComebackAbility[] = ["fifty-fifty", "double-points", "safety-net", "free-pass"];

export const ABILITY_INFO: Record<ComebackAbility, { label: string; icon: string; description: string }> = {
  "fifty-fifty": { label: "Spider-Sense", icon: "", description: "Removes two wrong options from the current question." },
  "double-points": { label: "Symbiote Surge", icon: "", description: "Doubles the points earned if you answer correctly." },
  "safety-net": { label: "Iron Spider Armor", icon: "", description: "Awards 50% of the points even if you answer incorrectly." },
  "free-pass": { label: "Web-Slinger's Pass", icon: "", description: "Automatically answers the question correctly for full points." },
};

async function getOrInit(teamId: ObjectId, round: QuizRound): Promise<ComebackState> {
  const states = await collections.comebackStates();
  const existing = await states.findOne({ teamId, round });
  if (existing) return existing;
  const fresh: ComebackState = {
    teamId,
    round,
    bottomStreak: 0,
    ability: null,
    grantedAt: null,
    usableOnSlug: null,
    usedAt: null,
    usedOnSlug: null,
  };
  try {
    await states.insertOne(fresh);
    return fresh;
  } catch {
    const won = await states.findOne({ teamId, round });
    if (won) return won;
    throw new Error("Could not initialise comeback state");
  }
}

export async function getComebackStatus(teamId: ObjectId, round: QuizRound) {
  const s = await getOrInit(teamId, round);
  return {
    bottomStreak: s.ability && !s.usedAt ? STREAK_THRESHOLD : s.bottomStreak,
    ability: s.ability,
    info: s.ability ? ABILITY_INFO[s.ability] : null,
    usableOnSlug: s.usableOnSlug,
    used: s.usedAt !== null,
  };
}

/**
 * Call once a question CLOSES for a team (right after `markAnswered`, for
 * both an answer and a skip). Expires an ability whose one-question window
 * just passed, then re-evaluates the bottom-tier streak from live standings
 * and grants a fresh ability if the threshold was just crossed.
 */
export async function closeQuestionForComeback(teamId: ObjectId, round: QuizRound, slug: string): Promise<void> {
  const serves = await collections.quizServes();
  const serve = await serves.findOne({ teamId, challengeSlug: slug });
  if (serve?.streakProcessed) return;
  if (serve) await serves.updateOne({ _id: serve._id }, { $set: { streakProcessed: true } });

  const states = await collections.comebackStates();
  const state = await getOrInit(teamId, round);

  // The one-question window for a previously granted ability has now closed,
  // used or not (even if they skipped a question and this is a later one).
  if (state.usableOnSlug !== null) {
    await states.updateOne({ teamId, round }, { $set: { ability: null, usableOnSlug: null, grantedAt: null, bottomStreak: 0 } });
  }

  const table = await standings(round);
  if (table.length === 0) return;
  const rank = table.findIndex((r) => r.teamId === teamId.toString());
  if (rank === -1) return;

  const bottomTierSize = Math.max(1, Math.ceil(table.length * BOTTOM_TIER_FRACTION));
  // TEST MODE: Anyone gets comeback meter
  const inBottomTier = true;

  const fresh = await states.findOne({ teamId, round });
  const currentStreak = fresh?.bottomStreak ?? 0;
  const newStreak = inBottomTier ? Math.min(STREAK_THRESHOLD, currentStreak + 1) : 0;

  if (newStreak >= STREAK_THRESHOLD && !fresh?.ability) {
    const ability = ABILITIES[randomInt(ABILITIES.length)];
    await states.updateOne(
      { teamId, round },
      { $set: { bottomStreak: STREAK_THRESHOLD, ability, grantedAt: new Date(), usableOnSlug: null, usedAt: null, usedOnSlug: null } }
    );
  } else {
    await states.updateOne({ teamId, round }, { $set: { bottomStreak: newStreak } });
  }
}

/**
 * Call right after serving a question in Round 3. If the team is holding a
 * granted-but-unattached ability, this is the "very next question" it locks
 * onto. A no-op once already attached, so it's safe to call on every serve.
 */
export async function attachPendingAbility(teamId: ObjectId, round: QuizRound, slug: string): Promise<void> {
  const states = await collections.comebackStates();
  await states.updateOne(
    { teamId, round, ability: { $ne: null }, usableOnSlug: null, usedAt: null },
    { $set: { usableOnSlug: slug } }
  );
}

/**
 * Clears any ability that was attached to a previous question but never used
 * (e.g. if the team let the clock run out instead of submitting).
 */
export async function expireOldComebackAbilities(teamId: ObjectId, round: QuizRound, currentSlug: string): Promise<void> {
  const states = await collections.comebackStates();
  await states.updateOne(
    { teamId, round, usableOnSlug: { $ne: null, $ne: currentSlug } },
    { $set: { ability: null, usableOnSlug: null, grantedAt: null, bottomStreak: 0 } }
  );
}

export type ComebackEffect =
  | { ability: "fifty-fifty"; eliminated: number[] }
  | { ability: "double-points" }
  | { ability: "safety-net" }
  | { ability: "free-pass" };

export type SpendResult =
  | { ok: true; effect: ComebackEffect }
  | { ok: false; reason: "no-ability" | "wrong-question" | "already-used" | "not-served" | "expired" | "unusable" };

/** Spend a team's comeback ability on the Round 3 question it's attached to. */
export async function spendComeback(teamId: ObjectId, round: QuizRound, challengeSlug: string, challenge: Challenge): Promise<SpendResult> {
  const states = await collections.comebackStates();
  const state = await getOrInit(teamId, round);

  if (!state.ability) return { ok: false, reason: "no-ability" };
  if (state.usedAt) return { ok: false, reason: "already-used" };
  if (state.usableOnSlug !== challengeSlug) return { ok: false, reason: "wrong-question" };

  const serves = await collections.quizServes();
  const serve = await serves.findOne({ teamId, challengeSlug });
  if (!serve) return { ok: false, reason: "not-served" };
  if (serve.answeredAt || serve.skipped) return { ok: false, reason: "expired" };

  const effect = await applyEffect(state.ability, serve, challenge);
  if (!effect) return { ok: false, reason: "unusable" };

  await states.updateOne({ teamId, round }, { $set: { usedAt: new Date(), usedOnSlug: challengeSlug } });
  return { ok: true, effect };
}

async function applyEffect(ability: ComebackAbility, serve: QuizServe, challenge: Challenge): Promise<ComebackEffect | null> {
  const serves = await collections.quizServes();
  const filter = { teamId: serve.teamId, challengeSlug: serve.challengeSlug };

  switch (ability) {
    case "fifty-fifty": {
      const options = challenge.config.options ?? [];
      const correct = challenge.config.correctIndex;
      if (options.length < 4 || correct === undefined) return null;

      const wrong = options.map((_, i) => i).filter((i) => i !== correct);
      const eliminated: number[] = [];
      const pool = [...wrong];
      while (eliminated.length < 2 && pool.length > 0) {
        eliminated.push(...pool.splice(randomInt(pool.length), 1));
      }
      await serves.updateOne(filter, { $set: { eliminated }, $push: { abilitiesUsed: ability } });
      return { ability, eliminated };
    }
    case "double-points": {
      await serves.updateOne(filter, { $push: { abilitiesUsed: ability } });
      return { ability };
    }
    case "safety-net": {
      await serves.updateOne(filter, { $push: { abilitiesUsed: ability } });
      return { ability };
    }
    case "free-pass": {
      await serves.updateOne(filter, { $push: { abilitiesUsed: ability } });
      return { ability };
    }
  }
}

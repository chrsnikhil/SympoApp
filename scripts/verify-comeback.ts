/**
 * End-to-end verification of the Round 3 Comeback Meter against a real
 * (in-memory) MongoDB. Drives `lib/quiz/comeback.ts` directly — no HTTP, no
 * browser — so the mechanics can be checked before an event without needing
 * teams on stage.
 *
 *   npx tsx scripts/verify-comeback.ts
 */
process.env.JWT_SECRET ??= "verify-only-secret";

import { MongoMemoryServer } from "mongodb-memory-server";
import type { ComebackAbility } from "../src/lib/db/types";
import { ObjectId } from "mongodb";

const passed: string[] = [];
const failed: string[] = [];

function check(name: string, ok: boolean, detail = "") {
  if (ok) passed.push(name);
  else failed.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const mongod = await MongoMemoryServer.create({ instance: { dbName: "comeback-verify" } });
  process.env.MONGODB_URI = mongod.getUri();

  const { collections } = await import("../src/lib/db/client");
  const { invalidateCache } = await import("../src/lib/cache");
  const { standings } = await import("../src/lib/quiz/rounds");
  const {
    MAX_BARS,
    activateForServe,
    awardFreePass,
    getComebackView,
    settleQuestion,
    sweepClosedQuestions,
  } = await import("../src/lib/quiz/comeback");

  // ── Fixture ───────────────────────────────────────────────────────────────
  const teamsCol = await collections.teams();
  const challengesCol = await collections.challenges();
  const qualsCol = await collections.roundQualifications();
  const servesCol = await collections.quizServes();
  const scoresCol = await collections.scoreEvents();
  const subsCol = await collections.submissions();
  const statesCol = await collections.comebackStates();

  await (await collections.quizState()).insertOne({ _id: "quiz", ended: false, endedAt: null, started: true });

  const teamIds: Record<string, ObjectId> = {};
  for (const [i, name] of ["Leader", "Second", "Third", "Last", "Dropped"].entries()) {
    const id = new ObjectId();
    teamIds[name] = id;
    await teamsCol.insertOne({ _id: id, name, coin: i + 1, createdAt: new Date() });
  }

  // Everyone but "Dropped" is in the Round 3 field.
  for (const name of ["Leader", "Second", "Third", "Last"]) {
    await qualsCol.insertOne({ round: 3, teamId: teamIds[name], rank: 1, qualifiedAt: new Date() });
  }

  const slugs = ["r3-seed", ...Array.from({ length: 20 }, (_, i) => `r3-q${i + 1}`)];
  for (const [i, slug] of slugs.entries()) {
    await challengesCol.insertOne({
      type: "quiz",
      slug,
      title: `Question ${i}`,
      points: 10,
      opensAt: null,
      closesAt: null,
      config: {
        round: 3,
        format: "mcq",
        order: i,
        options: ["A", "B", "C", "D"],
        correctIndex: 1,
      },
    });
  }

  const award = async (team: string, slug: string, points: number) => {
    await scoresCol.insertOne({
      teamId: teamIds[team],
      event: "quiz",
      points,
      reason: `quiz:${slug}`,
      at: new Date(),
    });
    invalidateCache();
  };

  // Fixed pecking order: Leader #1, Second #2, Third #3, Last #4.
  await award("Leader", "r3-seed", 1000);
  await award("Second", "r3-seed", 100);
  await award("Third", "r3-seed", 50);
  // "Dropped" has more points than anyone but did NOT qualify for Round 3.
  await award("Dropped", "r3-seed", 5000);

  const serve = async (team: string, slug: string, open = false) => {
    const servedAt = new Date(Date.now() - (open ? 0 : 60_000));
    await servesCol.insertOne({
      teamId: teamIds[team],
      challengeSlug: slug,
      round: 3,
      servedAt,
      readUntil: new Date(servedAt.getTime() + 6_000),
      answerableUntil: new Date(servedAt.getTime() + (open ? 600_000 : 16_000)),
      answeredAt: null,
      abilitiesUsed: [],
    });
  };

  const answer = async (team: string, slug: string, correct: boolean) => {
    const challenge = await challengesCol.findOne({ slug });
    const at = new Date();
    const ins = await subsCol.insertOne({
      type: "quiz",
      challengeId: challenge!._id!,
      teamId: teamIds[team],
      participantId: teamIds[team],
      receivedAt: at,
      status: "done",
      verdict: { correct, points: correct ? 10 : 0 },
    });
    if (correct) await award(team, slug, 10);
    return ins.insertedId;
  };

  const bars = async (team: string) => (await getComebackView(teamIds[team], 3)).bars;
  const state = async (team: string) => statesCol.findOne({ teamId: teamIds[team], round: 3 });

  // ── 1. Round 3 standings hold only the Round 3 field ─────────────────────
  invalidateCache();
  const table = await standings(3);
  check("R3 standings exclude non-qualified teams", !table.some((r) => r.teamId === String(teamIds.Dropped)),
    `got ${table.map((r) => r.teamName).join(",")}`);
  check("R3 rank #1 is the actual round leader", table[0]?.teamName === "Leader", `got ${table[0]?.teamName}`);

  // ── 2. Rank #1 never fills a bar ─────────────────────────────────────────
  await serve("Leader", "r3-q1");
  await settleQuestion(teamIds.Leader, 3, "r3-q1");
  check("Rank #1 gets no bars on a miss", (await bars("Leader")) === 0, `bars=${await bars("Leader")}`);

  // ── 3. A correct answer never fills a bar ────────────────────────────────
  await serve("Third", "r3-q1");
  await answer("Third", "r3-q1", true);
  await settleQuestion(teamIds.Third, 3, "r3-q1", "correct");
  check("Correct answer fills no bar", (await bars("Third")) === 0, `bars=${await bars("Third")}`);

  // ── 4. Three misses → exactly one power, meter emptied, NOT yet active ───
  for (const [i, slug] of ["r3-q1", "r3-q2", "r3-q3"].entries()) {
    await serve("Last", slug);
    await settleQuestion(teamIds.Last, 3, slug); // no submission at all = timeout
    if (i < 2) check(`Miss ${i + 1} fills bar ${i + 1}`, (await bars("Last")) === i + 1, `bars=${await bars("Last")}`);
  }
  let v = await getComebackView(teamIds.Last, 3);
  check("3 misses generate a power", v.stored !== null, JSON.stringify(v.stored));
  check("Meter resets to 0 on grant", v.bars === 0, `bars=${v.bars}`);
  check("Power is stored, NOT active on the earning question", v.active === null);

  // ── 5. Settling the same question twice changes nothing ──────────────────
  const beforeRepeat = JSON.stringify(await state("Last"));
  await settleQuestion(teamIds.Last, 3, "r3-q3");
  check("Re-settling a question is a no-op", JSON.stringify(await state("Last")) === beforeRepeat);

  // ── 6. The stored power fires on the NEXT question, exactly once ─────────
  const granted = (await state("Last"))!.ability!;
  await statesCol.updateOne({ teamId: teamIds.Last, round: 3 }, { $set: { ability: "fifty-fifty" } });
  await serve("Last", "r3-q4", true);
  const q4 = (await challengesCol.findOne({ slug: "r3-q4" }))!;

  const races = await Promise.all(
    Array.from({ length: 5 }, () => activateForServe(teamIds.Last, 3, "r3-q4", q4))
  );
  const firedOnce = races.filter((r) => r.justActivated).length;
  check("Concurrent activations fire the power exactly once", firedOnce === 1, `justActivated×${firedOnce}`);
  check("Every concurrent caller still sees the active power", races.every((r) => r.power?.id === "fifty-fifty"));

  const q4serve = await servesCol.findOne({ teamId: teamIds.Last, challengeSlug: "r3-q4" });
  check("Ability recorded once on the serve", (q4serve?.abilitiesUsed ?? []).length === 1,
    JSON.stringify(q4serve?.abilitiesUsed));
  check("Spider-Sense removes exactly two options", (q4serve?.eliminated ?? []).length === 2,
    JSON.stringify(q4serve?.eliminated));
  check("Spider-Sense never removes the correct option", !(q4serve?.eliminated ?? []).includes(1),
    JSON.stringify(q4serve?.eliminated));

  v = await getComebackView(teamIds.Last, 3);
  check("Power shows as ACTIVE while its question is live", v.active?.id === "fifty-fifty");
  check("Power no longer shows as stored once firing", v.stored === null);
  check("Active power is pinned to its question", v.activeOnSlug === "r3-q4");

  // ── 7. The power dies with its question, and the meter starts filling again
  await settleQuestion(teamIds.Last, 3, "r3-q4", "failed");
  v = await getComebackView(teamIds.Last, 3);
  check("Power is deleted after its question settles", v.active === null && v.stored === null);
  check("Meter refills after a power is spent", v.bars === 1, `bars=${v.bars}`);

  // ── 8. Concurrent settles of one question fill exactly one bar ───────────
  await serve("Last", "r3-q5");
  await Promise.all(Array.from({ length: 5 }, () => settleQuestion(teamIds.Last, 3, "r3-q5", "failed")));
  check("Concurrent settles fill exactly one bar", (await bars("Last")) === 2, `bars=${await bars("Last")}`);

  // ── 9. Web-Slinger's Pass actually scores ────────────────────────────────
  await statesCol.updateOne(
    { teamId: teamIds.Second, round: 3 },
    { $set: { teamId: teamIds.Second, round: 3, bottomStreak: 0, ability: "free-pass", grantedAt: new Date(), usableOnSlug: null, usedAt: null, usedOnSlug: null } },
    { upsert: true }
  );
  await serve("Second", "r3-q6", true);
  const q6 = (await challengesCol.findOne({ slug: "r3-q6" }))!;
  const act = await activateForServe(teamIds.Second, 3, "r3-q6", q6);
  check("Free pass reports autoAnswered to the UI", act.power?.autoAnswered === true);
  if (act.justActivated && act.power?.id === "free-pass") {
    await awardFreePass(teamIds.Second, teamIds.Second, q6);
  }
  invalidateCache();
  const fpLedger = await scoresCol.findOne({ teamId: teamIds.Second, reason: "quiz:r3-q6" });
  const fpSub = await subsCol.findOne({ teamId: teamIds.Second, challengeId: q6._id });
  const fpServe = await servesCol.findOne({ teamId: teamIds.Second, challengeSlug: "r3-q6" });
  check("Free pass writes a ledger row", fpLedger?.points === 10, `points=${fpLedger?.points}`);
  check("Free pass writes a correct verdict", fpSub?.verdict?.correct === true);
  check("Free pass closes the serve", fpServe?.answeredAt != null);

  await awardFreePass(teamIds.Second, teamIds.Second, q6);
  check("Free pass cannot double-award",
    (await scoresCol.countDocuments({ teamId: teamIds.Second, reason: "quiz:r3-q6" })) === 1);

  // A free-passed question counts as CORRECT, so it must not fill a bar.
  await settleQuestion(teamIds.Second, 3, "r3-q6");
  check("Free-passed question fills no bar", (await bars("Second")) === 0, `bars=${await bars("Second")}`);

  // ── 10. Timeout sweep settles abandoned questions ────────────────────────
  await serve("Third", "r3-q7");
  await serve("Third", "r3-q8");
  await sweepClosedQuestions(teamIds.Third, 3);
  check("Sweep settles every closed question", (await bars("Third")) === 2, `bars=${await bars("Third")}`);
  await sweepClosedQuestions(teamIds.Third, 3);
  check("Re-sweeping is a no-op", (await bars("Third")) === 2, `bars=${await bars("Third")}`);

  // ── 11. FREEZE: climbing to rank #1 suspends, never clears ──────────────
  // "Third" is mid-meter with a banked power, then overtakes everyone.
  await statesCol.updateOne(
    { teamId: teamIds.Third, round: 3 },
    { $set: { bottomStreak: 2, ability: "double-points", grantedAt: new Date(), usableOnSlug: null, usedAt: null, usedOnSlug: null } }
  );
  const beforeFreeze = await state("Third");
  await award("Third", "r3-seed", 5000); // now clear of Leader's 1000
  invalidateCache();

  let t = await standings(3);
  check("Overtaking team is now rank #1", t[0]?.teamName === "Third", `top=${t[0]?.teamName}`);

  await serve("Third", "r3-q9");
  await settleQuestion(teamIds.Third, 3, "r3-q9", "failed");

  const frozenView = await getComebackView(teamIds.Third, 3);
  check("Rank #1 gains no new bars", frozenView.bars === 2, `bars=${frozenView.bars}`);
  check("Rank #1 meter is frozen, not cleared", frozenView.frozen === true);
  check("Rank #1 meter is hidden from the UI", frozenView.eligible === false);
  check("Rank #1 keeps its banked power in storage",
    (await state("Third"))?.ability === "double-points", String((await state("Third"))?.ability));

  // A frozen power must not fire on a question served while leading.
  await serve("Third", "r3-q10", true);
  const q10 = (await challengesCol.findOne({ slug: "r3-q10" }))!;
  const frozenActivation = await activateForServe(teamIds.Third, 3, "r3-q10", q10);
  check("Frozen power does not activate at rank #1", frozenActivation.power === null,
    JSON.stringify(frozenActivation.power));
  check("Frozen power is still banked after a served question",
    (await state("Third"))?.usableOnSlug === null && (await state("Third"))?.ability === "double-points");

  // Three more misses while leading must not push the meter or grant anything.
  for (const slug of ["r3-q11", "r3-q12", "r3-q13"]) {
    await serve("Third", slug);
    await settleQuestion(teamIds.Third, 3, slug, "failed");
  }
  check("Rank #1 cannot unlock a second power after repeated misses",
    (await getComebackView(teamIds.Third, 3)).bars === 2, `bars=${(await getComebackView(teamIds.Third, 3)).bars}`);

  // ── 12. RESTORE: dropping below #1 hands everything back untouched ──────
  await award("Leader", "r3-seed", 20000); // Leader retakes the lead
  invalidateCache();
  t = await standings(3);
  check("Leader retakes rank #1", t[0]?.teamName === "Leader", `top=${t[0]?.teamName}`);

  await serve("Third", "r3-q14");
  await settleQuestion(teamIds.Third, 3, "r3-q14", "correct"); // correct: no new bar
  const restored = await getComebackView(teamIds.Third, 3);
  const afterRestore = await state("Third");

  check("Dropping below #1 restores the exact bar count",
    restored.bars === beforeFreeze!.bottomStreak, `before=${beforeFreeze!.bottomStreak} after=${restored.bars}`);
  check("Dropping below #1 restores the exact stored power",
    afterRestore?.ability === beforeFreeze!.ability, `before=${beforeFreeze!.ability} after=${afterRestore?.ability}`);
  check("Restored meter is visible again", restored.eligible === true && restored.frozen === false);
  check("Restored power is offered as stored", restored.stored?.id === "double-points", JSON.stringify(restored.stored));

  // And it fires on the very next question, as a banked power should.
  await serve("Third", "r3-q15", true);
  const q15 = (await challengesCol.findOne({ slug: "r3-q15" }))!;
  const thawed = await activateForServe(teamIds.Third, 3, "r3-q15", q15);
  check("Restored power activates on the next question", thawed.power?.id === "double-points" && thawed.justActivated);

  // ── 13. Freeze/restore survives a refresh (it only lives in the DB) ─────
  const reread = await getComebackView(teamIds.Third, 3);
  check("Restored state persists across reads", reread.bars === 2 && reread.active?.id === "double-points",
    JSON.stringify({ bars: reread.bars, active: reread.active?.id }));

  const persisted = await getComebackView(teamIds.Last, 3);
  check("Meter persists across reads", persisted.bars === 2, `bars=${persisted.bars}`);
  check("Max bars is 3", MAX_BARS === 3);

  // ── 14. The four power effects, at the scoring boundary ────────────────
  const { scoreMcq } = await import("../src/lib/quiz/scoring");
  const q = (await challengesCol.findOne({ slug: "r3-q1" }))!; // correctIndex 1, 10 points
  const baseServe = {
    teamId: teamIds.Last,
    challengeSlug: "r3-q1",
    round: 3 as const,
    servedAt: new Date(Date.now() - 10_000),
    readUntil: new Date(Date.now() - 5_000),
    answerableUntil: new Date(Date.now() + 60_000),
    answeredAt: null,
    abilitiesUsed: [] as ComebackAbility[],
  };
  const now = new Date();

  const plainRight = scoreMcq(q, "1", { ...baseServe }, now);
  check("Baseline: correct answer scores full points", plainRight.correct && plainRight.points === 10,
    JSON.stringify(plainRight));
  const plainWrong = scoreMcq(q, "0", { ...baseServe }, now);
  check("Baseline: wrong answer scores nothing", !plainWrong.correct && plainWrong.points === 0,
    JSON.stringify(plainWrong));

  const surge = scoreMcq(q, "1", { ...baseServe, abilitiesUsed: ["double-points"] }, now);
  check("Symbiote Surge doubles points on a correct answer", surge.correct && surge.points === 20,
    JSON.stringify(surge));
  const surgeWrong = scoreMcq(q, "0", { ...baseServe, abilitiesUsed: ["double-points"] }, now);
  check("Symbiote Surge does not rescue a wrong answer", !surgeWrong.correct && surgeWrong.points === 0,
    JSON.stringify(surgeWrong));

  const armor = scoreMcq(q, "0", { ...baseServe, abilitiesUsed: ["safety-net"] }, now);
  check("Iron Spider Armor awards exactly 50% on a wrong answer", armor.points === 5, JSON.stringify(armor));
  const armorRight = scoreMcq(q, "1", { ...baseServe, abilitiesUsed: ["safety-net"] }, now);
  check("Iron Spider Armor leaves a correct answer at full points", armorRight.points === 10,
    JSON.stringify(armorRight));

  const pass = scoreMcq(q, "0", { ...baseServe, abilitiesUsed: ["free-pass"] }, now);
  check("Web-Slinger's Pass turns a wrong answer into full marks", pass.correct && pass.points === 10,
    JSON.stringify(pass));

  // Spider-Sense: the eliminations must be wrong options only, never the answer.
  await statesCol.updateOne(
    { teamId: teamIds.Last, round: 3 },
    { $set: { ability: "fifty-fifty", usableOnSlug: null, usedAt: null, usedOnSlug: null } }
  );
  await serve("Last", "r3-q16", true);
  const q16 = (await challengesCol.findOne({ slug: "r3-q16" }))!;
  const sense = await activateForServe(teamIds.Last, 3, "r3-q16", q16);
  const elim = sense.power?.eliminated ?? [];
  check("Spider-Sense eliminates exactly two options", elim.length === 2, JSON.stringify(elim));
  check("Spider-Sense never eliminates the correct option", !elim.includes(q16.config.correctIndex!),
    `correct=${q16.config.correctIndex} eliminated=${JSON.stringify(elim)}`);
  check("Spider-Sense leaves the answer reachable", new Set(elim).size === 2 && elim.every((i) => i >= 0 && i < 4),
    JSON.stringify(elim));

  // ── 15. Stress: many teams acting at once ──────────────────────────────
  const crowd: ObjectId[] = [];
  for (let i = 0; i < 12; i++) {
    const id = new ObjectId();
    crowd.push(id);
    await teamsCol.insertOne({ _id: id, name: `Crowd ${i}`, coin: 100 + i, createdAt: new Date() });
    await qualsCol.insertOne({ round: 3, teamId: id, rank: i, qualifiedAt: new Date() });
  }
  invalidateCache();

  // Every one of them misses the same three questions simultaneously.
  for (const slug of ["r3-q17", "r3-q18", "r3-q19"]) {
    await Promise.all(
      crowd.map(async (id) => {
        const servedAt = new Date(Date.now() - 60_000);
        await servesCol.insertOne({
          teamId: id, challengeSlug: slug, round: 3, servedAt,
          readUntil: new Date(servedAt.getTime() + 6_000),
          answerableUntil: new Date(servedAt.getTime() + 16_000),
          answeredAt: null, abilitiesUsed: [],
        });
      })
    );
    await Promise.all(crowd.map((id) => settleQuestion(id, 3, slug, "failed")));
  }

  const crowdViews = await Promise.all(crowd.map((id) => getComebackView(id, 3)));
  check("12 teams unlocking simultaneously each get exactly one power",
    crowdViews.every((v) => v.stored !== null), `stored=${crowdViews.filter((v) => v.stored).length}/12`);
  check("Every simultaneous unlock reset its own meter to 0",
    crowdViews.every((v) => v.bars === 0), JSON.stringify(crowdViews.map((v) => v.bars)));

  const crowdStates = await statesCol.find({ teamId: { $in: crowd }, round: 3 }).toArray();
  check("Simultaneous unlocks produce exactly one state doc per team", crowdStates.length === 12,
    `docs=${crowdStates.length}`);
  const abilitySpread = new Set(crowdStates.map((c) => c.ability));
  check("Random powers are actually varied across teams", abilitySpread.size >= 2,
    `distinct=${[...abilitySpread].join(",")}`);

  // Hammer one question with concurrent settles AND activations at once.
  const hammer = crowd[0];
  await servesCol.insertOne({
    teamId: hammer, challengeSlug: "r3-q20", round: 3, servedAt: new Date(),
    readUntil: new Date(Date.now() + 6_000), answerableUntil: new Date(Date.now() + 600_000),
    answeredAt: null, abilitiesUsed: [],
  });
  const q20 = (await challengesCol.findOne({ slug: "r3-q20" }))!;
  const stormed = await Promise.all([
    ...Array.from({ length: 6 }, () => activateForServe(hammer, 3, "r3-q20", q20)),
    ...Array.from({ length: 6 }, () => settleQuestion(hammer, 3, "r3-q20", "failed")),
  ]);
  const activations = stormed.filter((r) => r && typeof r === "object" && "justActivated" in r && r.justActivated);
  check("Concurrent activate+settle storm activates at most once", activations.length <= 1,
    `activations=${activations.length}`);
  const hammerServe = await servesCol.findOne({ teamId: hammer, challengeSlug: "r3-q20" });
  check("Concurrent storm records at most one ability on the serve",
    (hammerServe?.abilitiesUsed ?? []).length <= 1, JSON.stringify(hammerServe?.abilitiesUsed));

  // Rapid rank churn: flip a team in and out of the lead repeatedly.
  const churner = crowd[1];
  const churnBefore = await statesCol.findOne({ teamId: churner, round: 3 });
  for (let i = 0; i < 4; i++) {
    await scoresCol.insertOne({ teamId: churner, event: "quiz", points: 100000, reason: "quiz:r3-seed", at: new Date() });
    invalidateCache();
    const slugUp = `r3-churn-up-${i}`;
    await challengesCol.updateOne({ slug: slugUp }, { $set: { type: "quiz", slug: slugUp, title: "c", points: 10, opensAt: null, closesAt: null, config: { round: 3, format: "mcq", order: 90 + i, options: ["A", "B", "C", "D"], correctIndex: 1 } } }, { upsert: true });
    await servesCol.insertOne({
      teamId: churner, challengeSlug: slugUp, round: 3, servedAt: new Date(Date.now() - 60_000),
      readUntil: new Date(Date.now() - 54_000), answerableUntil: new Date(Date.now() - 44_000),
      answeredAt: null, abilitiesUsed: [],
    });
    await settleQuestion(churner, 3, slugUp, "failed");

    await scoresCol.insertOne({ teamId: churner, event: "quiz", points: -100000, reason: "quiz:r3-seed", at: new Date() });
    invalidateCache();
  }
  const churnAfter = await statesCol.findOne({ teamId: churner, round: 3 });
  check("Rapid rank churn never loses the banked power",
    churnAfter?.ability === churnBefore?.ability, `before=${churnBefore?.ability} after=${churnAfter?.ability}`);
  check("Rapid rank churn never inflates the meter past the cap",
    (churnAfter?.bottomStreak ?? 0) <= MAX_BARS, `bars=${churnAfter?.bottomStreak}`);

  // ── Report ───────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(64)}`);
  for (const p of passed) console.log(`  PASS  ${p}`);
  for (const f of failed) console.log(`  FAIL  ${f}`);
  console.log(`${"─".repeat(64)}`);
  console.log(`  ${passed.length} passed, ${failed.length} failed  (granted power in scenario 4 was "${granted}")\n`);

  await mongod.stop();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

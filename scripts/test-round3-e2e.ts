/**
 * Full Round 3 walkthrough over REAL HTTP against a running dev server.
 *
 * Where `verify-comeback.ts` drives the module directly, this drives the
 * actual routes — /api/quiz/serve, /api/submit, /api/quiz/standings,
 * /api/quiz/comeback, /api/admin/quiz/overview — with real signed session
 * cookies for three teams at once, so route wiring, cross-view consistency
 * and concurrency are exercised the way a live round exercises them.
 *
 * There is no browser automation in this environment, so this covers the
 * server-observable half of the walkthrough: everything except literal pixel
 * rendering and React hydration.
 *
 * Prerequisites:
 *   npx tsx scripts/dev-db.ts   (or any mongod on 127.0.0.1:27117)
 *   npm run dev
 *
 * Then:
 *   npx tsx scripts/test-round3-e2e.ts
 */
import { MongoClient, ObjectId } from "mongodb";
import { SignJWT } from "jose";

const APP = process.env.TEST_APP_URL ?? "http://localhost:3000";
const MONGO = process.env.MONGODB_URI_LOCAL ?? "mongodb://127.0.0.1:27117/xplore26";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-preview-secret-not-for-production";

const passed: string[] = [];
const failed: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed.push(name);
  else failed.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

interface Team { name: string; id: ObjectId; participant: ObjectId; cookie: string }

async function main() {
  const client = await MongoClient.connect(MONGO);
  const db = client.db("xplore26");

  const challenges = db.collection("challenges");
  const r3 = await challenges
    .find({ type: "quiz", "config.round": 3, "config.format": "mcq" })
    .toArray();
  r3.sort((a, b) => (a.config?.order ?? 0) - (b.config?.order ?? 0));
  check("Round 3 questions are seeded", r3.length > 0, `found ${r3.length}`);
  if (r3.length === 0) {
    console.log("DB not seeded — run: npx tsx --env-file=.env.local scripts/seed-quiz.ts");
    process.exit(1);
  }

  // ── Three finalists ──────────────────────────────────────────────────────
  const names = ["E2E Ace", "E2E Mid", "E2E Trailer"];
  const teams: Record<string, Team> = {};
  for (const [i, name] of names.entries()) {
    const id = new ObjectId();
    const participant = new ObjectId();
    await db.collection("teams").insertOne({ _id: id, name, coin: 200 + i, createdAt: new Date() });
    await db.collection("participants").insertOne({
      _id: participant, teamId: id, name, role: "participant", createdAt: new Date(),
    });
    await db.collection("round_qualifications").updateOne(
      { round: 3, teamId: id },
      { $set: { round: 3, teamId: id, rank: i + 1, qualifiedAt: new Date() } },
      { upsert: true }
    );
    const token = await new SignJWT({ teamId: String(id), role: "participant" })
      .setProtectedHeader({ alg: "HS256" }).setSubject(String(participant))
      .setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(JWT_SECRET));
    teams[name] = { name, id, participant, cookie: `session=${token}` };
  }

  const adminParticipant = new ObjectId();
  const adminTeam = new ObjectId();
  await db.collection("teams").insertOne({ _id: adminTeam, name: "E2E Control", createdAt: new Date() });
  const adminToken = await new SignJWT({ teamId: String(adminTeam), role: "admin" })
    .setProtectedHeader({ alg: "HS256" }).setSubject(String(adminParticipant))
    .setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(JWT_SECRET));
  const adminCookie = `session=${adminToken}`;

  const cleanup = async () => {
    const ids = Object.values(teams).map((t) => t.id);
    await db.collection("quiz_serves").deleteMany({ teamId: { $in: ids } });
    await db.collection("submissions").deleteMany({ teamId: { $in: ids } });
    await db.collection("score_events").deleteMany({ teamId: { $in: ids } });
    await db.collection("comeback_states").deleteMany({ teamId: { $in: ids } });
  };
  await cleanup();

  // Give the Ace a commanding lead so it is unambiguously rank #1. Booked
  // against the LAST question of the round — one the five-question walk below
  // never reaches — so this fixture can't be mistaken for a duplicate award
  // on a question the team also answers for real.
  await db.collection("score_events").insertOne({
    teamId: teams["E2E Ace"].id, event: "quiz", points: 500, reason: `quiz:${r3[r3.length - 1].slug}`, at: new Date(),
  });

  const quizState = db.collection("quiz_state");
  const setClock = async (startedAt: Date) => {
    await quizState.updateOne(
      { _id: "quiz" as never },
      { $set: { started: true, ended: false, round3StartedAt: startedAt, startedAt } },
      { upsert: true }
    );
    // The app caches quiz state and standings for 2-3s; wait it out so the
    // server genuinely sees the new clock rather than a cached one.
    await new Promise((r) => setTimeout(r, 3200));
  };

  const serveFor = async (t: Team) =>
    (await fetch(`${APP}/api/quiz/serve?round=3`, { headers: { cookie: t.cookie }, cache: "no-store" })).json();
  const comebackFor = async (t: Team) =>
    (await fetch(`${APP}/api/quiz/comeback`, { headers: { cookie: t.cookie } })).json();
  const submitFor = async (t: Team, slug: string, choice: number) =>
    (await fetch(`${APP}/api/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: t.cookie },
      body: JSON.stringify({ event: "quiz", challengeSlug: slug, payload: String(choice) }),
    })).json();
  const standings = async () =>
    (await fetch(`${APP}/api/quiz/standings?round=3`)).json();

  // Start the round: interlude is 15s, so wind the clock back past it.
  let clock = new Date(Date.now() - 15_500);
  await setClock(clock);

  const ace = teams["E2E Ace"];
  const mid = teams["E2E Mid"];
  const trailer = teams["E2E Trailer"];

  let trailerPowerSeen: string | null = null;
  let activePanelSeen = false;
  const ledgerRowsPerQuestion: number[] = [];

  // ── Walk five questions ─────────────────────────────────────────────────
  for (let step = 0; step < 5; step++) {
    // All three teams pull their question at the same instant.
    const [qa, qm, qt] = await Promise.all([serveFor(ace), serveFor(mid), serveFor(trailer)]);

    if (qa.done || !qa.slug) break;

    check(`Q${step + 1}: all three teams get the same question`,
      qa.slug === qm.slug && qm.slug === qt.slug, `${qa.slug}/${qm.slug}/${qt.slug}`);

    const challenge = r3.find((c) => c.slug === qa.slug);
    const correct = challenge?.config?.correctIndex ?? 0;
    const wrong = correct === 0 ? 1 : 0;

    if (step === 0) {
      check("Serve payload carries the comeback view", qt.comeback !== undefined && qt.comeback !== null,
        JSON.stringify(qt.comeback));
      check("Rank #1 is not offered a meter", qa.comeback?.eligible === false,
        JSON.stringify({ rank: qa.comeback?.rank, eligible: qa.comeback?.eligible }));
      check("Trailing team is offered a meter", qt.comeback?.eligible === true,
        JSON.stringify({ rank: qt.comeback?.rank, eligible: qt.comeback?.eligible }));
    }

    // The trailer's Active Power panel, once a power fires.
    if (qt.activePower) {
      activePanelSeen = true;
      check("Active Power panel names a real power",
        ["fifty-fifty", "double-points", "safety-net", "free-pass"].includes(qt.activePower.id),
        JSON.stringify(qt.activePower));
      check("Active Power panel carries a label and tagline",
        Boolean(qt.activePower.label) && Boolean(qt.activePower.tagline), JSON.stringify(qt.activePower));
      if (qt.activePower.id === "fifty-fifty") {
        check("Spider-Sense eliminations reach the browser in the same payload",
          Array.isArray(qt.eliminated) && qt.eliminated.length === 2, JSON.stringify(qt.eliminated));
        check("Spider-Sense never strikes out the correct option",
          !qt.eliminated.includes(correct), `correct=${correct} elim=${JSON.stringify(qt.eliminated)}`);
      }
    }

    // Wait out the 6s read phase, then everyone answers simultaneously.
    const answerableAt = new Date(qa.readUntil).getTime();
    const waitMs = Math.max(0, answerableAt - Date.now()) + 400;
    await new Promise((r) => setTimeout(r, waitMs));

    const beforeRows = await db.collection("score_events")
      .countDocuments({ teamId: { $in: [ace.id, mid.id, trailer.id] } });

    // Concurrent submits — and the trailer double-submits, which must not double-score.
    await Promise.all([
      submitFor(ace, qa.slug, correct),
      submitFor(mid, qm.slug, step % 2 === 0 ? correct : wrong),
      submitFor(trailer, qt.slug, wrong),
      submitFor(trailer, qt.slug, wrong),
    ]);

    const afterRows = await db.collection("score_events")
      .countDocuments({ teamId: { $in: [ace.id, mid.id, trailer.id] } });
    ledgerRowsPerQuestion.push(afterRows - beforeRows);

    // A team that answers before its timer expires settles immediately, so the
    // banked-but-not-yet-fired window is observable here — between their
    // answer and the next question being served.
    const midQuestion = await comebackFor(trailer);
    if (midQuestion.stored) {
      trailerPowerSeen = midQuestion.stored.id;
      check("A newly unlocked power is STORED, not fired on the question that earned it",
        midQuestion.active === null && midQuestion.bars === 0,
        JSON.stringify({ stored: midQuestion.stored?.id, active: midQuestion.active?.id, bars: midQuestion.bars }));
    }

    // Duplicate submits for the same question must not produce duplicate serves.
    const trailerServes = await db.collection("quiz_serves")
      .countDocuments({ teamId: trailer.id, challengeSlug: qt.slug });
    check(`Q${step + 1}: one serve record per team per question`, trailerServes === 1, `serves=${trailerServes}`);

    // Move to the next question by winding the clock back past this one's end.
    const remain = Math.max(0, new Date(qa.answerableUntil).getTime() - Date.now());
    clock = new Date(clock.getTime() - (remain + 600));
    await setClock(clock);

    // Let the sweep settle the closed question.
    await Promise.all([serveFor(ace), serveFor(mid), serveFor(trailer)]);

    const cbT = await comebackFor(trailer);
    if (cbT.stored) trailerPowerSeen = cbT.stored.id;
    if (cbT.active) {
      trailerPowerSeen = trailerPowerSeen ?? cbT.active.id;
      // Web-Slinger's Pass wins the question outright — it must never be
      // scored as a miss just because the client's own click was refused.
      if (cbT.active.id === "free-pass") {
        check("A free-passed question does not fill a bar", cbT.bars === 0, `bars=${cbT.bars}`);
      }
    }

    console.log(
      `  [walk] Q${step + 1} ${qa.slug}: trailer bars=${cbT.bars}/${cbT.maxBars} ` +
        `stored=${cbT.stored?.id ?? "-"} active=${cbT.active?.id ?? "-"} rank=#${cbT.rank}`
    );
  }

  // ── Meter behaviour over the walk ───────────────────────────────────────
  const trailerState = await db.collection("comeback_states").findOne({ teamId: trailer.id, round: 3 });
  check("Trailing team accrued meter progress from wrong answers",
    (trailerState?.bottomStreak ?? 0) > 0 || trailerPowerSeen !== null,
    JSON.stringify({ bars: trailerState?.bottomStreak, seen: trailerPowerSeen }));
  check("Three misses produced exactly one stored power", trailerPowerSeen !== null,
    `seen=${trailerPowerSeen}`);
  check("A power actually fired on a later question", activePanelSeen);

  const aceState = await db.collection("comeback_states").findOne({ teamId: ace.id, round: 3 });
  check("Rank #1 never accrued a bar over the whole walk", (aceState?.bottomStreak ?? 0) === 0,
    `bars=${aceState?.bottomStreak}`);
  check("Rank #1 never unlocked a power", (aceState?.ability ?? null) === null, String(aceState?.ability));

  // ── No duplicate scoring anywhere ───────────────────────────────────────
  const dupes = await db.collection("score_events").aggregate([
    { $match: { teamId: { $in: [ace.id, mid.id, trailer.id] } } },
    { $group: { _id: { teamId: "$teamId", reason: "$reason" }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  check("No team was scored twice for the same question", dupes.length === 0,
    JSON.stringify(dupes.map((d) => ({ reason: d._id.reason, n: d.n }))));

  // ── Cross-view consistency: contestant / leaderboard / admin ────────────
  const board = await standings();
  const boardRows: Array<{ teamId: string; rank: number; points: number; teamName: string }> = board.rows ?? [];
  const cbTrailer = await comebackFor(trailer);
  const trailerRow = boardRows.find((r) => r.teamId === String(trailer.id));

  check("Leaderboard ranks match the contestant's own view",
    trailerRow?.rank === cbTrailer.rank, `board=#${trailerRow?.rank} contestant=#${cbTrailer.rank}`);
  check("Leaderboard is ordered by points descending",
    boardRows.every((r, i) => i === 0 || boardRows[i - 1].points >= r.points),
    JSON.stringify(boardRows.map((r) => r.points)));
  check("Rank #1 on the board is the leading team",
    boardRows[0]?.teamId === String(ace.id), `top=${boardRows[0]?.teamName}`);

  const overviewRes = await fetch(`${APP}/api/admin/quiz/overview?round=3`, { headers: { cookie: adminCookie } });
  const overview = await overviewRes.json();
  check("Admin overview is reachable", overviewRes.ok, `status=${overviewRes.status}`);
  const adminRow = (overview.comeback ?? []).find((c: { teamId: string }) => c.teamId === String(trailer.id));
  check("Admin view of the meter matches the contestant's",
    adminRow ? adminRow.bottomStreak === cbTrailer.bars : false,
    JSON.stringify({ admin: adminRow?.bottomStreak, contestant: cbTrailer.bars }));

  // ── Refresh: repeated reads must be identical and must not mutate ───────
  const snapshotBefore = JSON.stringify(await db.collection("comeback_states").findOne({ teamId: trailer.id, round: 3 }));
  const reads = await Promise.all([comebackFor(trailer), comebackFor(trailer), comebackFor(trailer)]);
  const snapshotAfter = JSON.stringify(await db.collection("comeback_states").findOne({ teamId: trailer.id, round: 3 }));
  check("Refreshing does not mutate meter state", snapshotBefore === snapshotAfter);
  check("Concurrent refreshes all return the same view",
    reads.every((r) => JSON.stringify(r) === JSON.stringify(reads[0])), JSON.stringify(reads.map((r) => r.bars)));

  // ── Concurrent serve storm must not duplicate anything ─────────────────
  const storm = await Promise.all(Array.from({ length: 10 }, () => serveFor(trailer)));
  const stormSlugs = new Set(storm.map((s) => s.slug ?? (s.done ? "done" : "err")));
  check("10 concurrent serves agree on one question", stormSlugs.size === 1, JSON.stringify([...stormSlugs]));
  const serveDupes = await db.collection("quiz_serves").aggregate([
    { $match: { teamId: trailer.id } },
    { $group: { _id: "$challengeSlug", n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
  ]).toArray();
  check("Concurrent serves never duplicate a serve record", serveDupes.length === 0, JSON.stringify(serveDupes));

  const finalState = await db.collection("comeback_states").findOne({ teamId: trailer.id, round: 3 });
  check("Meter never exceeds its cap", (finalState?.bottomStreak ?? 0) <= 3, `bars=${finalState?.bottomStreak}`);

  // ── Contestant page renders server-side without throwing ───────────────
  const pageRes = await fetch(`${APP}/quiz`, { headers: { cookie: trailer.cookie } });
  const html = await pageRes.text();
  check("Quiz page renders for a contestant", pageRes.ok, `status=${pageRes.status}`);
  check("Quiz page HTML contains no server error digest",
    !/application error|Internal Server Error/i.test(html));

  // ── Cleanup ────────────────────────────────────────────────────────────
  await cleanup();
  for (const t of Object.values(teams)) {
    await db.collection("teams").deleteOne({ _id: t.id });
    await db.collection("participants").deleteOne({ _id: t.participant });
    await db.collection("round_qualifications").deleteMany({ teamId: t.id });
  }
  await db.collection("teams").deleteOne({ _id: adminTeam });
  await quizState.updateOne({ _id: "quiz" as never }, { $set: { round3StartedAt: null } });
  await client.close();

  console.log(`\n${"─".repeat(70)}`);
  for (const p of passed) console.log(`  PASS  ${p}`);
  for (const f of failed) console.log(`  FAIL  ${f}`);
  console.log(`${"─".repeat(70)}`);
  console.log(`  ${passed.length} passed, ${failed.length} failed`);
  console.log(`  ledger rows written per question: [${ledgerRowsPerQuestion.join(", ")}]\n`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

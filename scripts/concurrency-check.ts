/**
 * MANY teams playing at the same time — proves state (serves, memory grids,
 * timers, ledger writes) is isolated per team and survives real concurrent
 * load, not just sequential single-user calls.
 *
 * Run against a server that's already up, on a FRESH seed:
 *   npx tsx scripts/seed-quiz.ts
 *   QUIZ_BASE=http://localhost:3000 npx tsx scripts/concurrency-check.ts
 *
 * Not idempotent — reseed before every run.
 */
import { ObjectId } from "mongodb";
import { collections } from "../src/lib/db/client";

const BASE = process.env.QUIZ_BASE ?? "http://localhost:3000";
const TEAM_COUNT = 12;

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failures.push(label);
    console.log(`  ✗ ${label}`);
    if (detail !== undefined) console.log(`      got: ${JSON.stringify(detail)}`);
  }
}

function note(msg: string) {
  console.log(`    · ${msg}`);
}

class Client {
  private cookie = "";
  constructor(readonly label: string) {}

  private async send(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- arbitrary JSON from an HTTP response in a test harness
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* non-JSON error page */
    }
    return { status: res.status, body: json };
  }

  get(path: string) {
    return this.send("GET", path);
  }
  post(path: string, body?: unknown) {
    return this.send("POST", path, body);
  }
  delete(path: string) {
    return this.send("DELETE", path);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
// Must match seed-quiz.ts's CONNECTIONS_PUZZLES answers.
const CONNECTIONS_ANSWERS = ["recursion", "single responsibility", "fetch", "race condition", "hierarchy"];

interface Team {
  client: Client;
  coin: number;
  name: string;
  teamId: string;
}

async function main() {
  console.log(`\nConcurrency check: ${TEAM_COUNT} teams playing at once, against ${BASE}\n`);

  const participantsCol = await collections.participants();
  const adminParticipant = await participantsCol.findOne({ role: "admin" });
  if (!adminParticipant) throw new Error("No admin participant — run scripts/seed-quiz.ts first");
  const codesCol = await collections.accessCodes();
  const { hashCode } = await import("../src/lib/auth/session");
  const adminCode = "X26-CONCURRENCY-ADMIN";
  await codesCol.updateOne(
    { participantId: adminParticipant._id! },
    { $set: { codeHash: hashCode(adminCode), role: "admin", redeemedAt: null } },
    { upsert: true }
  );
  const admin = new Client("coordinator");
  await admin.post("/api/enter", { code: adminCode });

  // ── Entry: all N teams claim distinct coins at once ─────────────────────
  console.log("── Concurrent entry ─────────────────────────────────────────");
  const coins = Array.from({ length: TEAM_COUNT }, (_, i) => i + 1); // 1..N, all Spider-Man range or spilling into Miles — fine, avatar isn't under test here
  const entries = await Promise.all(
    coins.map(async (coin) => {
      const client = new Client(`team-${coin}`);
      const res = await client.post("/api/enter", { coin: String(coin), teamName: `Concurrent ${coin}` });
      return { client, coin, name: `Concurrent ${coin}`, teamId: String(res.body?.teamId), ok: res.status === 200 };
    })
  );
  check(`all ${TEAM_COUNT} teams entered concurrently without error`, entries.every((e) => e.ok), entries.filter((e) => !e.ok));
  const teamIds = new Set(entries.map((e) => e.teamId));
  check("every concurrent entry got a distinct team id (no coin-claim race)", teamIds.size === TEAM_COUNT, [...teamIds]);
  const teams: Team[] = entries.map(({ client, coin, name, teamId }) => ({ client, coin, name, teamId }));

  // ── Round 1: everyone hits image phase concurrently ─────────────────────
  console.log("\n── Round 1: concurrent image phase ──────────────────────────");
  const r1Starts = await Promise.all(teams.map((t) => t.client.get("/api/quiz/round1")));
  check("every team independently starts on the image phase", r1Starts.every((r) => r.body?.phase === "image"), r1Starts.map((r) => r.body?.phase));

  const uploads = await Promise.all(teams.map((t) => t.client.post("/api/quiz/image", { challengeSlug: "image-1", dataUrl: TINY_JPEG })));
  check("every concurrent upload succeeds independently", uploads.every((u) => u.status === 200 && !!u.body?.imageId), uploads.map((u) => u.status));

  const imgSubs = await Promise.all(
    teams.map((t, i) => t.client.post("/api/submit", { event: "quiz", challengeSlug: "image-1", payload: uploads[i].body?.imageId }))
  );
  check("every concurrent submission is accepted pending", imgSubs.every((s) => s.status === 202), imgSubs.map((s) => s.status));

  const promptImages = await collections.promptImages();
  const imageDocCount = await promptImages.countDocuments({ challengeSlug: "image-1", teamId: { $in: teams.map((t) => new ObjectId(t.teamId)) } });
  check("exactly one image document per team was written, no cross-writes", imageDocCount === TEAM_COUNT, imageDocCount);

  const r1AfterSubmit = await Promise.all(teams.map((t) => t.client.get("/api/quiz/round1")));
  check("submitting alone does not advance anyone — the window's still open", r1AfterSubmit.every((r) => r.body?.phase === "image"), r1AfterSubmit.map((r) => r.body?.phase));

  // Concurrent delete + re-upload, for a random half of the field — proves
  // the withdraw-and-retry path is also race-safe, not just the happy path.
  const deleters = teams.slice(0, Math.floor(TEAM_COUNT / 2));
  const deleteResults = await Promise.all(deleters.map((t) => t.client.delete("/api/quiz/image?challengeSlug=image-1")));
  check("every concurrent delete succeeds independently", deleteResults.every((d) => d.body?.ok === true && d.body?.hadSubmission === true), deleteResults.map((d) => d.status));
  const reuploads = await Promise.all(deleters.map((t) => t.client.post("/api/quiz/image", { challengeSlug: "image-1", dataUrl: TINY_JPEG })));
  const resubmits = await Promise.all(deleters.map((t, i) => t.client.post("/api/submit", { event: "quiz", challengeSlug: "image-1", payload: reuploads[i].body?.imageId })));
  check("every concurrent re-submission after a delete is accepted", resubmits.every((s) => s.status === 202), resubmits.map((s) => s.status));

  // Force the window closed (DB-direct — this script tests concurrency, not
  // real wall-clock timing, which is live-check.ts's job).
  const imageChallenges = await collections.challenges();
  await imageChallenges.updateOne({ type: "quiz", slug: "image-1" }, { $set: { closesAt: new Date(Date.now() - 1000) } });

  const r1AfterImage = await Promise.all(teams.map((t) => t.client.get("/api/quiz/round1")));
  check("every team independently advances to the connections phase once the window closes", r1AfterImage.every((r) => r.body?.phase === "connections"), r1AfterImage.map((r) => r.body?.phase));

  // ── Round 1: Connections — shared reveal, per-team solve state ──────────
  console.log("\n── Round 1: concurrent Connections ──────────────────────────");
  await admin.post("/api/quiz/advance", { action: "open", slug: "connections-1", minutes: 5 });

  // Fire more concurrent reveal clicks than there are tiles — a plain
  // read-then-write here would either lose increments (ending under the
  // true count) or overshoot past the image count. The atomic $inc in the
  // route should land exactly at the cap no matter how many clicks race.
  const connCh1Before = await (await collections.challenges()).findOne({ type: "quiz", slug: "connections-1" });
  const totalTiles1 = connCh1Before?.config.connectionsImages?.length ?? 4;
  const concurrentReveal = await Promise.all(Array.from({ length: TEAM_COUNT }, () => admin.post("/api/quiz/advance", { action: "reveal-next-image", slug: "connections-1" })));
  check(
    "no concurrent reveal click ever reports a count past the tile total",
    concurrentReveal.every((r) => (r.body?.revealedCount ?? 0) <= totalTiles1),
    concurrentReveal.map((r) => r.body?.revealedCount)
  );
  const connCh1After = await (await collections.challenges()).findOne({ type: "quiz", slug: "connections-1" });
  check(
    `${TEAM_COUNT} concurrent reveal clicks against ${totalTiles1} tiles land exactly at the cap — no lost or duplicate increments`,
    connCh1After?.config.connectionsRevealedCount === totalTiles1,
    connCh1After?.config.connectionsRevealedCount
  );

  const r1Opened = await Promise.all(teams.map((t) => t.client.get("/api/quiz/round1")));
  const revealCounts = new Set(r1Opened.map((r) => r.body?.game?.images?.length));
  check("every team sees the IDENTICAL shared reveal state (same tile count)", revealCounts.size === 1, [...revealCounts]);

  const half = Math.floor(TEAM_COUNT / 2);
  const solvers = teams.slice(0, half);
  const stragglers = teams.slice(half);

  const [solverGuesses, stragglerGuesses] = await Promise.all([
    Promise.all(solvers.map((t) => t.client.post("/api/submit", { event: "quiz", challengeSlug: "connections-1", payload: CONNECTIONS_ANSWERS[0] }))),
    Promise.all(stragglers.map((t) => t.client.post("/api/submit", { event: "quiz", challengeSlug: "connections-1", payload: "wrong-on-purpose" }))),
  ]);
  check("every concurrent CORRECT guess scores independently", solverGuesses.every((g) => g.body?.correct === true), solverGuesses.map((g) => g.body?.correct));
  check("every concurrent WRONG guess scores zero without affecting others", stragglerGuesses.every((g) => g.body?.correct === false), stragglerGuesses.map((g) => g.body?.correct));
  const solverPoints = new Set(solverGuesses.map((g) => g.body?.points));
  check(
    "solvers who all guessed with the same reveal count score IDENTICAL reveal-falloff points, not a race-dependent value",
    solverPoints.size === 1 && (solverPoints.values().next().value as number) > 0,
    [...solverPoints]
  );

  // Solving puzzle 1 only advances a solver to puzzle 2 of 5 — connections
  // is itself a sequence now, not a single hop straight to memory.
  const r1AfterGuesses = await Promise.all(teams.map((t) => t.client.get("/api/quiz/round1")));
  check(
    "solvers moved on to puzzle 2, stragglers stayed on puzzle 1 — no cross-contamination",
    solvers.every((_, i) => r1AfterGuesses[i].body?.game?.puzzleIndex === 2) &&
      stragglers.every((_, i) => r1AfterGuesses[half + i].body?.game?.puzzleIndex === 1),
    r1AfterGuesses.map((r) => r.body?.game?.puzzleIndex)
  );

  // Race the solvers through puzzles 2-5 concurrently so they reach memory —
  // this is what the rest of the script needs, and it's still exercising
  // concurrent admin actions (open/reveal) against concurrent team guesses.
  const connectionsChallenges = await collections.challenges();
  for (let i = 2; i <= 5; i++) {
    const slug = `connections-${i}`;
    await admin.post("/api/quiz/advance", { action: "open", slug, minutes: 30 });
    const ch = await connectionsChallenges.findOne({ type: "quiz", slug });
    const totalImages = ch?.config.connectionsImages?.length ?? 4;
    for (let r = 0; r < totalImages; r++) {
      await admin.post("/api/quiz/advance", { action: "reveal-next-image", slug });
    }
    await Promise.all(solvers.map((t) => t.client.post("/api/submit", { event: "quiz", challengeSlug: slug, payload: CONNECTIONS_ANSWERS[i - 1] })));
  }
  const r1AfterAllPuzzles = await Promise.all(solvers.map((t) => t.client.get("/api/quiz/round1")));
  check("every solver independently clears all 5 puzzles and reaches memory", r1AfterAllPuzzles.every((r) => r.body?.phase === "memory"), r1AfterAllPuzzles.map((r) => r.body?.phase));

  // ── Round 1: Memory — independent grids under concurrent play ───────────
  console.log("\n── Round 1: concurrent Memory Game ──────────────────────────");
  await Promise.all(solvers.map((t) => t.client.get("/api/quiz/memory?slug=memory-1")));
  const memoryStates = await collections.memoryStates();
  const solverStates = await memoryStates.find({ teamId: { $in: solvers.map((t) => new ObjectId(t.teamId)) } }).toArray();
  check("every solver got its own memory document", solverStates.length === solvers.length, solverStates.length);
  const distinctGrids = new Set(solverStates.map((s) => s.grid.join(",")));
  check("grids are independently shuffled, not shared/identical across teams", distinctGrids.size > 1 || solvers.length === 1, distinctGrids.size);

  await Promise.all(
    solvers.map(async (t) => {
      const state = solverStates.find((s) => String(s.teamId) === t.teamId)!;
      const pairIndexes = new Map<string, number[]>();
      state.grid.forEach((token, i) => pairIndexes.set(token, [...(pairIndexes.get(token) ?? []), i]));
      for (const [a, b] of pairIndexes.values()) {
        await t.client.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: a });
        await t.client.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: b });
      }
    })
  );
  const finalMemStates = await memoryStates.find({ teamId: { $in: solvers.map((t) => new ObjectId(t.teamId)) } }).toArray();
  check("every solver's own memory game completed independently", finalMemStates.every((s) => s.completedAt !== null), finalMemStates.map((s) => s.completedAt));
  check("every solver scored full points on their own grid", finalMemStates.every((s) => s.scoredPoints === 16), finalMemStates.map((s) => s.scoredPoints));

  // ── The cut ──────────────────────────────────────────────────────────────
  console.log("\n── Advancing the whole field ────────────────────────────────");
  const cut1 = await admin.post("/api/quiz/advance", { action: "advance", round: 1, count: TEAM_COUNT });
  check("cut into round 2 includes every team that played", cut1.body?.qualified?.length === TEAM_COUNT, cut1.body?.qualified?.length);

  // ── Round 2: concurrent serve — same team requesting twice at once ──────
  console.log("\n── Round 2: concurrent serve isolation ──────────────────────");
  const [doubleA, doubleB] = await Promise.all([teams[0].client.get("/api/quiz/serve?round=2"), teams[0].client.get("/api/quiz/serve?round=2")]);
  check(
    "the SAME team requesting serve twice at once gets the SAME serve back (no duplicate clock)",
    doubleA.body?.slug === doubleB.body?.slug && doubleA.body?.readUntil === doubleB.body?.readUntil,
    { a: doubleA.body, b: doubleB.body }
  );

  const served = await Promise.all(teams.slice(1).map((t) => t.client.get("/api/quiz/serve?round=2")));
  check("every OTHER team gets its own independent serve concurrently", served.every((s) => !!s.body?.slug), served.map((s) => s.body?.slug));

  const quizServes = await collections.quizServes();
  const serveDocCount = await quizServes.countDocuments({ challengeSlug: doubleA.body.slug, teamId: { $in: teams.map((t) => new ObjectId(t.teamId)) } });
  check("exactly one serve document per team for this question, no duplicates from the race", serveDocCount === TEAM_COUNT, serveDocCount);

  const readTimes = new Set([doubleA.body.readUntil, ...served.map((s) => s.body.readUntil)]);
  note(`distinct readUntil values across the field: ${readTimes.size} (expected exactly 1 — everyone served the same question at the same moment)`);

  // ── Round 2: everyone answers correctly AT ONCE ──────────────────────────
  console.log("\n── Round 2: concurrent correct answers ──────────────────────");
  const challenges = await collections.challenges();
  const ch1 = await challenges.findOne({ type: "quiz", slug: doubleA.body.slug });
  const readUntilMs = new Date(doubleA.body.readUntil).getTime();
  await sleep(Math.max(0, readUntilMs - Date.now()) + 300);

  const answers = await Promise.all(
    teams.map((t) => t.client.post("/api/submit", { event: "quiz", challengeSlug: doubleA.body.slug, payload: String(ch1?.config.correctIndex) }))
  );
  check("every concurrent correct answer scores independently", answers.every((a) => a.body?.correct === true && a.body?.points === ch1?.points), answers.map((a) => a.body?.correct));

  const scoreEvents = await collections.scoreEvents();
  const ledgerCount = await scoreEvents.countDocuments({ event: "quiz", reason: `quiz:${doubleA.body.slug}`, teamId: { $in: teams.map((t) => new ObjectId(t.teamId)) } });
  check("the ledger has exactly one entry per team — no lost writes under concurrent appendScore", ledgerCount === TEAM_COUNT, ledgerCount);

  // ── Admin aggregation reflects concurrent writes correctly ───────────────
  console.log("\n── Admin standings after concurrent play ────────────────────");
  const overview = await admin.get("/api/admin/quiz/overview?round=2");
  const rows = overview.body?.standings ?? [];
  const allScored = teams.every((t) => {
    const row = rows.find((r: { teamId: string }) => r.teamId === t.teamId);
    return row && row.points >= ch1!.points;
  });
  check("admin standings correctly aggregate every team's concurrently-written score", allScored, rows.map((r: { teamName: string; points: number }) => `${r.teamName}:${r.points}`));

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(62)}`);
  if (failures.length === 0) {
    console.log(`  ALL ${passed} CHECKS PASSED — ${TEAM_COUNT} teams, fully concurrent`);
  } else {
    console.log(`  ${passed} passed, ${failures.length} FAILED:`);
    for (const f of failures) console.log(`    ✗ ${f}`);
  }
  console.log(`${"─".repeat(62)}\n`);

  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

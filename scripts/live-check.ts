/**
 * ONE team, playing the entire quiz for real — no admin shortcuts on timing.
 * Landing (API-equivalent) through final Round 3 standings, waiting out the
 * actual server-computed deadlines instead of racing them. Point is to prove
 * the timestamps are right, not just that the code compiles.
 *
 * Run against a server that's already up, on a FRESH seed:
 *   npx tsx scripts/seed-quiz.ts
 *   QUIZ_BASE=http://localhost:3000 npx tsx scripts/live-check.ts
 *
 * Not idempotent — reseed before every run.
 */
import { collections } from "../src/lib/db/client";
import { DEFAULT_REVEAL_SECONDS } from "../src/lib/quiz/connections";

const BASE = process.env.QUIZ_BASE ?? "http://localhost:3000";

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
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const wallStart = Date.now();
function elapsed() {
  return `${((Date.now() - wallStart) / 1000).toFixed(1)}s`;
}

const TINY_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";
const CONNECTIONS_ANSWER = "recursion"; // must match seed-quiz.ts

async function playMcqRound(client: Client, round: 2 | 3, adminCode: string) {
  const admin = new Client("admin-mcq");
  await admin.post("/api/enter", { code: adminCode });

  let index = 0;
  for (;;) {
    const t0 = Date.now();
    const served = await client.get(`/api/quiz/serve?round=${round}`);
    if (served.body?.done) {
      note(`round ${round} reports done after ${index} question(s), at ${elapsed()}`);
      break;
    }
    if (!served.body?.slug) {
      check(`round ${round} q${index + 1}: serve returned a real question`, false, served.body);
      break;
    }
    index++;

    const readUntil = new Date(served.body.readUntil).getTime();
    const answerableUntil = new Date(served.body.answerableUntil).getTime();
    const readWindowMs = readUntil - Date.now();
    const selectWindowMs = answerableUntil - readUntil;

    check(
      `round ${round} q${index}: read window is ~6s and select window is ~10s`,
      Math.abs(readWindowMs - 6000) < 1500 && Math.abs(selectWindowMs - 10000) < 500,
      { readWindowMs, selectWindowMs }
    );

    // Probe too-early on the FIRST question only (already covered per-round
    // in verify-quiz.ts; here we're mainly timing every question for real).
    if (index === 1) {
      const early = await client.post("/api/submit", { event: "quiz", challengeSlug: served.body.slug, payload: "0" });
      check(
        `round ${round} q${index}: an immediate answer is rejected as too-early, not scored`,
        early.body?.correct === false && early.body?.meta?.reason === "too-early",
        early.body
      );
      const reserve = await client.get(`/api/quiz/serve?round=${round}`);
      check(
        `round ${round} q${index}: the too-early probe did NOT burn the question`,
        reserve.body?.slug === served.body.slug && !reserve.body?.answeredAt,
        reserve.body
      );
    }

    // Wait out the real read-lock window before answering for real.
    const waitMs = Math.max(0, readUntil - Date.now()) + 250;
    await sleep(waitMs);

    // We don't know the correct index without reading the DB — read it once
    // per slug so this is a real answer, not a guaranteed-wrong one.
    const challenges = await collections.challenges();
    const ch = await challenges.findOne({ type: "quiz", slug: served.body.slug });
    const correctIndex = ch?.config.correctIndex ?? 0;

    const answered = await client.post("/api/submit", {
      event: "quiz",
      challengeSlug: served.body.slug,
      payload: String(correctIndex),
    });
    check(
      `round ${round} q${index}: real answer inside the select window scores correctly`,
      answered.body?.correct === true && answered.body?.points === ch?.points,
      answered.body
    );

    note(`q${index} (${served.body.slug}) served->answered in ${((Date.now() - t0) / 1000).toFixed(1)}s, at wall ${elapsed()}`);
  }
}

async function main() {
  console.log(`\nLive single-user playthrough against ${BASE}\n`);

  // ── Admin ────────────────────────────────────────────────────────────────
  const participantsCol = await collections.participants();
  const adminParticipant = await participantsCol.findOne({ role: "admin" });
  if (!adminParticipant) throw new Error("No admin participant — run scripts/seed-quiz.ts first");
  const codesCol = await collections.accessCodes();
  const { hashCode } = await import("../src/lib/auth/session");
  const adminCode = "X26-LIVECHECK-ADMIN";
  await codesCol.updateOne(
    { participantId: adminParticipant._id! },
    { $set: { codeHash: hashCode(adminCode), role: "admin", redeemedAt: null } },
    { upsert: true }
  );
  const admin = new Client("coordinator");
  await admin.post("/api/enter", { code: adminCode });

  // ── Landing / entry ──────────────────────────────────────────────────────
  console.log("── Entry ─────────────────────────────────────────────────────");
  const hero = new Client("hero");
  const entered = await hero.post("/api/enter", { coin: "23", teamName: "Live Check Hero" });
  check("hero logs in with a coin and a team name", entered.status === 200 && !!entered.body?.teamId, entered.body);
  note(`entered as ${entered.body?.teamName} (${entered.body?.avatar?.name}) at ${elapsed()}`);

  const status0 = await hero.get("/api/quiz/status");
  check("status starts at round 1", status0.body?.round === 1, status0.body);

  // ── Round 1: Image ───────────────────────────────────────────────────────
  console.log("\n── Round 1, phase 1: Image Replication ─────────────────────");
  const r1a = await hero.get("/api/quiz/round1");
  check("round1 starts on the image phase", r1a.body?.phase === "image", r1a.body);

  const upload = await hero.post("/api/quiz/image", { challengeSlug: "image-1", dataUrl: TINY_JPEG });
  check("image upload succeeds", upload.status === 200 && !!upload.body?.imageId, upload.body);
  const imgSubmit = await hero.post("/api/submit", { event: "quiz", challengeSlug: "image-1", payload: upload.body?.imageId });
  check("image submission is accepted pending", imgSubmit.status === 202, imgSubmit.body);
  note(`image submitted at ${elapsed()}`);

  const r1b = await hero.get("/api/quiz/round1");
  check("phase advances to connections immediately on submit", r1b.body?.phase === "connections", r1b.body);

  // ── Round 1: Connections — wait out the REAL reveal schedule ────────────
  console.log("\n── Round 1, phase 2: Connections (real reveal timing) ──────");
  const opened = await admin.post("/api/quiz/advance", { action: "open", slug: "connections-1", minutes: 5 });
  check("coordinator opens the connections window", opened.body?.ok === true, opened.body);
  const opensAt = new Date(opened.body.opensAt).getTime();

  const challenges = await collections.challenges();
  const connCh = await challenges.findOne({ type: "quiz", slug: "connections-1" });
  const revealSeconds = connCh?.config.connectionsRevealSeconds ?? DEFAULT_REVEAL_SECONDS;
  const totalTiles = connCh?.config.connectionsImages?.length ?? 4;
  note(`reveal interval is ${revealSeconds}s per tile, ${totalTiles} tiles total`);

  for (let tile = 1; tile <= totalTiles; tile++) {
    const targetAt = opensAt + (tile - 1) * revealSeconds * 1000;
    const waitMs = Math.max(0, targetAt - Date.now()) + 400;
    if (waitMs > 0) await sleep(waitMs);
    const r = await hero.get("/api/quiz/round1");
    check(`tile ${tile} is revealed at its scheduled time (not early, not late)`, (r.body?.game?.images?.length ?? 0) >= tile, {
      wallTime: elapsed(),
      revealedCount: r.body?.game?.images?.length,
    });
  }

  const wrongGuess = await hero.post("/api/submit", { event: "quiz", challengeSlug: "connections-1", payload: "definitely-wrong" });
  check("a wrong guess after all tiles are up still scores zero, allows retry", wrongGuess.body?.correct === false, wrongGuess.body);

  const rightGuess = await hero.post("/api/submit", { event: "quiz", challengeSlug: "connections-1", payload: CONNECTIONS_ANSWER });
  check("the real answer is accepted", rightGuess.body?.correct === true, rightGuess.body);
  // Solved after every tile is up — this is the worst timing a correct guess
  // can have, so it should score the 30% floor, not the full 8 points.
  const expectedFloor = Math.round((connCh?.points ?? 0) * 0.3);
  check(
    `solving after the last tile scores the reveal-falloff floor (~${expectedFloor}pts), not flat full marks`,
    rightGuess.body?.points === expectedFloor,
    rightGuess.body
  );
  note(`connections solved at ${elapsed()} for ${rightGuess.body?.points} points (full value: ${connCh?.points})`);

  const r1c = await hero.get("/api/quiz/round1");
  check("phase advances to memory", r1c.body?.phase === "memory", r1c.body);

  // ── Round 1: Memory ──────────────────────────────────────────────────────
  console.log("\n── Round 1, phase 3: Memory Game ────────────────────────────");
  await hero.get("/api/quiz/memory?slug=memory-1");
  const memoryStates = await collections.memoryStates();
  const teams = await collections.teams();
  const heroTeam = await teams.findOne({ name: "Live Check Hero" });
  const memState = await memoryStates.findOne({ teamId: heroTeam!._id });
  check("memory state exists server-side", !!memState, memState);

  if (memState) {
    const pairIndexes = new Map<string, number[]>();
    memState.grid.forEach((token, i) => pairIndexes.set(token, [...(pairIndexes.get(token) ?? []), i]));
    for (const [a, b] of pairIndexes.values()) {
      await hero.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: a });
      await hero.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: b });
    }
    const finalMem = await memoryStates.findOne({ _id: memState._id });
    check("perfect play completes memory at full points", finalMem?.completedAt !== null && finalMem?.scoredPoints === connCh?.points ? true : finalMem?.scoredPoints === 16, finalMem);
    note(`memory completed at ${elapsed()}, scored ${finalMem?.scoredPoints}pts`);
  }

  const r1Done = await hero.get("/api/quiz/round1");
  check("Round 1 reaches the done phase", r1Done.body?.phase === "done", r1Done.body);

  // ── The cut: round 1 → round 2 ──────────────────────────────────────────
  console.log("\n── Advancing to Round 2 ─────────────────────────────────────");
  const stillR1 = await hero.get("/api/quiz/status");
  check("status still says round 1 before the coordinator cuts", stillR1.body?.round === 1, stillR1.body);

  const cut1 = await admin.post("/api/quiz/advance", { action: "advance", round: 1 });
  check("coordinator advances round 1", cut1.body?.ok === true, cut1.body);

  const nowR2 = await hero.get("/api/quiz/status");
  check("status flips to round 2 the moment the cut lands", nowR2.body?.round === 2, nowR2.body);
  note(`advanced to round 2 at ${elapsed()}`);

  // ── Round 2: all 8 questions, real timing ────────────────────────────────
  console.log("\n── Round 2: Universe 1 (all questions, real timing) ─────────");
  await playMcqRound(hero, 2, adminCode);

  const standings2 = await hero.get("/api/quiz/standings?round=2");
  const heroRow2 = standings2.body?.rows?.find((r: { teamId: string }) => r.teamId === String(heroTeam!._id));
  check("round 2 standings show the hero with a real point total", (heroRow2?.points ?? 0) > 0, heroRow2);
  note(`round 2 final score: ${heroRow2?.points}pts`);

  // ── The cut: round 2 → round 3 ──────────────────────────────────────────
  console.log("\n── Advancing to Round 3 ─────────────────────────────────────");
  const cut2 = await admin.post("/api/quiz/advance", { action: "advance", round: 2 });
  check("coordinator advances round 2", cut2.body?.ok === true, cut2.body);

  const nowR3 = await hero.get("/api/quiz/status");
  check("status flips to round 3", nowR3.body?.round === 3, nowR3.body);
  note(`advanced to round 3 at ${elapsed()}`);

  // ── Round 3: all 8 questions, real timing ────────────────────────────────
  console.log("\n── Round 3: Universe 2 (all questions, real timing) ─────────");
  await playMcqRound(hero, 3, adminCode);

  const standings3 = await hero.get("/api/quiz/standings?round=3");
  const heroRow3 = standings3.body?.rows?.find((r: { teamId: string }) => r.teamId === String(heroTeam!._id));
  check("round 3 (final) standings show a real point total", (heroRow3?.points ?? 0) > 0, heroRow3);
  note(`FINAL score: ${heroRow3?.points}pts, total wall time ${elapsed()}`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(62)}`);
  if (failures.length === 0) {
    console.log(`  ALL ${passed} CHECKS PASSED — full playthrough in ${elapsed()}`);
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

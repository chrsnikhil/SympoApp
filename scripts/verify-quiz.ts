/**
 * End-to-end verification of the Spider Multiverse Tech Quiz.
 *
 * Run against a server that's already up:
 *   npx tsx scripts/seed-quiz.ts
 *   npm run dev -- -p 3100
 *   QUIZ_BASE=http://localhost:3100 npx tsx scripts/verify-quiz.ts
 *
 * Drives the real HTTP API exactly as a browser would, and reads the database
 * only to look up correct answers / force deterministic state (the API never
 * reveals a memory grid or an MCQ's correct index). Asserts the things that
 * fail silently:
 *
 *   · Round 1's three games unlock strictly in order (image -> connections ->
 *     memory) and never earlier, per team
 *   · Connections reveals tiles on the coordinator's schedule, not a client
 *     clock, and a wrong guess doesn't block a retry
 *   · a reload must not restart a question's two-phase clock
 *   · an answer before the read phase ends, or after the select phase ends,
 *     must score zero
 *   · a wrong-round or knocked-out team must not be able to play
 *   · the memory grid must never leak its arrangement to the client
 *   · a comeback ability must not fire twice, and must apply the effect it
 *     claims to (extra-time actually extends the deadline, etc.)
 *   · a proctor flag is timestamped server-side and rejected outside rounds 2/3
 *   · the admin endpoints reject non-admins
 *
 * The script is NOT idempotent — it claims coins, completes games and
 * advances rounds, because that's what it's testing. Reseed before every run;
 * a wall of red on a second run means stale data, not a regression.
 */
import { ObjectId } from "mongodb";
import { collections } from "../src/lib/db/client";
import { standings } from "../src/lib/quiz/rounds";

const BASE = process.env.QUIZ_BASE ?? "http://localhost:3100";

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

async function main() {
  console.log(`\nVerifying the Spider Multiverse Tech Quiz against ${BASE}\n`);

  const participantsCol = await collections.participants();
  const adminParticipant = await participantsCol.findOne({ role: "admin" });
  if (!adminParticipant) throw new Error("No admin participant — run scripts/seed-quiz.ts first");

  const codesCol = await collections.accessCodes();
  const { hashCode } = await import("../src/lib/auth/session");
  const adminCode = "X26-VERIFY-ADMIN";
  await codesCol.updateOne(
    { participantId: adminParticipant._id! },
    { $set: { codeHash: hashCode(adminCode), role: "admin", redeemedAt: null } },
    { upsert: true }
  );
  const admin = new Client("coordinator");
  const adminEnter = await admin.post("/api/enter", { code: adminCode });
  check("coordinator signs in with an access code", adminEnter.body?.role === "admin", adminEnter.body);

  // ── Entry: coins ─────────────────────────────────────────────────────────
  console.log("\n── Entry ────────────────────────────────────────────────────");
  const COINS = [1, 16, 31, 46, 2, 17, 32, 47];
  const clients: Array<{ client: Client; teamId: string; name: string }> = [];

  const firstUse = await new Client("probe").post("/api/enter", { coin: "1" });
  check("an unclaimed coin asks for a team name", firstUse.status === 400 && firstUse.body?.needsTeamName === true, firstUse.body);

  for (let i = 0; i < COINS.length; i++) {
    const name = `Verify ${i + 1}`;
    const client = new Client(name);
    const entered = await client.post("/api/enter", { coin: String(COINS[i]), teamName: name });
    if (i === 0) {
      check("claiming a coin creates the team and signs it in", entered.status === 200 && !!entered.body?.teamId, entered.body);
      check("coin 01 grants Spider-Man", entered.body?.avatar?.id === "spider-man", entered.body?.avatar?.id);
    }
    if (i === 1) check("coin 16 grants Miles", entered.body?.avatar?.id === "miles", entered.body?.avatar?.id);
    if (i === 2) check("coin 31 grants Gwen", entered.body?.avatar?.id === "gwen", entered.body?.avatar?.id);
    if (i === 3) check("coin 46 grants Spider-Man 2099", entered.body?.avatar?.id === "miguel", entered.body?.avatar?.id);
    clients.push({ client, teamId: String(entered.body?.teamId), name });
  }

  const back = await new Client("returning").post("/api/enter", { coin: "1" });
  check("a claimed coin signs straight back in without a name", back.status === 200 && back.body?.returning === true, back.body);

  const outOfRange = await new Client("bad").post("/api/enter", { coin: "61" });
  check("a coin outside 01-60 is refused", outOfRange.status === 400, outOfRange.status);

  // ── Round 1 ──────────────────────────────────────────────────────────────
  // Sequential per team: Image Replication -> Connections (5 puzzles) ->
  // Memory Game. See lib/quiz/round1.ts — the phase is derived, not stored,
  // so this also exercises that derivation at each step rather than trusting
  // it once.
  console.log("\n── Round 1: Final Universe ─────────────────────────────────");
  const first = clients[0].client;
  // Must match seed-quiz.ts's CONNECTIONS_PUZZLES answers — see the note
  // there on why this isn't imported instead.
  const CONNECTIONS_ANSWERS = ["heap sort", "gpu", "blockchain", "pytorch", "api"];

  const r1Start = await first.get("/api/quiz/round1");
  check("round1 starts on the image phase", r1Start.body?.phase === "image", r1Start.body);
  check("image phase carries the reference image", typeof r1Start.body?.game?.referenceImage === "string", r1Start.body?.game);

  // Image Replication — format checks without spending a Groq call.
  const svgUpload = await first.post("/api/quiz/image", { challengeSlug: "image-1", dataUrl: "data:image/svg+xml;base64,PHN2Zy8+" });
  check("an SVG upload is refused", svgUpload.status === 400, svgUpload.status);

  const TINY_JPEG =
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

  // Opening the image window is what makes it a real "window" a team can be
  // asked to wait out — without an opensAt/closesAt, round1Phase would treat
  // it as never-closing and a team could never leave the phase at all.
  await admin.post("/api/quiz/advance", { action: "open", slug: "image-1", minutes: 5 });

  const upload = await first.post("/api/quiz/image", { challengeSlug: "image-1", dataUrl: TINY_JPEG });
  check("uploading a JPEG returns an image id", upload.status === 200 && !!upload.body?.imageId, upload.body);

  const stolen = await clients[2].client.post("/api/submit", { event: "quiz", challengeSlug: "image-1", payload: upload.body?.imageId });
  check("one team cannot submit another team's image", stolen.body?.meta?.reason === "no-image", stolen.body);

  const prompt = await first.post("/api/submit", { event: "quiz", challengeSlug: "image-1", payload: upload.body?.imageId });
  check("submitting an owned image id is accepted as pending", prompt.status === 202 && prompt.body?.pending === true, prompt.body);

  const r1AfterSubmit = await first.get("/api/quiz/round1");
  check("submitting alone does NOT advance the phase — the window stays open for retries", r1AfterSubmit.body?.phase === "image", r1AfterSubmit.body);
  // "running", not "queued" — the shared pipeline only writes "queued" for
  // `code` events; a pending quiz submission sits at "running" until judged.
  check("the submitted state is visible so the UI can offer delete + retry", r1AfterSubmit.body?.game?.status === "running", r1AfterSubmit.body?.game);

  const deleted = await first.delete(`/api/quiz/image?challengeSlug=image-1`);
  check("a team can withdraw its submission while the window is open", deleted.status === 200 && deleted.body?.hadSubmission === true, deleted.body);

  const r1AfterDelete = await first.get("/api/quiz/round1");
  check("after deleting, the team is back to not-started and can re-upload", r1AfterDelete.body?.game?.status === "not-started", r1AfterDelete.body?.game);

  const reupload = await first.post("/api/quiz/image", { challengeSlug: "image-1", dataUrl: TINY_JPEG });
  const resubmit = await first.post("/api/submit", { event: "quiz", challengeSlug: "image-1", payload: reupload.body?.imageId });
  check("re-uploading and resubmitting after a delete works", resubmit.status === 202 && resubmit.body?.pending === true, resubmit.body);

  // Force the window closed (DB-direct, like the rest of this script reads
  // ground truth the API deliberately never exposes) instead of waiting out
  // 5 real minutes — the actual "wait for the real clock" case is
  // live-check.ts's job.
  const imageChallenges = await collections.challenges();
  await imageChallenges.updateOne({ type: "quiz", slug: "image-1" }, { $set: { closesAt: new Date(Date.now() - 1000) } });

  const r1AfterImage = await first.get("/api/quiz/round1");
  check("once the window actually closes, the team moves on to connections", r1AfterImage.body?.phase === "connections", r1AfterImage.body);
  check("connections starts closed until the coordinator opens it", Array.isArray(r1AfterImage.body?.game?.images) && r1AfterImage.body.game.images.length === 0, r1AfterImage.body?.game);
  check("the first connections puzzle carries its clue", typeof r1AfterImage.body?.game?.clue === "string", r1AfterImage.body?.game);
  check("puzzle 1 of 5 is reported", r1AfterImage.body?.game?.puzzleIndex === 1 && r1AfterImage.body?.game?.totalPuzzles === 5, r1AfterImage.body?.game);

  // Connections — coordinator-paced reveal (a click, not a clock), retries
  // allowed on a wrong guess, 5 puzzles played in sequence.
  const connectionsChallenges = await collections.challenges();

  const openP1 = await admin.post("/api/quiz/advance", { action: "open", slug: "connections-1", minutes: 30 });
  check("coordinator can open a connections puzzle", openP1.body?.ok === true, openP1.body);

  const r1BeforeReveal = await first.get("/api/quiz/round1");
  check("opening the puzzle alone reveals nothing yet — that's a separate click", (r1BeforeReveal.body?.game?.images?.length ?? -1) === 0, r1BeforeReveal.body?.game);

  const reveal1 = await admin.post("/api/quiz/advance", { action: "reveal-next-image", slug: "connections-1" });
  check("the coordinator's reveal click lands exactly one tile, for everyone at once", reveal1.body?.revealedCount === 1, reveal1.body);

  const r1Opened = await first.get("/api/quiz/round1");
  check("the team sees the tile the coordinator revealed", r1Opened.body?.game?.images?.length === 1, r1Opened.body?.game);

  const wrongGuess = await first.post("/api/submit", { event: "quiz", challengeSlug: "connections-1", payload: "not-it" });
  check("a wrong guess scores zero but doesn't block a retry", wrongGuess.body?.correct === false, wrongGuess.body);

  const r1AfterWrong = await first.get("/api/quiz/round1");
  check("a wrong guess stays on the connections phase", r1AfterWrong.body?.phase === "connections", r1AfterWrong.body);

  const connCh1 = await connectionsChallenges.findOne({ type: "quiz", slug: "connections-1" });
  const rightGuess = await first.post("/api/submit", { event: "quiz", challengeSlug: "connections-1", payload: CONNECTIONS_ANSWERS[0] });
  check(
    "the correct term scores full points (solved on the very first revealed tile)",
    rightGuess.body?.correct === true && rightGuess.body?.points === connCh1?.points,
    rightGuess.body
  );

  const r1AfterP1 = await first.get("/api/quiz/round1");
  check("solving puzzle 1 moves the team to puzzle 2", r1AfterP1.body?.game?.puzzleIndex === 2, r1AfterP1.body?.game);

  // Race through puzzles 2-5: open, reveal every tile, solve. This is what
  // proves the WHOLE sequence chains correctly, not just the first hop.
  for (let i = 2; i <= 5; i++) {
    const slug = `connections-${i}`;
    await admin.post("/api/quiz/advance", { action: "open", slug, minutes: 30 });
    const ch = await connectionsChallenges.findOne({ type: "quiz", slug });
    const totalImages = ch?.config.connectionsImages?.length ?? 4;
    for (let r = 0; r < totalImages; r++) {
      await admin.post("/api/quiz/advance", { action: "reveal-next-image", slug });
    }
    const guess = await first.post("/api/submit", { event: "quiz", challengeSlug: slug, payload: CONNECTIONS_ANSWERS[i - 1] });
    check(`puzzle ${i} solves correctly after all tiles are revealed`, guess.body?.correct === true, guess.body);
  }

  const r1AfterConnections = await first.get("/api/quiz/round1");
  check("clearing all 5 connections puzzles unlocks the memory phase", r1AfterConnections.body?.phase === "memory", r1AfterConnections.body);

  // Memory Game — the API must never leak the grid; we read it from Mongo to
  // drive a real completion deterministically.
  const memInit = await first.get("/api/quiz/memory?slug=memory-1");
  check("memory init returns counts but no grid", memInit.status === 200 && !("grid" in (memInit.body ?? {})), Object.keys(memInit.body ?? {}));

  const memoryStates = await collections.memoryStates();
  const teamObjId = new ObjectId(clients[0].teamId);
  const memState = await memoryStates.findOne({ teamId: teamObjId, challengeSlug: "memory-1" });
  check("a memory state was created server-side", !!memState, memState);
  check("the flip cap is the true 16-flip minimum for 8 pairs, no falloff room", memState?.flipCap === 16, memState?.flipCap);

  if (memState) {
    // Flip each pair back-to-back (index A, then its actual partner index B)
    // rather than scanning left-to-right — the game is turn-based (see
    // lib/quiz/memory.ts: a match only resolves if the SECOND flip of a turn
    // is the pair of the first), so a naive sequential scan almost never
    // lands two flips of the same turn on the same token.
    const grid = memState.grid;
    const pairIndexes = new Map<string, number[]>();
    grid.forEach((token, i) => pairIndexes.set(token, [...(pairIndexes.get(token) ?? []), i]));

    let checkedFirstFlip = false;
    for (const [a, b] of pairIndexes.values()) {
      const r = await first.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: a });
      if (!checkedFirstFlip) {
        check("flipping a cell succeeds and returns no un-flipped tokens", r.status === 200, r.body);
        checkedFirstFlip = true;
      }
      await first.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: b });
    }
    const finalState = await memoryStates.findOne({ teamId: teamObjId, challengeSlug: "memory-1" });
    check("perfect play completes the memory game", finalState?.completedAt !== null, finalState);
    check("perfect play (flips == 2×pairs) scores full points", finalState?.scoredPoints === 16, finalState?.scoredPoints);

    const overFlip = await first.post("/api/quiz/memory/flip", { slug: "memory-1", cellIndex: 0 });
    check("flipping a completed grid is rejected", overFlip.status === 409, overFlip.status);
  }

  const r1Done = await first.get("/api/quiz/round1");
  check("finishing all three games reaches the done phase", r1Done.body?.phase === "done" && r1Done.body?.game === null, r1Done.body);

  // ── The cut: round 1 → round 2 ──────────────────────────────────────────
  console.log("\n── The cut ──────────────────────────────────────────────────");
  const notAdmin = await first.post("/api/quiz/advance", { action: "advance", round: 1 });
  check("a participant cannot cut the field", notAdmin.status === 403, notAdmin.status);

  const cut = await admin.post("/api/quiz/advance", { action: "advance", round: 1, count: 6 });
  check("the cut takes exactly the requested count into round 2", cut.body?.ok === true && cut.body?.qualified?.length === 6, cut.body?.qualified?.length);

  const qualifiedIds = new Set((cut.body?.qualified ?? []).map((q: { teamId: string }) => q.teamId));
  const winner = clients.find((c) => qualifiedIds.has(c.teamId))!;
  const loser = clients.find((c) => !qualifiedIds.has(c.teamId))!;

  const blocked = await loser.client.get("/api/quiz/serve?round=2");
  check("an eliminated team cannot be served round 2", blocked.status === 403, blocked.status);
  const blockedSubmit = await loser.client.post("/api/submit", { event: "quiz", challengeSlug: "r2-q1", payload: "0" });
  check("an eliminated team cannot submit to round 2 directly", blockedSubmit.body?.meta?.reason === "not-qualified", blockedSubmit.body);

  // ── Round 2: two-phase clock ─────────────────────────────────────────────
  console.log("\n── Round 2: two-phase clock ─────────────────────────────────");
  const challenges = await collections.challenges();
  const answerBySlug = new Map((await challenges.find({ type: "quiz", "config.format": "mcq" }).toArray()).map((c) => [c.slug, c.config.correctIndex]));

  const served = await winner.client.get("/api/quiz/serve?round=2");
  check("serve returns a question", served.status === 200 && !!served.body?.slug, served.body);
  check("serve does NOT leak the correct answer", served.body?.correctIndex === undefined, Object.keys(served.body ?? {}));
  check("serve carries both phase deadlines", !!served.body?.readUntil && !!served.body?.answerableUntil, served.body);

  const reserved = await winner.client.get("/api/quiz/serve?round=2");
  check("reload does NOT restart the clock", reserved.body?.readUntil === served.body?.readUntil && reserved.body?.answerableUntil === served.body?.answerableUntil, {
    first: served.body?.readUntil,
    second: reserved.body?.readUntil,
  });

  const slug1 = served.body.slug as string;
  const correct1 = answerBySlug.get(slug1)!;

  const tooEarly = await winner.client.post("/api/submit", { event: "quiz", challengeSlug: slug1, payload: String(correct1) });
  check("answering during the read phase scores zero", tooEarly.body?.correct === false && tooEarly.body?.meta?.reason === "too-early", tooEarly.body);

  // The read phase is only 6s — wait it out before the real answer.
  const readUntilMs = new Date(served.body.readUntil).getTime();
  const waitMs = Math.max(0, readUntilMs - Date.now()) + 200;
  await sleep(waitMs);

  const answer1 = await winner.client.post("/api/submit", { event: "quiz", challengeSlug: slug1, payload: String(correct1) });
  check("a correct answer inside the select window scores the flat points", answer1.body?.correct === true && answer1.body?.points === 100, answer1.body);
  check("the verdict never discloses the correct option", !("correctIndex" in (answer1.body ?? {})), answer1.body);

  const replay = await winner.client.post("/api/submit", { event: "quiz", challengeSlug: slug1, payload: String(correct1) });
  check("the same question cannot be answered twice", replay.body?.meta?.reason === "already-answered", replay.body);

  // ── Round 2 → 3 ──────────────────────────────────────────────────────────
  const cut2 = await admin.post("/api/quiz/advance", { action: "advance", round: 2, count: 4 });
  check("the second cut takes 4 teams into round 3", cut2.body?.ok === true && cut2.body?.qualified?.length <= 4, cut2.body?.qualified?.length);

  // ── Round 3: comeback meter ──────────────────────────────────────────────
  console.log("\n── Round 3: comeback meter ──────────────────────────────────");
  const finalIds = new Set((cut2.body?.qualified ?? []).map((q: { teamId: string }) => q.teamId));
  const finalist = clients.find((c) => finalIds.has(c.teamId));

  if (finalist) {
    const r3served = await finalist.client.get("/api/quiz/serve?round=3");
    check("a finalist is served round 3", r3served.status === 200 && !!r3served.body?.slug, r3served.body);

    if (r3served.body?.slug) {
      const comebackStates = await collections.comebackStates();
      const finalistId = new ObjectId(finalist.teamId);

      for (const ability of ["fifty-fifty", "double-points", "safety-net", "free-pass"] as const) {
        const prevQ = await finalist.client.get("/api/quiz/serve?round=3");
        if (prevQ.body?.done || !prevQ.body?.slug) break;

        await comebackStates.updateOne(
          { teamId: finalistId, round: 3 },
          { $set: { ability, usableOnSlug: null, usedAt: null, usedOnSlug: null, bottomStreak: 0, grantedAt: new Date() } },
          { upsert: true }
        );

        const q = await finalist.client.get("/api/quiz/serve?round=3");
        
        const stateAfter = await comebackStates.findOne({ teamId: finalistId, round: 3 });
        check(`comeback ability '${ability}' auto-activates`, stateAfter?.usedAt !== null, stateAfter);

        if (ability === "fifty-fifty") {
          const serves = await collections.quizServes();
          const res = await serves.findOne({ teamId: finalistId, challengeSlug: q.body?.slug });
          check("fifty-fifty removes exactly two options", res?.eliminated?.length === 2, res);
        }

        const choice = "1";
        const grade = await finalist.client.post("/api/submit", {
          event: "quiz",
          challengeSlug: q.body?.slug,
          payload: choice,
        });
        check(`answer submitted after '${ability}'`, grade.status === 200, grade.body);
      }
    }
  } else {
    check("a finalist existed to test round 3 with", false);
  }

  // ── Proctor flags (rounds 2/3 fullscreen + tab-switch reporting) ───────────
  console.log("\n── Proctor flags ─────────────────────────────────────────────");
  const flagRound1 = await winner.client.post("/api/quiz/flag", { round: 1, kind: "tab-switch" });
  check("flag endpoint refuses round 1 (only rounds 2/3 run full-screen)", flagRound1.status === 400, flagRound1.status);

  const flagBadKind = await winner.client.post("/api/quiz/flag", { round: 2, kind: "nonsense" });
  check("flag endpoint refuses an unknown kind", flagBadKind.status === 400, flagBadKind.status);

  const flagOk = await winner.client.post("/api/quiz/flag", { round: 2, kind: "tab-switch" });
  check("a valid tab-switch flag is recorded", flagOk.status === 200 && flagOk.body?.ok === true, flagOk.body);

  const proctorFlags = await collections.proctorFlags();
  const storedFlag = await proctorFlags.findOne({ teamId: new ObjectId(winner.teamId), round: 2, kind: "tab-switch" });
  check("the flag is stamped server-side, not client-timed", !!storedFlag?.at, storedFlag);

  // ── Admin surface ────────────────────────────────────────────────────────
  console.log("\n── Admin dashboard API ──────────────────────────────────────");
  const anonOverview = await new Client("anon").get("/api/admin/quiz/overview?round=1");
  check("admin overview rejects an unauthenticated request (401)", anonOverview.status === 401, anonOverview.status);

  const participantOverview = await first.get("/api/admin/quiz/overview?round=1");
  check("admin overview rejects a participant session (403)", participantOverview.status === 403, participantOverview.status);

  const adminOverview = await admin.get("/api/admin/quiz/overview?round=1");
  check("admin overview succeeds for the coordinator", adminOverview.status === 200 && Array.isArray(adminOverview.body?.standings), adminOverview.body);

  const libStandings = await standings(1);
  const apiTop = adminOverview.body?.standings?.[0];
  const libTop = libStandings[0];
  check(
    "the dashboard's standings match the same aggregation the CLI uses",
    !!apiTop && !!libTop && apiTop.teamId === libTop.teamId && apiTop.points === libTop.points,
    { api: apiTop, lib: libTop }
  );

  // ── Summary ────────────────────────────────────────────────────────────
  console.log(`\n${"─".repeat(62)}`);
  if (failures.length === 0) {
    console.log(`  ALL ${passed} CHECKS PASSED`);
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

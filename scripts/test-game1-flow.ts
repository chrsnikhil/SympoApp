/**
 * Game 1 (Image Replication) competition-flow test, over REAL HTTP against a
 * running dev server.
 *
 * Proves the exact flow the coordinator specified:
 *   upload freely while the clock runs  ->  nothing judged  ->  timer hits
 *   zero  ->  uploads lock  ->  each team's LAST image judged exactly once.
 *
 * Prerequisites:
 *   npx tsx scripts/_tmp-mongo.ts        (mongod on 27117)
 *   npx tsx scripts/mock-vision-api.ts   (counting vision endpoint on :877)
 *   npm run dev                          (with VISION_API_URL pointed at the mock)
 *
 *   npx tsx --env-file=.env.local scripts/test-game1-flow.ts
 */
import { MongoClient, ObjectId } from "mongodb";
import { SignJWT } from "jose";

const APP = process.env.TEST_APP_URL ?? "http://localhost:3000";
const MONGO = process.env.MONGODB_URI_LOCAL ?? "mongodb://127.0.0.1:27117/xplore26";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-preview-secret-not-for-production";
const VISION_MOCK = process.env.VISION_MOCK_URL ?? "http://localhost:877";
const SLUG = "image-1";
const DURATION_MS = 210_000; // must match IMAGE_ROUND_DURATION_MS


const passed: string[] = [];
const failed: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed.push(name);
  else failed.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

function makeImage(marker: string): string {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  return `data:image/png;base64,${Buffer.concat([png, Buffer.from(`\n${marker}\n`, "latin1")]).toString("base64")}`;
}

interface Team { name: string; id: ObjectId; participant: ObjectId; cookie: string }

async function main() {
  const client = await MongoClient.connect(MONGO);
  const db = client.db("xplore26");

  const challenges = db.collection("challenges");
  const images = db.collection("prompt_images");
  const subs = db.collection("submissions");
  const scores = db.collection("score_events");

  const challenge = await challenges.findOne({ type: "quiz", slug: SLUG });
  check("Image challenge is seeded", Boolean(challenge), "run scripts/seed-quiz.ts");
  if (!challenge) { console.log("no challenge"); process.exit(1); }
  check("Single reference image is configured", Boolean(challenge.config?.referenceDataUrl),
    "run scripts/set-reference.ts");

  // ── Three teams ─────────────────────────────────────────────────────────
  const teams: Record<string, Team> = {};
  for (const [i, name] of ["G1 Alpha", "G1 Bravo", "G1 Charlie"].entries()) {
    const id = new ObjectId();
    const participant = new ObjectId();
    await db.collection("teams").insertOne({ _id: id, name, coin: 210 + i, createdAt: new Date() });
    await db.collection("participants").insertOne({
      _id: participant, teamId: id, name, role: "participant", createdAt: new Date(),
    });
    const token = await new SignJWT({ teamId: String(id), role: "participant" })
      .setProtectedHeader({ alg: "HS256" }).setSubject(String(participant))
      .setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(JWT_SECRET));
    teams[name] = { name, id, participant, cookie: `session=${token}` };
  }
  const ids = Object.values(teams).map((t) => t.id);

  const wipe = async () => {
    await images.deleteMany({ teamId: { $in: ids } });
    await subs.deleteMany({ teamId: { $in: ids } });
    await scores.deleteMany({ teamId: { $in: ids } });
  };
  await wipe();
  await fetch(`${VISION_MOCK}/__reset`, { method: "POST" }).catch(() => {});

  const upload = (t: Team, dataUrl: string) =>
    fetch(`${APP}/api/round1/submit`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: t.cookie },
      body: JSON.stringify({ challengeSlug: SLUG, dataUrl }),
    });
  const status = async (t: Team) =>
    (await fetch(`${APP}/api/round1/submit?challengeSlug=${SLUG}`, { headers: { cookie: t.cookie } })).json();
  const visionCalls = async () =>
    ((await (await fetch(`${VISION_MOCK}/__stats`)).json()) as { total: number; calls: Array<{ marker: string }> });

  // ── Clock: open the game so the timer is RUNNING ────────────────────────
  const openTimer = async () => {
    await challenges.updateOne({ _id: challenge._id }, { $set: { opensAt: new Date(Date.now() - 5_000), closesAt: null } });
  };
  const expireTimer = async () => {
    await challenges.updateOne(
      { _id: challenge._id },
      { $set: { opensAt: new Date(Date.now() - DURATION_MS - 5_000), closesAt: null } }
    );
  };

  await openTimer();

  // ── 1. Multiple uploads while the clock runs ───────────────────────────
  const alpha = teams["G1 Alpha"];
  let res = await upload(alpha, makeImage("MOCK_SIM=0.30"));
  let body = await res.json();
  check("Upload accepted while the timer runs", res.ok && body.status === "saved", JSON.stringify(body).slice(0, 140));

  for (const sim of ["0.40", "0.55", "0.70"]) {
    await upload(alpha, makeImage(`MOCK_SIM=${sim}`));
  }
  const finalRes = await upload(alpha, makeImage("MOCK_SIM=0.92"));
  check("Team can re-upload repeatedly", finalRes.ok, `status ${finalRes.status}`);

  const alphaImages = await images.find({ teamId: alpha.id, challengeSlug: SLUG }).toArray();
  check("Only ONE image row is retained per team", alphaImages.length === 1, `rows=${alphaImages.length}`);
  const retained = Buffer.from(alphaImages[0].dataUrl.replace(/^data:[^,]+,/, ""), "base64").toString("latin1");
  check("The retained image is the LATEST upload", retained.includes("MOCK_SIM=0.92"),
    retained.match(/MOCK_SIM=[0-9.]+/)?.[0] ?? "none");

  // ── 2. NOTHING is judged while the clock runs ──────────────────────────
  const midStats = await visionCalls();
  check("No evaluator was called during the timer", midStats.total === 0, `calls=${midStats.total}`);
  check("No score was written during the timer",
    (await scores.countDocuments({ teamId: { $in: ids } })) === 0);
  check("No verdict was written during the timer",
    (await subs.countDocuments({ teamId: { $in: ids }, status: "done" })) === 0);

  const mid = await status(alpha);
  check("Status while the timer runs is 'saved'", mid.status === "saved", JSON.stringify(mid).slice(0, 140));
  check("Status reports uploads unlocked", mid.locked === false);

  // ── 3. Other teams upload simultaneously ───────────────────────────────
  await Promise.all([
    upload(teams["G1 Bravo"], makeImage("MOCK_SIM=0.62")),
    upload(teams["G1 Charlie"], makeImage("MOCK_CHEAT MOCK_WATERMARK")),
  ]);
  check("Multiple teams can upload simultaneously",
    (await images.countDocuments({ challengeSlug: SLUG, teamId: { $in: ids } })) === 3);
  check("Still nothing judged after all three uploaded", (await visionCalls()).total === 0);

  // ── 4. Timer expires -> uploads lock ───────────────────────────────────
  await expireTimer();

  const lateRes = await upload(alpha, makeImage("MOCK_SIM=0.10"));
  const lateBody = await lateRes.json();
  check("Uploads are locked once the timer expires", lateRes.status === 403 && lateBody.locked === true,
    `status ${lateRes.status}`);
  const afterLate = await images.findOne({ teamId: alpha.id, challengeSlug: SLUG });
  const stillRetained = Buffer.from((afterLate?.dataUrl ?? "").replace(/^data:[^,]+,/, ""), "base64").toString("latin1");
  check("A locked-out upload does not replace the final image", stillRetained.includes("MOCK_SIM=0.92"),
    stillRetained.match(/MOCK_SIM=[0-9.]+/)?.[0] ?? "none");

  // ── 5. Finalize: exactly one evaluation per team ───────────────────────
  // All three browsers poll at once, exactly as they would on the day.
  await Promise.all([status(teams["G1 Alpha"]), status(teams["G1 Bravo"]), status(teams["G1 Charlie"])]);
  await new Promise((r) => setTimeout(r, 1500));
  await Promise.all([status(teams["G1 Alpha"]), status(teams["G1 Bravo"]), status(teams["G1 Charlie"])]);

  const stats = await visionCalls();
  check("Exactly one evaluation request per team", stats.total === 3, `calls=${stats.total}`);
  check("The evaluated image was each team's LAST one",
    stats.calls.some((c) => c.marker === "MOCK_SIM=0.92") &&
      stats.calls.some((c) => c.marker === "MOCK_SIM=0.62") &&
      stats.calls.some((c) => c.marker === "MOCK_CHEAT"),
    JSON.stringify(stats.calls.map((c) => c.marker)));
  check("No superseded upload was ever evaluated",
    !stats.calls.some((c) =>
      ["MOCK_SIM=0.30", "MOCK_SIM=0.40", "MOCK_SIM=0.55", "MOCK_SIM=0.70", "MOCK_SIM=0.10"].includes(c.marker)),
    JSON.stringify(stats.calls.map((c) => c.marker)));

  // ── 6. Scores, once each ───────────────────────────────────────────────
  const rows = await scores.find({ teamId: { $in: ids }, reason: `quiz:${SLUG}` }).toArray();
  const byTeam = new Map<string, number>();
  for (const r of rows) byTeam.set(String(r.teamId), (byTeam.get(String(r.teamId)) ?? 0) + 1);
  check("No team has duplicate score rows", [...byTeam.values()].every((n) => n === 1),
    JSON.stringify([...byTeam.entries()]));

  const alphaSub = await subs.findOne({ teamId: alpha.id, challengeId: challenge._id });
  const bravoSub = await subs.findOne({ teamId: teams["G1 Bravo"].id, challengeId: challenge._id });
  const charlieSub = await subs.findOne({ teamId: teams["G1 Charlie"].id, challengeId: challenge._id });

  // 0.92 -> 0.85 band -> 9 ; 0.62 -> 0.55 band -> 6 ; cheat -> 0
  check("Excellent recreation scores high (0.92 -> 9)", alphaSub?.verdict?.points === 9,
    `got ${alphaSub?.verdict?.points}`);
  check("Reasonable recreation scores medium (0.62 -> 6)", bravoSub?.verdict?.points === 6,
    `got ${bravoSub?.verdict?.points}`);
  check("Detected copy scores 0", charlieSub?.verdict?.points === 0, `got ${charlieSub?.verdict?.points}`);
  check("Detected copy is flagged, not silently zeroed",
    (charlieSub?.verdict?.meta as Record<string, unknown>)?.evalStatus === "rejected_watermark",
    String((charlieSub?.verdict?.meta as Record<string, unknown>)?.evalStatus));
  check("Verdict carries the judge's reason",
    typeof (alphaSub?.verdict?.meta as Record<string, unknown>)?.reason === "string",
    String((alphaSub?.verdict?.meta as Record<string, unknown>)?.reason));

  // ── 7. Re-finalizing must be a no-op ───────────────────────────────────
  // A 0-mark team writes no ledger row at all (the append-only ledger only
  // records non-zero deltas), so assert the count is UNCHANGED rather than
  // hardcoding one — the point is that re-polling adds nothing.
  const rowsBeforeRepoll = await scores.countDocuments({ teamId: { $in: ids }, reason: `quiz:${SLUG}` });
  await Promise.all(Array.from({ length: 5 }, () => status(alpha)));
  check("Re-polling after scoring makes no further evaluator calls",
    (await visionCalls()).total === 3, `calls=${(await visionCalls()).total}`);
  const rowsAfterRepoll = await scores.countDocuments({ teamId: { $in: ids }, reason: `quiz:${SLUG}` });
  check("Re-polling creates no extra score rows", rowsAfterRepoll === rowsBeforeRepoll,
    `before=${rowsBeforeRepoll} after=${rowsAfterRepoll}`);
  check("A zero-mark team writes no ledger row", rowsAfterRepoll === 2,
    `rows=${rowsAfterRepoll} (Alpha 9 + Bravo 6; Charlie scored 0)`);

  // ── 8. Leaderboard reflects the marks ──────────────────────────────────
  const board = await (await fetch(`${APP}/api/quiz/standings?round=1`)).json();
  const rowFor = (t: Team) => (board.rows ?? []).find((r: { teamId: string }) => r.teamId === String(t.id));
  check("Leaderboard shows the awarded marks", rowFor(alpha)?.points === 9, `got ${rowFor(alpha)?.points}`);
  check("Leaderboard ranks the better recreation higher",
    (rowFor(alpha)?.rank ?? 99) < (rowFor(teams["G1 Bravo"])?.rank ?? 99),
    `alpha=#${rowFor(alpha)?.rank} bravo=#${rowFor(teams["G1 Bravo"])?.rank}`);

  // ── 9. Only ONE evaluator was used ─────────────────────────────────────
  const usedModels = new Set(
    [alphaSub, bravoSub, charlieSub].map((s) => (s?.verdict?.meta as Record<string, unknown>)?.modelUsed as string)
  );
  // There is one evaluator now. This asserts every verdict came from it and
  // that nothing reached for the retired SigLIP path.
  const labels = [...usedModels].map((m) => (m ?? "").toLowerCase());

  check("Every submission recorded which evaluator judged it",
    labels.every((m) => m.length > 0), JSON.stringify([...usedModels]));
  check("Every submission was judged by the vision judge",
    labels.every((m) => m.includes("vision-judge")), JSON.stringify([...usedModels]));
  check("Nothing reached for the retired SigLIP path",
    !labels.some((m) => m.includes("siglip")), JSON.stringify([...usedModels]));

  // ── Cleanup ────────────────────────────────────────────────────────────
  await wipe();
  for (const t of Object.values(teams)) {
    await db.collection("teams").deleteOne({ _id: t.id });
    await db.collection("participants").deleteOne({ _id: t.participant });
  }
  await challenges.updateOne({ _id: challenge._id }, { $set: { opensAt: null, closesAt: null } });
  await client.close();

  console.log(`\n${"─".repeat(72)}`);
  for (const p of passed) console.log(`  PASS  ${p}`);
  for (const f of failed) console.log(`  FAIL  ${f}`);
  console.log(`${"─".repeat(72)}`);
  console.log(`  ${passed.length} passed, ${failed.length} failed\n`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

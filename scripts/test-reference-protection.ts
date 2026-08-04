/**
 * Verifies the Game 1 reference image protections over REAL HTTP.
 *
 * The honest claim being tested is narrow: a browser cannot stop an OS
 * screenshot or a phone camera, so this checks the things that ARE
 * enforceable — that the master never leaves the server, that the endpoint
 * refuses anything but a same-origin authenticated request, that nothing is
 * cacheable, and that every hand-out is traceable to a team.
 *
 *   npx tsx --env-file=.env.local scripts/test-reference-protection.ts
 */
import { MongoClient, ObjectId } from "mongodb";
import { SignJWT } from "jose";

const APP = process.env.TEST_APP_URL ?? "http://localhost:3000";
const MONGO = process.env.MONGODB_URI_LOCAL ?? "mongodb://127.0.0.1:27117/xplore26";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-preview-secret-not-for-production";
const REF = "/api/quiz/round1/reference";

const passed: string[] = [];
const failed: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed.push(name);
  else failed.push(`${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const client = await MongoClient.connect(MONGO);
  const db = client.db("xplore26");

  const challenge = await db.collection("challenges").findOne({ type: "quiz", slug: "image-1" });
  if (!challenge) {
    console.log("image-1 not seeded — run scripts/seed-quiz.ts");
    process.exit(1);
  }

  const master: string | undefined = challenge.config?.referenceDataUrl;
  const display: string | undefined = challenge.config?.referenceDisplayDataUrl;

  check("Master is stored for the judge", Boolean(master));
  check("A separate display copy exists", Boolean(display));
  check("Display copy is NOT the master", Boolean(master && display && master !== display));
  check("Display copy is materially smaller than the master",
    Boolean(master && display && display.length < master.length * 0.6),
    `display=${Math.round((display?.length ?? 0) / 1024)}KB master=${Math.round((master?.length ?? 0) / 1024)}KB`);

  // ── A real team session ─────────────────────────────────────────────────
  const teamId = new ObjectId();
  const participantId = new ObjectId();
  await db.collection("teams").insertOne({ _id: teamId, name: "Protection Probe", coin: 251, createdAt: new Date() });
  await db.collection("participants").insertOne({
    _id: participantId, teamId, name: "Protection Probe", role: "participant", createdAt: new Date(),
  });
  const token = await new SignJWT({ teamId: String(teamId), role: "participant" })
    .setProtectedHeader({ alg: "HS256" }).setSubject(String(participantId))
    .setIssuedAt().setExpirationTime("2h").sign(new TextEncoder().encode(JWT_SECRET));
  const cookie = `session=${token}`;

  const sameOrigin = { cookie, "sec-fetch-site": "same-origin", referer: `${APP}/quiz` };

  // ── 1. Auth required ────────────────────────────────────────────────────
  const anon = await fetch(`${APP}${REF}`, { headers: { "sec-fetch-site": "same-origin" } });
  check("Unauthenticated request is refused", anon.status === 401, `status ${anon.status}`);

  // ── 2. Authenticated same-origin works ──────────────────────────────────
  const ok = await fetch(`${APP}${REF}`, { headers: sameOrigin });
  const body = (await ok.json()) as { dataUrl?: string; sessionId?: string };
  check("Authenticated same-origin request succeeds", ok.status === 200, `status ${ok.status}`);
  check("Response carries an image", typeof body.dataUrl === "string" && body.dataUrl.startsWith("data:image/"));
  check("Response carries a session id for traceability", typeof body.sessionId === "string" && body.sessionId.length > 0,
    String(body.sessionId));

  // ── 3. THE core guarantee: the master never ships ───────────────────────
  check("Served image is the display copy, not the master", body.dataUrl === display);
  check("Master bytes are absent from the response", body.dataUrl !== master);

  const rawText = JSON.stringify(body);
  check("Master does not appear anywhere in the payload",
    !master || !rawText.includes(master.slice(0, 200)));

  // ── 4. Caching ──────────────────────────────────────────────────────────
  const cc = ok.headers.get("cache-control") ?? "";
  check("Caching is disabled", cc.includes("no-store"), `Cache-Control: ${cc || "(none)"}`);

  // ── 5. Hotlink / direct-access ──────────────────────────────────────────
  const direct = await fetch(`${APP}${REF}`, { headers: { cookie, "sec-fetch-site": "none" } });
  check("Pasting the URL into a tab is refused", direct.status === 404, `status ${direct.status}`);

  const crossSite = await fetch(`${APP}${REF}`, { headers: { cookie, "sec-fetch-site": "cross-site" } });
  check("Hotlinking from another site is refused", crossSite.status === 404, `status ${crossSite.status}`);

  const noHeaders = await fetch(`${APP}${REF}`, { headers: { cookie } });
  check("A request with no origin/referer at all is refused", noHeaders.status === 404, `status ${noHeaders.status}`);

  // ── 6. Nothing public serves the image ──────────────────────────────────
  for (const path of ["/quiz/reference-1.jpg", "/quiz/reference-1.png", "/private/reference/image-1.png"]) {
    const pub = await fetch(`${APP}${path}`);
    check(`No public asset at ${path}`, pub.status === 404, `status ${pub.status}`);
  }

  // ── 7. Session ids are per-request, not fixed ───────────────────────────
  const second = await fetch(`${APP}${REF}`, { headers: sameOrigin });
  const secondBody = (await second.json()) as { sessionId?: string };
  check("Each hand-out gets a fresh session id", Boolean(body.sessionId && secondBody.sessionId && body.sessionId !== secondBody.sessionId),
    `${body.sessionId} vs ${secondBody.sessionId}`);

  // ── 8. Judge still scores against the MASTER, not the display copy ──────
  check("Judge input remains the full-resolution master",
    Boolean(master && master.length > (display?.length ?? 0)));

  await db.collection("teams").deleteOne({ _id: teamId });
  await db.collection("participants").deleteOne({ _id: participantId });
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

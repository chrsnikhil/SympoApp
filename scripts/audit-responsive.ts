/**
 * Responsive audit — drives a real Chromium at every supported viewport and
 * MEASURES what breaks, rather than eyeballing the CSS.
 *
 *   npx tsx --env-file=.env.local scripts/audit-responsive.ts [--shots]
 *
 * For each page x viewport it reports:
 *   - horizontal overflow of the document (the "why is the page scrolling
 *     sideways" bug)
 *   - individual elements wider than the viewport, named so they can be fixed
 *   - tap targets under 44x44 CSS px (Apple/WCAG minimum for touch)
 *   - text smaller than 12px
 *   - dialogs/modals taller or wider than the viewport
 *
 * Pass --shots to also write PNGs into .audit-shots/ for a visual pass.
 *
 * Playwright is NOT a project dependency: its postinstall downloads several
 * hundred MB of browsers, which is dead weight on the event machine that only
 * needs to run the site. Install it just when you want to run this audit:
 *
 *   npm i -D playwright && npx playwright install chromium
 */
import { mkdirSync } from "node:fs";
import { chromium, type Page } from "playwright";
import { MongoClient, ObjectId } from "mongodb";
import { SignJWT } from "jose";

const APP = process.env.TEST_APP_URL ?? "http://localhost:3000";
const MONGO = process.env.MONGODB_URI_LOCAL ?? "mongodb://127.0.0.1:27117/xplore26";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-preview-secret-not-for-production";
const SHOTS = process.argv.includes("--shots");
const SHOT_DIR = ".audit-shots";

/** Every width the coordinator listed, plus the two landscape cases. */
const VIEWPORTS = [
  { name: "320", width: 320, height: 568 },
  { name: "375", width: 375, height: 667 },
  { name: "390", width: 390, height: 844 },
  { name: "414", width: 414, height: 896 },
  { name: "768", width: 768, height: 1024 },
  { name: "820", width: 820, height: 1180 },
  { name: "1024", width: 1024, height: 768 },
  { name: "1280", width: 1280, height: 800 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1440", width: 1440, height: 900 },
  { name: "1920", width: 1920, height: 1080 },
  { name: "land-667", width: 667, height: 375 },
  { name: "land-844", width: 844, height: 390 },
];

interface Finding {
  page: string;
  viewport: string;
  kind: string;
  detail: string;
}

const findings: Finding[] = [];

/**
 * Browser-side probe, kept as a STRING on purpose. tsx compiles with esbuild's
 * `keepNames`, which wraps every function in a `__name(...)` helper — that
 * helper doesn't exist inside the page, so a normal function argument to
 * page.evaluate dies with "__name is not defined". A string is handed to the
 * page verbatim and sidesteps the transform entirely.
 */
const PROBE = `(() => {
  var vw = document.documentElement.clientWidth;
  var docOverflow = document.documentElement.scrollWidth - vw;

  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var cls = (el.getAttribute("class") || "").split(/\\s+/).filter(Boolean).slice(0, 3).join(".");
    var id = el.id ? "#" + el.id : "";
    var txt = (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 24);
    return tag + id + (cls ? "." + cls : "") + (txt ? ' "' + txt + '"' : "");
  }

  // Elements sticking out past the edges. Anything inside a deliberately
  // scrollable container is skipped — a wide table that scrolls inside its
  // own box is correct, not a bug.
  var wide = [];
  var all = Array.prototype.slice.call(document.querySelectorAll("body *"));
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    var r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    var scrollable = false;
    var p = el.parentElement;
    while (p) {
      var ps = getComputedStyle(p);
      if (ps.overflowX === "auto" || ps.overflowX === "scroll" || ps.overflowX === "hidden") { scrollable = true; break; }
      p = p.parentElement;
    }
    if (scrollable) continue;
    wide.push(describe(el) + " [" + Math.round(r.left) + ".." + Math.round(r.right) + " vs " + vw + "]");
    if (wide.length >= 6) break;
  }

  // Touch targets — only interactive things that are actually visible.
  var small = [];
  var inter = Array.prototype.slice.call(document.querySelectorAll("button, a[href], input, select, [role=button]"));
  for (var j = 0; j < inter.length; j++) {
    var e2 = inter[j];
    var r2 = e2.getBoundingClientRect();
    if (r2.width === 0 || r2.height === 0) continue;
    var s2 = getComputedStyle(e2);
    if (s2.visibility === "hidden" || s2.display === "none" || s2.pointerEvents === "none") continue;
    if (r2.width < 44 || r2.height < 44) {
      small.push(describe(e2) + " [" + Math.round(r2.width) + "x" + Math.round(r2.height) + "]");
      if (small.length >= 6) break;
    }
  }

  // Tiny text (leaf nodes only).
  var tiny = [];
  for (var k = 0; k < all.length; k++) {
    var e3 = all[k];
    if (!e3.textContent || !e3.textContent.trim()) continue;
    if (e3.children.length > 0) continue;
    var fs = parseFloat(getComputedStyle(e3).fontSize);
    if (fs > 0 && fs < 12) {
      tiny.push(describe(e3) + " [" + fs + "px]");
      if (tiny.length >= 5) break;
    }
  }

  // Fixed/absolute panels that don't fit the viewport (modal check).
  // Skip anything an ancestor clips: the comic-page background deliberately
  // renders a slightly oversized "misprint" layer inside an overflow:hidden
  // wrapper, and flagging that buries the real findings.
  var panels = [];
  for (var m = 0; m < all.length; m++) {
    var e4 = all[m];
    var s4 = getComputedStyle(e4);
    if (s4.position !== "fixed" && s4.position !== "absolute") continue;
    var r4 = e4.getBoundingClientRect();
    if (r4.width === 0 || r4.height === 0) continue;
    if (r4.width <= vw + 1 && r4.height <= window.innerHeight + 1) continue;
    var clipped = false;
    var q = e4.parentElement;
    while (q) {
      var qs = getComputedStyle(q);
      if (qs.overflow === "hidden" || qs.overflowX === "hidden" || qs.overflowY === "hidden") { clipped = true; break; }
      q = q.parentElement;
    }
    if (clipped) continue;
    panels.push(describe(e4) + " [" + Math.round(r4.width) + "x" + Math.round(r4.height) + "]");
    if (panels.length >= 4) break;
  }

  return { docOverflow: docOverflow, wide: wide, small: small, tiny: tiny, overflowingPanels: panels, vw: vw };
})()`;

interface ProbeResult {
  docOverflow: number;
  wide: string[];
  small: string[];
  tiny: string[];
  overflowingPanels: string[];
  vw: number;
}

async function measure(page: Page, label: string, vp: string) {
  const result = (await page.evaluate(PROBE)) as ProbeResult;

  if (result.docOverflow > 1) {
    findings.push({
      page: label,
      viewport: vp,
      kind: "H-SCROLL",
      detail: `document scrolls ${result.docOverflow}px past ${result.vw}px viewport`,
    });
  }
  for (const w of result.wide) findings.push({ page: label, viewport: vp, kind: "OVERFLOW", detail: w });
  for (const s of result.small) findings.push({ page: label, viewport: vp, kind: "TAP<44", detail: s });
  for (const t of result.tiny) findings.push({ page: label, viewport: vp, kind: "TEXT<12", detail: t });
  for (const p of result.overflowingPanels) findings.push({ page: label, viewport: vp, kind: "PANEL", detail: p });
}

async function main() {
  const client = await MongoClient.connect(MONGO);
  const db = client.db("xplore26");

  // A real team session + a real admin session, so authed pages actually render.
  const teamId = new ObjectId();
  const participantId = new ObjectId();
  await db.collection("teams").insertOne({ _id: teamId, name: "Audit Team", coin: 299, createdAt: new Date() });
  await db.collection("participants").insertOne({
    _id: participantId, teamId, name: "Audit Team", role: "participant", createdAt: new Date(),
  });
  const sign = (claims: Record<string, unknown>, sub: string) =>
    new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setSubject(sub)
      .setIssuedAt().setExpirationTime("4h").sign(new TextEncoder().encode(JWT_SECRET));

  const teamToken = await sign({ teamId: String(teamId), role: "participant" }, String(participantId));

  const adminTeam = await db.collection("teams").findOne({ name: /coordinator/i });
  const adminP = adminTeam
    ? await db.collection("participants").findOne({ teamId: adminTeam._id, role: "admin" })
    : null;
  const adminToken = adminP
    ? await sign({ teamId: String(adminP.teamId), role: "admin" }, String(adminP._id))
    : null;

  const browser = await chromium.launch();
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });

  // The lobby is NOT the interesting screen. Drive the quiz into each live
  // state so the audit actually sees the game board, the reference image
  // viewer, the MCQ card with its timer and the standings table — the screens
  // most likely to break on a 320px phone.
  const quizState = db.collection("quiz_state");
  const challenges = db.collection("challenges");

  // The active round is derived from round_qualifications counts (see
  // getActiveQuizRound), NOT from quiz_state. Leaving a round-3 qualification
  // behind pins every later page to round 3, so each setup clears them first.
  const clearQualifications = async () => {
    await db.collection("round_qualifications").deleteMany({ round: { $in: [2, 3] } });
  };

  const setLobby = async () => {
    await clearQualifications();
    await quizState.updateOne(
      { _id: "quiz" as never },
      {
        $set: {
          started: false, ended: false, startedAt: null,
          round1StartedAt: null, round2StartedAt: null, round3StartedAt: null,
        },
      },
      { upsert: true }
    );
    await challenges.updateMany({ type: "quiz" }, { $set: { opensAt: null, closesAt: null } });
  };

  /** Round 1 Game 1 live, inside the first reference-viewing window. */
  const setRound1Image = async () => {
    await clearQualifications();
    const now = new Date();
    await quizState.updateOne(
      { _id: "quiz" as never },
      {
        $set: {
          started: true, ended: false, startedAt: now,
          round1StartedAt: now, round2StartedAt: null, round3StartedAt: null,
        },
      },
      { upsert: true }
    );
    await challenges.updateMany({ type: "quiz" }, { $set: { opensAt: null, closesAt: null } });
    await challenges.updateOne(
      { type: "quiz", slug: "image-1" },
      { $set: { opensAt: new Date(Date.now() - 4_000), closesAt: null } }
    );
  };

  /** Round 3 MCQ live — the question card, timer, points badge, comeback meter. */
  const setRound3 = async () => {
    await challenges.updateMany({ type: "quiz" }, { $set: { opensAt: null, closesAt: null } });
    const now = new Date();
    await quizState.updateOne(
      { _id: "quiz" as never },
      {
        $set: {
          started: true, ended: false, startedAt: now,
          round1StartedAt: new Date(now.getTime() - 7_200_000),
          round2StartedAt: new Date(now.getTime() - 3_600_000),
          round3StartedAt: now,
        },
      },
      { upsert: true }
    );
    await db.collection("round_qualifications").updateOne(
      { round: 3, teamId },
      { $set: { round: 3, teamId, rank: 1, qualifiedAt: new Date() } },
      { upsert: true }
    );
  };

  const pages: Array<{
    label: string;
    path: string;
    admin?: boolean;
    setup?: () => Promise<void>;
  }> = [
    { label: "landing", path: "/", setup: setLobby },
    { label: "enter", path: "/enter" },
    { label: "quiz-lobby", path: "/quiz", setup: setLobby },
    { label: "quiz-rules", path: "/quiz/rules" },
    { label: "game1-image", path: "/quiz", setup: setRound1Image },
    { label: "round3-mcq", path: "/quiz", setup: setRound3 },
    { label: "admin-quiz", path: "/admin/quiz", admin: true, setup: setLobby },
  ];

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      hasTouch: vp.width < 1024,
    });
    await ctx.addCookies([
      { name: "session", value: teamToken, domain: "localhost", path: "/" },
    ]);

    // The quiz sits behind a fullscreen proctor gate. Headless Chromium has no
    // real fullscreen, so the gate would hold every run on its warning card and
    // the actual game board — the screen most worth measuring — would never
    // render. Satisfy the gate's check in the PAGE only; no app code is touched
    // and nothing about this ships.
    await ctx.addInitScript(`
      Object.defineProperty(document, "fullscreenElement", {
        get: function () { return document.documentElement; },
        configurable: true,
      });
      document.documentElement.requestFullscreen = function () { return Promise.resolve(); };
    `);

    for (const p of pages) {
      if (p.admin) {
        if (!adminToken) continue;
        await ctx.clearCookies();
        await ctx.addCookies([{ name: "session", value: adminToken, domain: "localhost", path: "/" }]);
      }

      if (p.setup) {
        await p.setup();
        // The app caches quiz state for ~2-3s; wait it out so the page
        // genuinely renders the state we just set rather than a cached one.
        await new Promise((r) => setTimeout(r, 3200));
      }

      const page = await ctx.newPage();
      try {
        await page.goto(`${APP}${p.path}`, { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(1200);
        await measure(page, p.label, vp.name);
        if (SHOTS) {
          await page.screenshot({ path: `${SHOT_DIR}/${p.label}-${vp.name}.png`, fullPage: false });
        }
      } catch (err) {
        findings.push({
          page: p.label, viewport: vp.name, kind: "LOAD",
          detail: err instanceof Error ? err.message.split("\n")[0] : String(err),
        });
      }
      await page.close();

      if (p.admin) {
        await ctx.clearCookies();
        await ctx.addCookies([{ name: "session", value: teamToken, domain: "localhost", path: "/" }]);
      }
    }
    await ctx.close();
    process.stdout.write(`  ${vp.name} done\n`);
  }

  await browser.close();
  await db.collection("teams").deleteOne({ _id: teamId });
  await db.collection("participants").deleteOne({ _id: participantId });
  await client.close();

  // ── Report, grouped by kind then page ────────────────────────────────────
  console.log(`\n${"═".repeat(78)}`);
  if (findings.length === 0) {
    console.log("  No responsive issues found.");
  } else {
    const byKind = new Map<string, Finding[]>();
    for (const f of findings) {
      if (!byKind.has(f.kind)) byKind.set(f.kind, []);
      byKind.get(f.kind)!.push(f);
    }
    for (const [kind, list] of byKind) {
      console.log(`\n── ${kind} (${list.length}) ${"─".repeat(Math.max(0, 60 - kind.length))}`);
      // Collapse identical details across viewports into one line.
      const grouped = new Map<string, Set<string>>();
      for (const f of list) {
        const key = `${f.page} | ${f.detail}`;
        if (!grouped.has(key)) grouped.set(key, new Set());
        grouped.get(key)!.add(f.viewport);
      }
      for (const [key, vps] of grouped) {
        console.log(`  [${[...vps].join(",")}] ${key}`);
      }
    }
  }
  console.log(`\n${"═".repeat(78)}`);
  console.log(`  ${findings.length} finding(s) across ${VIEWPORTS.length} viewports\n`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

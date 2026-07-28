/**
 * Coordinator console for the Spider Multiverse Tech Quiz — tier 3 of the
 * three-tier control surface (dashboard → /api/quiz/advance → this).
 *
 *   npx tsx scripts/quiz-admin.ts standings 1
 *   npx tsx scripts/quiz-admin.ts advance 1              # cut round 1 → round 2
 *   npx tsx scripts/quiz-admin.ts advance 2 4             # cut round 2 → round 3, top 4
 *   npx tsx scripts/quiz-admin.ts open image-1 5          # open a 5-minute window
 *   npx tsx scripts/quiz-admin.ts coins
 *   npx tsx scripts/quiz-admin.ts reset "Team Name"
 *   npx tsx scripts/quiz-admin.ts resolve-estimate <slug>   # only if an "estimate"-format game exists
 *   npx tsx scripts/quiz-admin.ts judge image-1
 *   npx tsx scripts/quiz-admin.ts resolve-image image-1 <teamId>=0.8 <teamId>=0.5
 *
 * This talks to the database through the same functions the API uses, rather
 * than over HTTP — the fallback path for when the app server itself is
 * unreachable but the database is fine.
 */
import { ObjectId } from "mongodb";
import { collections } from "../src/lib/db/client";
import { avatarForCoin, formatCoin } from "../src/lib/quiz/avatars";
import { judgeAll, judgeAvailable } from "../src/lib/quiz/judge";
import { ROUNDS, advanceFrom, standings } from "../src/lib/quiz/rounds";
import { resolveEstimate, resolvePromptImage } from "../src/lib/quiz/scoring";
import type { QuizRound } from "../src/lib/db/types";

function table(rows: Array<Record<string, unknown>>, cols: string[]) {
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)));
  const line = (cells: string[]) => "  " + cells.map((c, i) => c.padEnd(widths[i])).join(" ");
  console.log(line(cols));
  console.log("  " + widths.map((w) => "─".repeat(w)).join(" "));
  for (const r of rows) console.log(line(cols.map((c) => String(r[c] ?? ""))));
}

async function main() {
  const [action, ...rest] = process.argv.slice(2);

  switch (action) {
    case "standings": {
      const round = Number(rest[0] ?? 1) as QuizRound;
      const rows = await standings(round);
      const spec = ROUNDS[round];
      console.log(`\n  Round ${round} — ${spec.title}`);
      if (spec.defaultAdvances) console.log(`  Default cut: top ${spec.defaultAdvances}\n`);
      table(
        rows.map((r, i) => ({ "#": i + 1, team: r.teamName, avatar: r.avatar ?? "—", points: r.points, tiebreak: `${r.tiebreakSeconds}s`, answered: r.answered })),
        ["#", "team", "avatar", "points", "tiebreak", "answered"]
      );
      break;
    }

    case "advance": {
      const round = Number(rest[0]) as QuizRound;
      const count = rest[1] ? Number(rest[1]) : undefined;
      if (![1, 2].includes(round)) throw new Error("advance takes round 1 or 2");
      const qualified = await advanceFrom(round, count);
      console.log(`\n  Cut round ${round} → ${ROUNDS[(round + 1) as QuizRound].title}\n`);
      table(
        qualified.map((q, i) => ({ "#": i + 1, team: q.teamName, points: q.points, teamId: q.teamId })),
        ["#", "team", "points", "teamId"]
      );
      console.log(`\n  ${qualified.length} teams carried through.`);
      break;
    }

    case "open": {
      const slug = rest[0];
      const minutes = Number(rest[1] ?? 5);
      if (!slug) throw new Error("open needs a slug, e.g. open image-1 5");
      const challenges = await collections.challenges();
      const opensAt = new Date();
      const closesAt = new Date(opensAt.getTime() + minutes * 60_000);
      const result = await challenges.updateOne({ type: "quiz", slug }, { $set: { opensAt, closesAt } });
      if (result.matchedCount === 0) throw new Error(`No such quiz challenge: ${slug}`);
      console.log(`\n  Opened ${slug} for ${minutes} minute(s), closes ${closesAt.toLocaleTimeString()}`);
      break;
    }

    case "coins": {
      const coins = await collections.coins();
      const teams = await collections.teams();
      const all = await coins.find({}).sort({ _id: 1 }).toArray();
      const names = new Map((await teams.find({}).toArray()).map((t) => [String(t._id), t.name]));
      const claimed = all.filter((c) => c.teamId);
      console.log(`\n  ${claimed.length} of ${all.length} coins claimed\n`);
      if (claimed.length > 0) {
        table(
          claimed.map((c) => ({ coin: formatCoin(c._id), character: avatarForCoin(c._id)?.name ?? "?", team: names.get(String(c.teamId)) ?? "?" })),
          ["coin", "character", "team"]
        );
      }
      break;
    }

    case "reset": {
      const who = rest[0];
      if (!who) throw new Error('reset needs a team name, or "all"');

      const teams = await collections.teams();
      const targets =
        who === "all"
          ? await teams.find({ name: { $ne: "Quiz Control" } }).toArray()
          : await teams.find({ name: new RegExp(`^${who}$`, "i") }).toArray();
      if (targets.length === 0) throw new Error(`No team matching "${who}"`);

      const ids = targets.map((t) => t._id!);
      const quizChallenges = await (await collections.challenges()).find({ type: "quiz" }).toArray();
      const slugs = quizChallenges.map((c) => `quiz:${c.slug}`);
      const challengeIds = quizChallenges.map((c) => c._id!);

      const [serves, subs, scores, quals, memoryStates, comebackStates, coins] = await Promise.all([
        collections.quizServes(),
        collections.submissions(),
        collections.scoreEvents(),
        collections.roundQualifications(),
        collections.memoryStates(),
        collections.comebackStates(),
        collections.coins(),
      ]);

      const r = {
        serves: (await serves.deleteMany({ teamId: { $in: ids } })).deletedCount,
        submissions: (await subs.deleteMany({ teamId: { $in: ids }, challengeId: { $in: challengeIds } })).deletedCount,
        ledgerRows: (await scores.deleteMany({ teamId: { $in: ids }, reason: { $in: slugs } })).deletedCount,
        qualifications: (await quals.deleteMany({ teamId: { $in: ids } })).deletedCount,
        memoryStates: (await memoryStates.deleteMany({ teamId: { $in: ids } })).deletedCount,
        comebackStates: (await comebackStates.deleteMany({ teamId: { $in: ids } })).deletedCount,
      };
      await coins.updateMany({ teamId: { $in: ids } }, { $set: { teamId: null, claimedAt: null } });
      await teams.updateMany({ _id: { $in: ids } }, { $unset: { avatar: "", coin: "" } });

      console.log(`\n  Reset ${targets.map((t) => t.name).join(", ")}\n`);
      table(Object.entries(r).map(([cleared, count]) => ({ cleared, count })), ["cleared", "count"]);
      console.log("\n  Coins released; teams can re-enter on any disc.");
      break;
    }

    case "resolve-estimate": {
      const slug = rest[0];
      if (!slug) throw new Error("resolve-estimate needs a slug");
      const awards = await resolveEstimate(slug);
      if (awards.length === 0) {
        console.log(`\n  Nothing outstanding for ${slug}.`);
        break;
      }
      const teams = await collections.teams();
      const names = new Map((await teams.find({}).toArray()).map((t) => [String(t._id), t.name]));
      console.log(`\n  Settled ${slug}\n`);
      table(
        awards.map((a) => ({ team: names.get(a.teamId) ?? a.teamId, guess: a.detail.guess, off_by: a.detail.error, points: a.points })),
        ["team", "guess", "off_by", "points"]
      );
      break;
    }

    case "judge": {
      const slug = rest[0] ?? "image-1";
      if (!judgeAvailable()) throw new Error("No GROQ_API_KEY set.");

      const challenges = await collections.challenges();
      const subs = await collections.submissions();
      const teams = await collections.teams();
      const imagesCol = await collections.promptImages();

      const challenge = await challenges.findOne({ type: "quiz", slug });
      if (!challenge?._id) throw new Error(`No such quiz challenge: ${slug}`);

      const reference = challenge.config.referenceDataUrl;
      if (!reference) throw new Error(`${slug} has no referenceDataUrl — npx tsx scripts/set-reference.ts ${slug} ./reference.jpg`);

      const pending = await subs.find({ challengeId: challenge._id, status: "queued" }).toArray();
      if (pending.length === 0) {
        console.log(`\n  Nothing outstanding for ${slug}.`);
        break;
      }

      const firstByTeam = new Map<string, (typeof pending)[number]>();
      for (const s of [...pending].sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime())) {
        const key = String(s.teamId);
        if (!firstByTeam.has(key)) firstByTeam.set(key, s);
      }

      const entries: Array<{ teamId: string; image: string }> = [];
      const missing: Array<{ teamId: string; reason: string }> = [];
      for (const [teamId, sub] of firstByTeam) {
        const img = sub.payload ? await imagesCol.findOne({ _id: new ObjectId(sub.payload) }) : null;
        if (!img) missing.push({ teamId, reason: "No uploaded image found" });
        else entries.push({ teamId, image: img.dataUrl });
      }

      console.log(`\n  Judging ${entries.length} image(s) for ${slug}…`);
      const { judged, failed } = await judgeAll(challenge, reference, entries);
      const allFailed = [...missing, ...failed];

      const names = new Map((await teams.find({}).toArray()).map((t) => [String(t._id), t.name]));

      if (judged.length > 0) {
        console.log("");
        table(
          judged.map((j) => ({ "#": j.rank, team: names.get(j.teamId) ?? j.teamId, score: `${Math.round(j.similarity * 100)}%` })),
          ["#", "team", "score"]
        );
        for (const j of judged) {
          console.log(`\n  ${j.rank}. ${names.get(j.teamId) ?? j.teamId} — ${j.summary}`);
          for (const c of j.criteria) console.log(`     ${c.key}: ${c.note}`);
        }
      }

      if (allFailed.length > 0) {
        await subs.deleteMany({ challengeId: challenge._id, teamId: { $in: allFailed.map((f) => new ObjectId(f.teamId)) } });
        console.log("\n  Could not score — these teams must submit again:");
        for (const f of allFailed) console.log(`    ${names.get(f.teamId) ?? f.teamId}: ${f.reason}`);
      }

      if (judged.length > 0) {
        const scores = Object.fromEntries(judged.map((j) => [j.teamId, j.similarity]));
        const awards = await resolvePromptImage(slug, scores);
        console.log("");
        table(awards.map((a) => ({ team: names.get(a.teamId) ?? a.teamId, points: a.points })), ["team", "points"]);
      }
      break;
    }

    case "resolve-image": {
      const slug = rest[0];
      if (!slug) throw new Error("resolve-image needs a slug then <teamId>=<0..1> pairs");
      const scores: Record<string, number> = {};
      for (const pair of rest.slice(1)) {
        const [id, val] = pair.split("=");
        if (!id || val === undefined) throw new Error(`Bad pair: ${pair}`);
        scores[id] = Number(val);
      }
      const awards = await resolvePromptImage(slug, scores);
      console.log(`\n  Judged ${slug}\n`);
      table(awards.map((a) => ({ teamId: a.teamId, points: a.points })), ["teamId", "points"]);
      break;
    }

    default:
      console.log(`
  Coordinator console

    standings <round>                current table for a round
    advance <1|2> [count]             make the cut into the next round
    open <slug> [minutes]             open a shared-window Round 1 game (default 5)
    coins                             which discs are out, and with whom
    reset <team|all>                  clear stats and release the coin
    resolve-estimate <slug>           settle a shared-window "closest guess" game (not used by the current lineup)
    judge [slug]                      vision-judge Image Replication (default image-1)
    resolve-image <slug> <teamId>=<0..1> …   score it by hand instead
      `);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(`\n  ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});

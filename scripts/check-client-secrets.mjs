/**
 * Fail the build if a puzzle answer can reach the browser.
 *
 * WHY THIS EXISTS AND NOT JUST THE ESLINT RULE. eslint.config.mjs already bans
 * the CODES object from `src/app/hunt/puzzles/**`, and that rule was in place
 * when a client component imported it anyway and shipped to production. The
 * rule was never wrong; nothing ran it. CI runs check:bom, tsc and build — not
 * lint — and `npm run lint` reports 79 pre-existing errors across the repo, so
 * it cannot be made a gate without a cleanup nobody should attempt the week of
 * the event. This checks the one thing that must never regress, and nothing
 * else.
 *
 * WHAT IS AND IS NOT ALLOWED. A puzzle that reveals its own answer in-scene —
 * the Mystery Room shows fragments of ARCHIVES88 as its sections open —
 * legitimately needs that one code on the client, so single bindings like
 * ROOM_CODE are fine. What is banned is the CODES *object*: a bundler cannot
 * drop unused properties of an object read by member expression, so importing
 * it for one field ships all four codes, including puzzles the team has not
 * reached yet.
 *
 * NOT CHECKED HERE: the universe word list. `src/lib/universe/words.ts` starts
 * with `import "server-only"`, which already turns any client import into a
 * hard build failure — an enforcement stronger than a regex, and one that
 * cannot produce the false positive this script would (its legitimate consumer
 * is a server component under src/app).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_ROOTS = ["src/app", "src/components"];

const BANNED = [
  [
    /import\s*\{[^}]*\bCODES\b[^}]*\}\s*from\s*["'][^"']*hunt\/codes["']/,
    "imports the CODES object, which ships all four reveal codes. Import the single binding you need (ROOM_CODE, GRID_CODE, CIPHER_CODE, CIRCUIT_CODE) — those are dropped when unused.",
  ],
];

/**
 * Strip comments before matching.
 *
 * Not cosmetic: the first version of this script failed on SixtyFourGrid.tsx,
 * whose header comment explains why it no longer imports CODES. A checker that
 * fires on the documentation of a fix teaches people to delete the
 * documentation.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(name)) yield full;
  }
}

const failures = [];
for (const root of SCAN_ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    const source = stripComments(readFileSync(file, "utf8"));
    for (const [pattern, explanation] of BANNED) {
      if (pattern.test(source)) {
        failures.push(`${relative(ROOT, file).replace(/\\/g, "/")} ${explanation}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error("\nAnswers must not reach the browser:\n");
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log("check-client-secrets: no reveal codes reachable from the client graph");

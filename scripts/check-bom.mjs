/**
 * Fail the build if any tracked text file starts with a UTF-8 BOM.
 *
 * A BOM in src/app/globals.css took production down once: Tailwind passes the
 * leading bytes of the entry stylesheet through untouched, and Lightning CSS
 * then rejects the output with "Invalid dangling combinator in selector",
 * which names neither the file nor the real cause. Windows editors and
 * PowerShell redirection both add BOMs silently, so convention is not enough —
 * this runs in CI (see .github/workflows/ci.yml).
 *
 * Usage: node scripts/check-bom.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const TEXT = /\.(css|ts|tsx|js|mjs|cjs|json|md|ya?ml|html|svg|txt)$/i;
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "buffer" })
  .toString("utf8")
  .split("\0")
  .filter((f) => f && TEXT.test(f));

const offenders = files.filter((f) => {
  try {
    const fd = readFileSync(f);
    return fd.length >= 3 && fd.subarray(0, 3).equals(BOM);
  } catch {
    // Deleted or unreadable in this checkout — not our problem to report.
    return false;
  }
});

if (offenders.length > 0) {
  console.error("UTF-8 BOM found at byte 0 of:");
  for (const f of offenders) console.error(`  ${f}`);
  console.error(
    "\nStrip it before committing. A BOM in a CSS entrypoint breaks the\n" +
      "Tailwind/Lightning CSS build with a completely unrelated error message."
  );
  process.exit(1);
}

console.log(`check-bom: ${files.length} text files clean.`);

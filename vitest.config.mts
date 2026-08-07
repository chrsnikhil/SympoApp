import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The rules that can be tested without a server or a database — the hunt's
 * framework-free modules under src/lib/hunt/, the circuit solver, the
 * shiftverse slot claim, the proxy's routing decisions — run here, in
 * milliseconds. Anything needing a live server is scripts/verify-hunt.ts's job.
 *
 * WHY .mts AND NOT .ts. This package is CommonJS (no "type": "module"), so
 * vitest `require()`s a .ts config and Vite is ESM-only — the run dies with
 * ERR_REQUIRE_ESM before a single test is collected. The .mts extension forces
 * ESM and the config loads. It was a .ts for a while and nothing noticed,
 * because nothing ran it: there was no test script and CI had no test step.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // The same "@" -> src mapping tsconfig declares. Done explicitly rather
      // than with vite-tsconfig-paths so the test run needs no extra dependency
      // to resolve an import the compiler already understands.
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws on import outside a Server Component build, which
      // is exactly what it is for — but it makes anything importing the
      // submission pipeline uncollectable, because the grader registry reaches
      // src/lib/universe/words.ts. Stubbed here so the guard keeps working in
      // `next build` while tests can still import the pipeline.
      "server-only": fileURLToPath(
        new URL("./src/lib/test/server-only-stub.ts", import.meta.url),
      ),
    },
  },
});

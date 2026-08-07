import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * WHY .mts AND NOT .ts. This package is CommonJS (no "type": "module"), so
 * vitest `require()`s a .ts config and Vite is ESM-only — the run dies with
 * ERR_REQUIRE_ESM before a single test is collected. The .mts extension forces
 * ESM and the config loads. It was a .ts, and nothing noticed because nothing
 * ran it: CI has no test step and package.json had no test script.
 *
 * The hunt's rules live in framework-free modules under src/lib/hunt/ so they
 * can be tested in milliseconds without a server or a database — see part 3 of
 * the implementation guide. Only those run here; anything needing a live
 * server is scripts/verify-hunt.ts's job.
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});

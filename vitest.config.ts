import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
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

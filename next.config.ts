import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD ? { output: "standalone" } : {}),
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io", "localhost:3000"],
  /**
   * `sharp` must be required at runtime, not bundled.
   *
   * It ships platform-specific native `.node` binaries. Webpack cannot bundle
   * those, and under `output: "standalone"` the dependency tracer decides which
   * files reach the image — native addons being the classic thing it misses.
   * Marking sharp external keeps the `require` explicit so the tracer copies the
   * package and its binaries instead of inlining an import that cannot work.
   *
   * Load-bearing since the Round 1 reference image started being dithered on
   * the server (`lib/quiz/serverDither.ts`). If sharp fails to resolve in
   * production that endpoint 500s and Game 1 has no image — and it would only
   * surface when a team first opened the round.
   */
  reactStrictMode: false,
  devIndicators: false,
  serverExternalPackages: ["sharp"],
};

export default nextConfig;

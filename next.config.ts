import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Emit a self-contained server bundle so the Docker image can be small:
   * `.next/standalone` carries only the files actually imported, instead of
   * shipping all of node_modules into the container.
   */
  output: "standalone",

  /* config options here */
};

export default nextConfig;


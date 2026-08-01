import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD ? { output: "standalone" } : {}),
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  ...(process.env.DOCKER_BUILD ? { output: "standalone" } : {}),
  allowedDevOrigins: ["*.ngrok-free.dev", "*.ngrok-free.app", "*.ngrok.io", "localhost:3000"],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

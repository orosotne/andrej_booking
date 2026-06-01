import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Docker/Kubernetes image.
  // Ignored by Vercel (which uses its own output), so it is safe in both paths.
  output: "standalone",
};

export default nextConfig;

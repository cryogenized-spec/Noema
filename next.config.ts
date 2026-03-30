import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    // Vercel may install prod-only dependencies; avoid build-time lint dependency failures.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

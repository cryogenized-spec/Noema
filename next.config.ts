import type { NextConfig } from "next";

const androidStaticExport = process.env.NOEMA_ANDROID_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The installed Android APK hosts the compiled web assets locally.
  // The regular web deployment retains server routes and is unchanged.
  ...(androidStaticExport
    ? { output: "export" as const, trailingSlash: true, images: { unoptimized: true } }
    : {}),
  eslint: {
    // Vercel may install prod-only dependencies; avoid build-time lint dependency failures.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

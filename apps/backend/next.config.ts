import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deployment — no "standalone" output (that's a desktop-Electron concern).
  serverExternalPackages: ["googleapis"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;

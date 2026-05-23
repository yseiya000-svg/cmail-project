import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for packaging the app with electron-builder: produces a minimal
  // self-contained Node server at .next/standalone/server.js
  output: "standalone",
  serverExternalPackages: ["googleapis"],
  // Avoid blowing up the build over lint warnings in the packaged app —
  // we'll catch lint issues in dev / CI rather than at release time.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;

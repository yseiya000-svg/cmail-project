import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Required for packaging the app with electron-builder: produces a minimal
  // self-contained Node server at .next/standalone/server.js
  output: "standalone",
  // In an npm workspace monorepo, Next.js places server.js nested under the
  // app's path within the standalone output (e.g. apps/desktop/server.js).
  // Setting outputFileTracingRoot to the workspace root makes Next.js trace
  // files from there and places server.js at the standalone root instead.
  outputFileTracingRoot: path.join(__dirname, "../../"),
  serverExternalPackages: ["googleapis"],
  // Avoid blowing up the build over lint warnings in the packaged app —
  // we'll catch lint issues in dev / CI rather than at release time.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;

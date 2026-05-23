import { NextResponse } from "next/server";

// Smoke-test endpoint. The iOS app pings this on startup to detect
// network issues vs. real auth/Gmail/Anthropic problems. Vercel deploy
// readiness is also verified by curling this from the CLI.

export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "cmail-backend",
    time: new Date().toISOString(),
    // Vercel injects this at runtime — useful when chasing "which deployment am I hitting"
    region: process.env.VERCEL_REGION ?? "local",
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
  });
}

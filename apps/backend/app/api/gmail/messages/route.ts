import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { listMessages } from "@/lib/gmail";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload;
  try {
    payload = await verifyMobileJwt(auth.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const labelIds = searchParams.get("labelIds")?.split(",") ?? ["INBOX"];
  const maxResults = Number(searchParams.get("maxResults") ?? 30);
  const pageToken = searchParams.get("pageToken") ?? undefined;

  try {
    const result = await listMessages(payload.accessToken, labelIds, maxResults, pageToken);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

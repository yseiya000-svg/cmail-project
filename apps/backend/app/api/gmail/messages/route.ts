import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { getValidAccessToken } from "@/lib/google-auth";
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

  let accessToken: string;
  let newJwt: string | undefined;
  try {
    ({ accessToken, newJwt } = await getValidAccessToken(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Auth refresh failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const labelIds = searchParams.get("labelIds")?.split(",") ?? ["INBOX"];
  const maxResults = Number(searchParams.get("maxResults") ?? 30);
  const pageToken = searchParams.get("pageToken") ?? undefined;

  try {
    const result = await listMessages(accessToken, labelIds, maxResults, pageToken);
    const response = NextResponse.json(result);
    if (newJwt) response.headers.set("X-Cmail-New-Token", newJwt);
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

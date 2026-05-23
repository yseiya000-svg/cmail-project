import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { getValidAccessToken } from "@/lib/google-auth";
import { getMessage } from "@/lib/gmail";

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

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const message = await getMessage(accessToken, id);
    const response = NextResponse.json({ message });
    if (newJwt) response.headers.set("X-Cmail-New-Token", newJwt);
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

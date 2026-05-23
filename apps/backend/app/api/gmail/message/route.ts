import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
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

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const message = await getMessage(payload.accessToken, id);
    return NextResponse.json({ message });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

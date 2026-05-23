import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { getValidAccessToken } from "@/lib/google-auth";
import { sendMessage } from "@/lib/gmail";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
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

  const { to, subject, body, threadId, inReplyTo, references } = await request.json();

  if (!to || !subject || body === undefined) {
    return NextResponse.json({ error: "Missing fields (to, subject, body)" }, { status: 400 });
  }

  try {
    const sent = await sendMessage(
      accessToken,
      to,
      subject,
      body,
      threadId,
      { inReplyTo, references }
    );
    const response = NextResponse.json({ ok: true, messageId: sent.id, threadId: sent.threadId });
    if (newJwt) response.headers.set("X-Cmail-New-Token", newJwt);
    return response;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

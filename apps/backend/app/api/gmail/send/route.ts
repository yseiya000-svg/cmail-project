import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
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

  const { to, subject, body, threadId, inReplyTo, references } = await request.json();

  if (!to || !subject || body === undefined) {
    return NextResponse.json({ error: "Missing fields (to, subject, body)" }, { status: 400 });
  }

  try {
    const sent = await sendMessage(
      payload.accessToken,
      to,
      subject,
      body,
      threadId,
      { inReplyTo, references }
    );
    return NextResponse.json({ ok: true, messageId: sent.id, threadId: sent.threadId });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

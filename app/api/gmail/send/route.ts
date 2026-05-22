import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, body, threadId, inReplyTo, references } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    await sendMessage(
      session.accessToken as string,
      to,
      subject,
      body,
      threadId,
      { inReplyTo, references }
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Gmail send error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

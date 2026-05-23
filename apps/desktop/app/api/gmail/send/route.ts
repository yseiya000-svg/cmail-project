import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { sendMessage, modifyMessages } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, body, threadId, inReplyTo, references, labelIds } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const sent = await sendMessage(
      session.accessToken as string,
      to,
      subject,
      body,
      threadId,
      { inReplyTo, references }
    );
    // 送信後、指定されたラベルをこの送信メッセージに付与（送信メッセージID が返ってくる場合のみ）
    if (Array.isArray(labelIds) && labelIds.length > 0 && sent?.id) {
      try {
        await modifyMessages(session.accessToken as string, [sent.id], labelIds, []);
      } catch (e) {
        console.error("post-send label apply failed:", e);
      }
    }
    return NextResponse.json({ ok: true, messageId: sent?.id });
  } catch (err: any) {
    console.error("Gmail send error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

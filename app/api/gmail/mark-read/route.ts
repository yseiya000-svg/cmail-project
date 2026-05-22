import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { modifyMessage } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

/**
 * Removes the UNREAD label from a single Gmail message. Mirrors the behavior
 * of Gmail/Outlook (open = mark read). Best-effort: errors are logged but
 * never bubbled into a UI red flag, since the local optimistic update has
 * already happened.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let messageId: string | undefined;
  try {
    const body = await req.json();
    messageId =
      typeof body?.messageId === "string" && body.messageId.length > 0
        ? body.messageId
        : undefined;
  } catch {}

  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  try {
    await modifyMessage(session.accessToken as string, messageId, [], ["UNREAD"]);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("mark-read failed:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "unknown error" },
      { status: 500 }
    );
  }
}

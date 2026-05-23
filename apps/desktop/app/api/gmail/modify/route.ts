import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { modifyMessages } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { messageIds, addLabelIds, removeLabelIds } = await req.json();
  if (!Array.isArray(messageIds) || messageIds.length === 0) {
    return NextResponse.json({ error: "messageIds required" }, { status: 400 });
  }
  try {
    await modifyMessages(
      session.accessToken as string,
      messageIds,
      Array.isArray(addLabelIds) ? addLabelIds : [],
      Array.isArray(removeLabelIds) ? removeLabelIds : []
    );
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("modify error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

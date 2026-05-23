import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { getMessage } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

/**
 * GET /api/gmail/message?id=<msgId>
 *
 * Fetches a single message in "full" format, including bodyHtml / body /
 * messageIdHeader / references. Used by the mail page after the user opens
 * a message — the inbox list is intentionally fetched with metadata only
 * for startup speed, then the body is pulled lazily on open.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const message = await getMessage(session.accessToken as string, id);
    return NextResponse.json({ message });
  } catch (err: any) {
    console.error("Gmail message error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { listMessages } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const labelIds = searchParams.get("labelIds")?.split(",") ?? ["INBOX"];
  const maxResults = Number(searchParams.get("maxResults") ?? 50);
  const pageToken = searchParams.get("pageToken") ?? undefined;

  try {
    const result = await listMessages(
      session.accessToken as string,
      labelIds,
      maxResults,
      pageToken
    );
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Gmail messages error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { generateCompose, MissingApiKeyError } from "@/lib/claude";
import { listLabels } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";
import type { ReplyTone } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, draft, tone, labelIds } = await req.json();

  let allLabels: { id: string; name: string }[] = [];
  if (Array.isArray(labelIds) && labelIds.length > 0) {
    try {
      const labels = await listLabels(session.accessToken as string);
      allLabels = labels.map((l) => ({ id: l.id, name: l.name }));
    } catch {
      // best-effort
    }
  }

  try {
    const body = await generateCompose({
      to: to || "",
      subject: subject || "",
      draft: draft || "",
      tone: (tone as ReplyTone) || "business",
      labelIds: Array.isArray(labelIds) ? labelIds : [],
      allLabels,
    });
    return NextResponse.json({ body });
  } catch (err: any) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, code: "MISSING_API_KEY" },
        { status: 400 }
      );
    }
    console.error("Claude compose error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

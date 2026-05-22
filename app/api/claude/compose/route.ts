import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { generateCompose, MissingApiKeyError } from "@/lib/claude";
import { authOptions } from "@/lib/authOptions";
import type { ReplyTone } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { to, subject, draft, tone } = await req.json();

  try {
    const body = await generateCompose({
      to: to || "",
      subject: subject || "",
      draft: draft || "",
      tone: (tone as ReplyTone) || "business",
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

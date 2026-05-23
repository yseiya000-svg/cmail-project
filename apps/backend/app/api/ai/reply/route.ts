import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { generateReply, MissingApiKeyError, type ReplyTone } from "@/lib/claude";

export const runtime = "nodejs";
// Anthropic への往復で時間がかかるので 60 秒まで許可（Vercel Hobby の上限）
export const maxDuration = 60;

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

  const aiKey = request.headers.get("x-cmail-ai-key");
  if (!aiKey) {
    return NextResponse.json(
      { error: "Anthropic API キーが必要です", code: "MISSING_API_KEY" },
      { status: 400 }
    );
  }

  const { emailFrom, emailSubject, emailBody, tone, hint } = await request.json();

  if (!emailFrom || !emailBody) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    const reply = await generateReply({
      apiKey: aiKey,
      emailFrom,
      emailSubject: emailSubject ?? "",
      emailBody,
      tone: (tone ?? "business") as ReplyTone,
      hint,
      userName: payload.name,
    });
    return NextResponse.json({ reply });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, code: "MISSING_API_KEY" },
        { status: 400 }
      );
    }
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

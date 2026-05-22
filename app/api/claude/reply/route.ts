import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { generateReply, MissingApiKeyError } from "@/lib/claude";
import { listLabels } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";
import type { ReplyTone } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { emailFrom, emailSubject, emailBody, tone, hint, labelIds } = await req.json();

  if (!emailFrom || !emailBody) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // 受信メールに付いているラベルのノートを注入するため、全ラベル一覧を取得。
  // 失敗しても返信生成自体は続行。
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
    const reply = await generateReply({
      emailFrom,
      emailSubject: emailSubject || "",
      emailBody,
      tone: (tone as ReplyTone) || "business",
      hint,
      labelIds: Array.isArray(labelIds) ? labelIds : [],
      allLabels,
    });
    return NextResponse.json({ reply });
  } catch (err: any) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, code: "MISSING_API_KEY" },
        { status: 400 }
      );
    }
    console.error("Claude reply error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

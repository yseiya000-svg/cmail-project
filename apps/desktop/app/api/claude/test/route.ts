import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/authOptions";
import { testApiKey } from "@/lib/claude";
import { getSettings } from "@/lib/settings";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ ok: false, error: "認証が必要です" }, { status: 401 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "不正なJSONです" }, { status: 400 });
  }

  // Allow testing either a candidate key (from settings page) or the stored one.
  let candidate: string | undefined =
    typeof body.aiApiKey === "string" ? body.aiApiKey.trim() : undefined;
  if (!candidate || candidate === "__keep__") {
    candidate = getSettings().aiApiKey;
  }

  if (!candidate) {
    return NextResponse.json(
      { ok: false, error: "APIキーが設定されていません" },
      { status: 400 }
    );
  }

  const result = await testApiKey(candidate);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}

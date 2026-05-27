import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { verifyMobileJwt } from "@/lib/mobile-jwt";

export const runtime = "nodejs";

/**
 * Anthropic API キーの簡易検証エンドポイント。
 * `max_tokens: 1` の "ping" を送り、200 が返れば OK とみなす。
 * モバイル設定画面の「テスト」ボタンから呼ばれる。
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    await verifyMobileJwt(auth.slice(7));
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }

  const aiKey = request.headers.get("x-cmail-ai-key");
  if (!aiKey || aiKey.length < 8) {
    return NextResponse.json(
      { ok: false, error: "キーが空、または短すぎます" },
      { status: 400 }
    );
  }

  try {
    const probe = new Anthropic({ apiKey: aiKey });
    await probe.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const e = err as { error?: { error?: { message?: string } }; message?: string };
    const msg = e?.error?.error?.message || e?.message || "不明なエラー";
    return NextResponse.json({ ok: false, error: msg });
  }
}

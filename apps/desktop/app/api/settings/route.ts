import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSettings, saveSettings, maskSettings } from "@/lib/settings";
import { isSafeUserPath } from "@/lib/path-validator";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  // Never expose the raw AI API key to the client — return a masked version.
  return NextResponse.json(maskSettings(getSettings()));
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "不正なJSONです" }, { status: 400 });
  }

  // --- Per-field validation ---
  if (body.obsidianCmailPath !== undefined) {
    const check = isSafeUserPath(body.obsidianCmailPath);
    if (!check.ok) {
      return NextResponse.json({ error: check.reason }, { status: 400 });
    }
  }

  if (body.language !== undefined) {
    const allowed = ["ja", "en", "ko", "es", "zh"];
    if (typeof body.language !== "string" || !allowed.includes(body.language)) {
      return NextResponse.json({ error: "無効な言語コードです" }, { status: 400 });
    }
  }

  if (body.theme !== undefined) {
    const allowed = ["light", "dark", "system"];
    if (typeof body.theme !== "string" || !allowed.includes(body.theme)) {
      return NextResponse.json({ error: "無効なテーマです" }, { status: 400 });
    }
  }

  if (body.obsidianSelectedFiles !== undefined) {
    if (!Array.isArray(body.obsidianSelectedFiles)) {
      return NextResponse.json(
        { error: "obsidianSelectedFiles は配列で指定してください" },
        { status: 400 }
      );
    }
    if (body.obsidianSelectedFiles.some((p: unknown) => typeof p !== "string")) {
      return NextResponse.json(
        { error: "obsidianSelectedFiles の要素は文字列のみ許可されます" },
        { status: 400 }
      );
    }
    // パストラバーサル防止: "Cmail/foo.md" 形式のみ受け付ける
    if (
      body.obsidianSelectedFiles.some(
        (p: string) => p.includes("..") || p.includes("\\") || !p.startsWith("Cmail/")
      )
    ) {
      return NextResponse.json(
        { error: "不正なファイルパスが含まれています" },
        { status: 400 }
      );
    }
  }

  if (body.aiApiKey !== undefined) {
    if (typeof body.aiApiKey !== "string") {
      return NextResponse.json({ error: "APIキーは文字列で指定してください" }, { status: 400 });
    }
    // If client sent the masked sentinel, don't overwrite the stored key.
    if (body.aiApiKey === "__keep__") {
      delete body.aiApiKey;
    } else if (body.aiApiKey.length > 0 && body.aiApiKey.length > 500) {
      return NextResponse.json({ error: "APIキーが長すぎます" }, { status: 400 });
    }
  }

  try {
    const updated = saveSettings(body);
    return NextResponse.json(maskSettings(updated));
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

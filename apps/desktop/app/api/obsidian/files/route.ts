import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listCmailMdFiles } from "@/lib/obsidian";

/**
 * Cmail/ 直下の .md ファイル一覧を返す。
 * 設定画面の「学習ファイル選択」UI のチェックボックスリストの元データ。
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }
  const files = listCmailMdFiles();
  return NextResponse.json({ files });
}

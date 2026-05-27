import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { listCmailMdFiles } from "@/lib/github";

export const runtime = "nodejs";

/**
 * Cmail/ 配下の .md ファイル一覧を返す。
 * モバイルの設定画面で「学習に使うファイル」をチェックボックス選択するために使用。
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await verifyMobileJwt(auth.slice(7));
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const files = await listCmailMdFiles();
  return NextResponse.json({ files });
}

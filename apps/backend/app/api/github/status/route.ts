import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";

export const runtime = "nodejs";

/**
 * Obsidian GitHub 連携の状態を返す（モバイル設定画面の表示専用）。
 * PAT 自体は返さず、設定状況と接続テスト結果のみを返す。
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

  const pat = process.env.GITHUB_PAT;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;

  const configured = Boolean(pat && owner && repo);

  if (!configured) {
    return NextResponse.json({
      configured: false,
      owner: owner ?? null,
      repo: repo ?? null,
      treeOk: false,
    });
  }

  // 軽量な接続テスト: HEAD ツリーの取得 (5分キャッシュなのでレート制限への影響は最小)
  let treeOk = false;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD`,
      {
        headers: {
          Authorization: `Bearer ${pat}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Cmail-Backend",
        },
        next: { revalidate: 300 },
      }
    );
    treeOk = res.ok;
  } catch {
    treeOk = false;
  }

  return NextResponse.json({
    configured: true,
    owner,
    repo,
    treeOk,
  });
}

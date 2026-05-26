import { NextRequest, NextResponse } from "next/server";
import { verifyMobileJwt } from "@/lib/mobile-jwt";
import { fetchObsidianNotes } from "@/lib/github";

export const runtime = "nodejs";

/**
 * Obsidian GitHub 連携のデバッグエンドポイント。
 * 認証必須（JWT）。環境変数の設定状況と GitHub から取得した学習データを返す。
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

  const envStatus = {
    GITHUB_PAT: process.env.GITHUB_PAT ? `set (${process.env.GITHUB_PAT.slice(0, 8)}...)` : "MISSING",
    GITHUB_OWNER: process.env.GITHUB_OWNER ?? "MISSING",
    GITHUB_REPO: process.env.GITHUB_REPO ?? "MISSING",
  };

  // GitHub API を直接叩いてツリーを取得（生のレスポンスを確認）
  let treeStatus: unknown = null;
  let treeCount = 0;
  let allMdPaths: string[] = [];

  if (process.env.GITHUB_PAT && process.env.GITHUB_OWNER && process.env.GITHUB_REPO) {
    try {
      const treeRes = await fetch(
        `https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/git/trees/HEAD?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${process.env.GITHUB_PAT}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "Cmail-Backend",
          },
          cache: "no-store",
        }
      );
      treeStatus = { ok: treeRes.ok, status: treeRes.status, statusText: treeRes.statusText };

      if (treeRes.ok) {
        const tree = await treeRes.json();
        const mdFiles = (tree.tree as Array<{ path: string; type: string }>)
          .filter((f) => f.type === "blob" && f.path.endsWith(".md"));
        treeCount = mdFiles.length;
        allMdPaths = mdFiles.slice(0, 30).map((f) => f.path);
      } else {
        const errText = await treeRes.text();
        treeStatus = { ...treeStatus as object, error: errText.slice(0, 500) };
      }
    } catch (err) {
      treeStatus = { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // fetchObsidianNotes() の実際の出力
  const learningData = await fetchObsidianNotes();

  return NextResponse.json({
    envStatus,
    treeStatus,
    treeCount,
    allMdPathsSample: allMdPaths,
    learningDataLength: learningData.length,
    learningDataPreview: learningData.slice(0, 2000),
  });
}

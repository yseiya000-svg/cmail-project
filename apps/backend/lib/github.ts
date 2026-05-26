/**
 * GitHub API 経由で Obsidian vault の .md ファイルを取得する。
 * 環境変数 GITHUB_PAT / GITHUB_OWNER / GITHUB_REPO が未設定の場合は空文字を返す。
 */

const GITHUB_PAT = process.env.GITHUB_PAT ?? "";
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";

// 取得する最大ファイル数と合計文字数の上限
const MAX_FILES = 15;
const MAX_CHARS_PER_FILE = 600;
const MAX_TOTAL_CHARS = 4500;

interface GitHubTreeItem {
  path: string;
  type: string;
  sha: string;
}

interface GitHubTree {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// AI 返信に不要なフォルダ（自動生成データ・ゴミ箱）
const EXCLUDE_PREFIXES = ["Notion/", ".trash/", ".obsidian/"];

export async function fetchObsidianNotes(): Promise<string> {
  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) return "";

  try {
    // HEAD のツリー（再帰）を取得して .md ファイルだけ抽出
    const treeRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/HEAD?recursive=1`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_PAT}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "Cmail-Backend",
        },
        // Next.js データキャッシュ：5分間キャッシュして GitHub API レート制限を回避
        next: { revalidate: 300 },
      }
    );
    if (!treeRes.ok) return "";

    const tree: GitHubTree = await treeRes.json();

    const allMd = tree.tree.filter(
      (f) =>
        f.type === "blob" &&
        f.path.endsWith(".md") &&
        !EXCLUDE_PREFIXES.some((prefix) => f.path.startsWith(prefix))
    );

    // my-preferences.md を最優先、残りはその後に並べる
    const pinned = allMd.filter((f) => f.path.includes("my-preferences"));
    const rest = allMd.filter((f) => !f.path.includes("my-preferences"));
    const mdFiles = [...pinned, ...rest].slice(0, MAX_FILES);

    if (mdFiles.length === 0) return "";

    // 各ファイルの生テキストを取得（git blobs API で SHA 指定 → raw 取得）
    const results = await Promise.all(
      mdFiles.map(async (f) => {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs/${f.sha}`,
            {
              headers: {
                Authorization: `Bearer ${GITHUB_PAT}`,
                // raw+json で Base64 デコード済みテキストを直接受け取る
                Accept: "application/vnd.github.raw+json",
                "User-Agent": "Cmail-Backend",
              },
              next: { revalidate: 300 },
            }
          );
          if (!res.ok) return null;
          const text = await res.text();
          return { path: f.path, text: text.slice(0, MAX_CHARS_PER_FILE) };
        } catch {
          return null;
        }
      })
    );

    // 合計文字数の上限まで連結
    const parts: string[] = [];
    let total = 0;
    for (const r of results) {
      if (!r) continue;
      if (total >= MAX_TOTAL_CHARS) break;
      parts.push(`### ${r.path}\n${r.text}`);
      total += r.text.length;
    }

    return parts.join("\n\n");
  } catch {
    // GitHub が落ちていても AI 返信は生成できるようにフォールバック
    return "";
  }
}

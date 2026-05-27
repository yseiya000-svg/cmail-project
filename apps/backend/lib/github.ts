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

export interface CmailMdFile {
  path: string;
  sha: string;
}

/**
 * 学習データとして使うファイルの範囲:
 *   「Cmail/」フォルダ配下の .md ファイルのみ。
 *
 * - Cmail/my-preferences.md  … 返信スタイル・好み（最優先）
 * - Cmail/contacts/*.md      … 連絡先メモ（自動管理）
 * - Cmail/labels/*.md        … ラベルごとのコンテキスト（自動管理）
 * - Cmail/（任意）.md         … ユーザーが自由に追加したノート
 *
 * → Obsidian でこのフォルダに .md を置くだけで学習データに追加できる。
 *   Notion/・Inbox/ などは一切読まない（プライバシー・サイズ対策）。
 */
const CMAIL_PREFIX = "Cmail/";

/**
 * Cmail/ 配下の .md ファイル一覧を取得する。
 * UI のファイル選択画面でも使う（設定画面のチェックボックスリストの元データ）。
 *
 * 注: contacts/ と labels/ サブフォルダは自動管理されるため除外し、
 *     Cmail/ 直下の .md のみを返す。
 */
export async function listCmailMdFiles(): Promise<CmailMdFile[]> {
  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) return [];

  try {
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
    if (!treeRes.ok) return [];

    const tree: GitHubTree = await treeRes.json();

    return tree.tree
      .filter(
        (f) =>
          f.type === "blob" &&
          f.path.endsWith(".md") &&
          f.path.startsWith(CMAIL_PREFIX) &&
          // contacts/ と labels/ は自動管理 — 一覧に出さない
          !f.path.startsWith(`${CMAIL_PREFIX}contacts/`) &&
          !f.path.startsWith(`${CMAIL_PREFIX}labels/`)
      )
      .map((f) => ({ path: f.path, sha: f.sha }));
  } catch {
    return [];
  }
}

/**
 * AI 返信生成用の学習データ文字列を組み立てる。
 *
 * @param selectedFiles  ユーザーが設定画面で選択したファイルパス。
 *                       省略 or 空配列の場合は Cmail/ 配下の全ての .md を読む（後方互換）。
 *                       指定された場合はそれだけを読む。
 */
export async function fetchObsidianNotes(selectedFiles?: string[]): Promise<string> {
  if (!GITHUB_PAT || !GITHUB_OWNER || !GITHUB_REPO) return "";

  try {
    const allMd = await listCmailMdFiles();
    if (allMd.length === 0) return "";

    // 選択リストが指定されていればそれだけに絞る（contacts/labels も含めて選択可能にしたい場合は
    // listCmailMdFiles ではなく直接ツリーから引くべきだが、現状は Cmail/ 直下のみで充分）
    const filtered =
      selectedFiles && selectedFiles.length > 0
        ? allMd.filter((f) => selectedFiles.includes(f.path))
        : allMd;

    // my-preferences.md を最優先、残りはその後に並べる
    const pinned = filtered.filter((f) => f.path.includes("my-preferences"));
    const rest = filtered.filter((f) => !f.path.includes("my-preferences"));
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

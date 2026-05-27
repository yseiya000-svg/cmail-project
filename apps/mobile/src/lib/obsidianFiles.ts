/**
 * Obsidian の学習データとして使うファイル一覧を localStorage で管理する。
 *
 * - null（保存なし）または空配列 = 「全ファイル使う」（後方互換）
 * - 配列に値が入っていればそれだけが学習に使われる
 *
 * 設定画面のチェックボックスで操作し、AI 返信送信時に
 * リクエストボディの `selectedObsidianFiles` フィールドに乗せて送る。
 */
const STORAGE_KEY = "cmail_obsidian_files";

export function getSelectedObsidianFiles(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((x): x is string => typeof x === "string");
  } catch {
    return null;
  }
}

export function setSelectedObsidianFiles(paths: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(paths));
  } catch {
    // localStorage が満杯/無効でも致命的ではない
  }
}

/**
 * AI 返信送信時にバックエンドに渡す値を組み立てる。
 * 「未設定 = 全選択」のため、未設定時は undefined を返してサーバー側のデフォルト挙動に任せる。
 */
export function getObsidianFilesForRequest(): string[] | undefined {
  const sel = getSelectedObsidianFiles();
  if (!sel || sel.length === 0) return undefined;
  return sel;
}

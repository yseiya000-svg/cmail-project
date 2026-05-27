/**
 * Cmail/ 配下の .md ファイルパスから Notion 風トグル UI 用のツリー構造を構築するヘルパー。
 *
 * 入力: ["Cmail/notes.md", "Cmail/contacts/foo.md", "Cmail/contacts/bar.md", "Cmail/projects/a/b.md"]
 * 出力: [
 *   { type: "file", name: "notes.md", path: "Cmail/notes.md" },
 *   { type: "folder", name: "contacts", path: "Cmail/contacts", children: [...] },
 *   { type: "folder", name: "projects", path: "Cmail/projects", children: [...] },
 * ]
 *
 * 同じファイルを apps/desktop/lib/fileTree.ts にもコピーしている (将来 packages/shared/ へ抽出予定)。
 */

export type TreeNode =
  | { type: "folder"; name: string; path: string; children: TreeNode[] }
  | { type: "file"; name: string; path: string };

export type FolderSelectionState = "all" | "none" | "partial";

/**
 * paths を rootPrefix の下のツリー構造に変換する。
 * フォルダは alphabetic に並び、その後ファイル alphabetic。
 */
export function buildTree(paths: string[], rootPrefix = "Cmail/"): TreeNode[] {
  // 中間表現: 各レベルで {folders: Map<name, IntermediateNode>, files: Set<path>}
  type IntermediateNode = {
    folders: Map<string, IntermediateNode>;
    files: { name: string; path: string }[];
  };

  const root: IntermediateNode = { folders: new Map(), files: [] };

  for (const fullPath of paths) {
    if (!fullPath.startsWith(rootPrefix)) continue;
    const rel = fullPath.slice(rootPrefix.length);
    const parts = rel.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let cursor = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      let child = cursor.folders.get(folderName);
      if (!child) {
        child = { folders: new Map(), files: [] };
        cursor.folders.set(folderName, child);
      }
      cursor = child;
    }

    const fileName = parts[parts.length - 1];
    cursor.files.push({ name: fileName, path: fullPath });
  }

  function materialize(node: IntermediateNode, parentPath: string): TreeNode[] {
    const folderNodes: TreeNode[] = Array.from(node.folders.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, inter]) => {
        const folderPath = parentPath ? `${parentPath}/${name}` : `${rootPrefix.replace(/\/$/, "")}/${name}`;
        return {
          type: "folder" as const,
          name,
          path: folderPath,
          children: materialize(inter, folderPath),
        };
      });
    const fileNodes: TreeNode[] = node.files
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((f) => ({ type: "file" as const, name: f.name, path: f.path }));
    return [...folderNodes, ...fileNodes];
  }

  return materialize(root, "");
}

/** ノード配下のすべてのファイルパスを再帰収集 */
export function getDescendantFiles(node: TreeNode): string[] {
  if (node.type === "file") return [node.path];
  const out: string[] = [];
  for (const child of node.children) {
    out.push(...getDescendantFiles(child));
  }
  return out;
}

/**
 * フォルダの選択状態を返す。
 *  - "all":     配下のファイルが全て selected に含まれる
 *  - "none":    配下のファイルが1つも selected に含まれない
 *  - "partial": 一部だけ含まれる (checkbox の indeterminate に対応)
 */
export function selectionStateOfFolder(
  node: TreeNode,
  selected: Set<string>
): FolderSelectionState {
  if (node.type === "file") {
    return selected.has(node.path) ? "all" : "none";
  }
  const descendants = getDescendantFiles(node);
  if (descendants.length === 0) return "none";
  let any = false;
  let all = true;
  for (const p of descendants) {
    if (selected.has(p)) any = true;
    else all = false;
  }
  if (all) return "all";
  if (any) return "partial";
  return "none";
}

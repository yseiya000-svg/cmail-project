import fs from "fs";
import path from "path";
import type { ReplyPattern, ContactNote, LabelNote } from "@/types";
import { getCmailDir } from "@/lib/settings";

const vaultPath = process.env.OBSIDIAN_VAULT_PATH || "";
const profileFile = path.join(vaultPath, "Notion", "Project Management", "About myself.md");

// ---------------------------------------------------------------------------
// フォルダ構造の初期化
// ---------------------------------------------------------------------------

const CONTACTS_SUBDIR = "contacts";
const LABELS_SUBDIR = "labels";
const PREFERENCES_FILE = "my-preferences.md";
const PATTERNS_FILE = "reply-patterns.json";

const PREFERENCES_TEMPLATE = `# Cmail - 私の返信スタイル・好み

> このファイルはCmailのAI返信生成に使われます。
> 自由に書き足してください。書いた内容がそのまま返信の精度向上に反映されます。

## 基本的なスタイル
<!-- 自分の文体・口調の特徴を書いてください -->

## やりたくないこと・避けたいこと
<!-- 返信で使いたくない表現や避けたいことを書いてください -->

## よく使うフレーズ・表現
<!-- ここに自分がよく使う言い回しを書いておくと反映されます -->

## 相手別のスタイル
<!-- 例：上司へは丁寧に、友人へはカジュアルに、など -->

## その他メモ
<!-- 何でも自由に書いてください -->
- 僕の名前は"山﨑晴哉"です。
`;

/**
 * Cmail フォルダ配下に必要なファイル・サブフォルダを作る。
 * 既存ファイルは上書きしない。冪等。
 */
export function initCmailFolderStructure(cmailDir: string): void {
  if (!cmailDir) return;
  try {
    if (!fs.existsSync(cmailDir)) fs.mkdirSync(cmailDir, { recursive: true });

    const contactsDir = path.join(cmailDir, CONTACTS_SUBDIR);
    const labelsDir = path.join(cmailDir, LABELS_SUBDIR);
    if (!fs.existsSync(contactsDir)) fs.mkdirSync(contactsDir, { recursive: true });
    if (!fs.existsSync(labelsDir)) fs.mkdirSync(labelsDir, { recursive: true });

    const preferencesPath = path.join(cmailDir, PREFERENCES_FILE);
    if (!fs.existsSync(preferencesPath)) {
      fs.writeFileSync(preferencesPath, PREFERENCES_TEMPLATE, "utf-8");
    }

    const patternsPath = path.join(cmailDir, PATTERNS_FILE);
    if (!fs.existsSync(patternsPath)) {
      fs.writeFileSync(patternsPath, "[]", "utf-8");
    }
  } catch {
    // best-effort
  }
}

function ensureCmailDir(cmailDir: string) {
  initCmailFolderStructure(cmailDir);
}

// ---------------------------------------------------------------------------
// 返信パターン（既存 + kind対応）
// ---------------------------------------------------------------------------

export function readReplyPatterns(): ReplyPattern[] {
  try {
    const cmailDir = getCmailDir();
    if (!cmailDir) return [];
    ensureCmailDir(cmailDir);
    const patternsFile = path.join(cmailDir, PATTERNS_FILE);
    if (!fs.existsSync(patternsFile)) return [];
    const raw = fs.readFileSync(patternsFile, "utf-8");
    return JSON.parse(raw) as ReplyPattern[];
  } catch {
    return [];
  }
}

export function saveReplyPattern(pattern: ReplyPattern): void {
  try {
    const cmailDir = getCmailDir();
    if (!cmailDir) return;
    ensureCmailDir(cmailDir);
    const patternsFile = path.join(cmailDir, PATTERNS_FILE);
    const patterns = readReplyPatterns();
    const existing = patterns.findIndex((p) => p.id === pattern.id);
    if (existing >= 0) {
      patterns[existing] = pattern;
    } else {
      patterns.push(pattern);
    }
    const trimmed = patterns.slice(-200);
    fs.writeFileSync(patternsFile, JSON.stringify(trimmed, null, 2), "utf-8");
  } catch {
    // skip
  }
}

// ---------------------------------------------------------------------------
// プロフィール・好み
// ---------------------------------------------------------------------------

export function readUserProfile(): string {
  try {
    if (!vaultPath || !fs.existsSync(profileFile)) return "";
    return fs.readFileSync(profileFile, "utf-8");
  } catch {
    return "";
  }
}

export function readUserPreferences(): string {
  try {
    const cmailDir = getCmailDir();
    if (!cmailDir) return "";
    const preferencesFile = path.join(cmailDir, PREFERENCES_FILE);
    if (!fs.existsSync(preferencesFile)) return "";
    return fs.readFileSync(preferencesFile, "utf-8");
  } catch {
    return "";
  }
}

export function writeUserPreferences(content: string): void {
  const cmailDir = getCmailDir();
  if (!cmailDir) throw new Error("Cmail フォルダが未設定です");
  ensureCmailDir(cmailDir);
  const preferencesFile = path.join(cmailDir, PREFERENCES_FILE);
  fs.writeFileSync(preferencesFile, content, "utf-8");
}

// ---------------------------------------------------------------------------
// Cmail/ 直下のユーザーノート（学習データ）
// ---------------------------------------------------------------------------

/**
 * 制限値: AI コンテキスト爆発を防ぐ。モバイル側 (apps/backend/lib/github.ts) と揃える。
 */
const NOTE_MAX_FILES = 15;
const NOTE_MAX_CHARS_PER_FILE = 600;
const NOTE_MAX_TOTAL_CHARS = 4500;

/**
 * Cmail/ 配下にある .md ファイルを再帰的に列挙する。
 * 設定画面のツリービュー (Notion 風トグル) の元データになる。
 * contacts/ と labels/ サブフォルダも含めて返し、UI 側でフォルダ単位の選択を可能にする。
 */
export function listCmailMdFiles(): { path: string; mtime: string }[] {
  try {
    const cmailDir = getCmailDir();
    if (!cmailDir || !fs.existsSync(cmailDir)) return [];
    const results: { path: string; mtime: string }[] = [];

    function walk(dir: string, relPrefix: string) {
      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const d of entries) {
        if (d.name.startsWith(".")) continue; // hidden
        const fullPath = path.join(dir, d.name);
        const relName = relPrefix ? `${relPrefix}/${d.name}` : d.name;
        if (d.isDirectory()) {
          walk(fullPath, relName);
        } else if (d.isFile() && d.name.endsWith(".md")) {
          let mtime = "";
          try {
            mtime = fs.statSync(fullPath).mtime.toISOString();
          } catch {
            // best-effort
          }
          // モバイル側と相対パスの体裁を揃える: "Cmail/..."（forward slash）
          results.push({ path: `Cmail/${relName}`, mtime });
        }
      }
    }

    walk(cmailDir, "");
    return results;
  } catch {
    return [];
  }
}

/**
 * 選択されたファイル群を読み、AI 返信用の学習データ文字列に組み立てる。
 *
 * @param selectedRelPaths  "Cmail/foo.md" のような相対パスの配列。
 *                          undefined / 空配列なら全ての .md を使う（後方互換）。
 *                          my-preferences.md は readUserPreferences() 側で別途扱うため、
 *                          この関数の戻り値からは除外する（重複防止）。
 */
export function readSelectedCmailNotes(selectedRelPaths?: string[]): string {
  try {
    const cmailDir = getCmailDir();
    if (!cmailDir) return "";
    const all = listCmailMdFiles();
    if (all.length === 0) return "";

    const filtered =
      selectedRelPaths && selectedRelPaths.length > 0
        ? all.filter((f) => selectedRelPaths.includes(f.path))
        : all;

    // my-preferences.md は claude.ts 側で readUserPreferences() として注入済 → ここでは除外
    const eligible = filtered.filter((f) => !f.path.endsWith(PREFERENCES_FILE));
    if (eligible.length === 0) return "";

    const parts: string[] = [];
    let total = 0;
    for (const f of eligible.slice(0, NOTE_MAX_FILES)) {
      if (total >= NOTE_MAX_TOTAL_CHARS) break;
      try {
        const full = path.join(cmailDir, f.path.replace(/^Cmail\//, ""));
        const raw = fs.readFileSync(full, "utf-8").slice(0, NOTE_MAX_CHARS_PER_FILE);
        parts.push(`### ${f.path}\n${raw}`);
        total += raw.length;
      } catch {
        // skip read errors
      }
    }

    return parts.join("\n\n");
  } catch {
    return "";
  }
}

export function getSimilarPatterns(
  emailFrom: string,
  tone: string,
  limit = 5
): ReplyPattern[] {
  const all = readReplyPatterns();
  const scored = all.map((p) => ({
    pattern: p,
    score:
      (p.emailFrom === emailFrom ? 2 : 0) +
      (p.tone === tone ? 1 : 0) +
      (!p.edited ? 1 : 0),
  }));
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.pattern);
}

// ---------------------------------------------------------------------------
// 簡易 YAML frontmatter パーサ（依存なし、シンプル）
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  meta: Record<string, string | number | boolean>;
  body: string;
}

function parseFrontmatter(raw: string): ParsedFrontmatter {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const yamlBody = match[1];
  const restBody = match[2] || "";
  const meta: Record<string, string | number | boolean> = {};
  for (const line of yamlBody.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val: string | number | boolean = m[2].trim();
    if (val === "true") val = true;
    else if (val === "false") val = false;
    else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    else {
      // strip surrounding quotes if any
      val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
    meta[key] = val;
  }
  return { meta, body: restBody };
}

function serializeFrontmatter(meta: Record<string, unknown>, body: string): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "string" && /[:#"']/.test(v)) {
      lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---", "");
  return lines.join("\n") + (body || "");
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function sanitizeEmail(email: string): string {
  return email.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function getContactsDir(): string {
  const cmailDir = getCmailDir();
  if (!cmailDir) return "";
  ensureCmailDir(cmailDir);
  return path.join(cmailDir, CONTACTS_SUBDIR);
}

function getContactPath(email: string): string {
  const dir = getContactsDir();
  if (!dir) return "";
  return path.join(dir, `${sanitizeEmail(email)}.md`);
}

export function readContact(email: string): ContactNote | null {
  try {
    const file = getContactPath(email);
    if (!file || !fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    return {
      email: String(meta.email || email),
      name: meta.name ? String(meta.name) : undefined,
      exchangeCount: typeof meta.exchangeCount === "number" ? meta.exchangeCount : undefined,
      firstSeen: meta.firstSeen ? String(meta.firstSeen) : undefined,
      lastSeen: meta.lastSeen ? String(meta.lastSeen) : undefined,
      body: body.trim(),
    };
  } catch {
    return null;
  }
}

export function writeContact(note: ContactNote): void {
  const file = getContactPath(note.email);
  if (!file) throw new Error("Cmail フォルダが未設定です");
  const meta: Record<string, unknown> = {
    email: note.email,
    name: note.name || "",
    exchangeCount: note.exchangeCount ?? 0,
    firstSeen: note.firstSeen || "",
    lastSeen: note.lastSeen || "",
  };
  const content = serializeFrontmatter(meta, note.body || "## メモ\n");
  fs.writeFileSync(file, content, "utf-8");
}

export function listContacts(): ContactNote[] {
  const dir = getContactsDir();
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf-8");
        const { meta, body } = parseFrontmatter(raw);
        return {
          email: String(meta.email || f.replace(/\.md$/, "")),
          name: meta.name ? String(meta.name) : undefined,
          exchangeCount: typeof meta.exchangeCount === "number" ? meta.exchangeCount : undefined,
          firstSeen: meta.firstSeen ? String(meta.firstSeen) : undefined,
          lastSeen: meta.lastSeen ? String(meta.lastSeen) : undefined,
          body: body.trim(),
        } as ContactNote;
      } catch {
        return null;
      }
    })
    .filter((c): c is ContactNote => c !== null);
}

/**
 * 送受信のたびに呼ぶ。連絡先ファイルが無ければ stub を作り、回数・最終日を更新する。
 * メモ本文は触らない（手動 / AI 更新ボタンで埋まる）。
 */
export function bumpContact(email: string, displayName?: string): void {
  if (!email) return;
  try {
    const existing = readContact(email);
    const now = new Date().toISOString().slice(0, 10);
    const note: ContactNote = existing
      ? {
          ...existing,
          name: existing.name || displayName,
          exchangeCount: (existing.exchangeCount || 0) + 1,
          lastSeen: now,
        }
      : {
          email,
          name: displayName,
          exchangeCount: 1,
          firstSeen: now,
          lastSeen: now,
          body: "## メモ\n（「AI で更新」ボタンを押すと、過去のやり取りからこの人の特徴・プロジェクト・口調などをまとめます）\n",
        };
    writeContact(note);
  } catch {
    // skip
  }
}

// ---------------------------------------------------------------------------
// Label notes
// ---------------------------------------------------------------------------

function sanitizeLabelName(name: string): string {
  // Windows file system に出せない文字を除去 + 空白を _ に
  return name.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 100);
}

function getLabelsDir(): string {
  const cmailDir = getCmailDir();
  if (!cmailDir) return "";
  ensureCmailDir(cmailDir);
  return path.join(cmailDir, LABELS_SUBDIR);
}

function getLabelPath(labelName: string): string {
  const dir = getLabelsDir();
  if (!dir) return "";
  return path.join(dir, `${sanitizeLabelName(labelName)}.md`);
}

export function readLabelNote(labelName: string): LabelNote | null {
  try {
    const file = getLabelPath(labelName);
    if (!file || !fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    return {
      labelId: String(meta.labelId || ""),
      labelName: String(meta.labelName || labelName),
      excludeFromLearning: meta.excludeFromLearning === true,
      body: body.trim(),
    };
  } catch {
    return null;
  }
}

export function writeLabelNote(note: LabelNote): void {
  const file = getLabelPath(note.labelName);
  if (!file) throw new Error("Cmail フォルダが未設定です");
  const meta: Record<string, unknown> = {
    labelId: note.labelId,
    labelName: note.labelName,
    excludeFromLearning: note.excludeFromLearning,
  };
  const body = note.body || "## ラベルの内容\n（このラベルが付いたメールへの返信生成時に、AI に渡す文脈をここに書いてください。例: 取り組んでいるプロジェクトの概要、相手との関係性など）\n";
  fs.writeFileSync(file, serializeFrontmatter(meta, body), "utf-8");
}

export function listLabelNotes(): LabelNote[] {
  const dir = getLabelsDir();
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      try {
        const raw = fs.readFileSync(path.join(dir, f), "utf-8");
        const { meta, body } = parseFrontmatter(raw);
        return {
          labelId: String(meta.labelId || ""),
          labelName: String(meta.labelName || f.replace(/\.md$/, "")),
          excludeFromLearning: meta.excludeFromLearning === true,
          body: body.trim(),
        } as LabelNote;
      } catch {
        return null;
      }
    })
    .filter((l): l is LabelNote => l !== null);
}

/**
 * 与えられたラベル ID 一覧のうち、対応する label note の中身を返す。
 * 名前で照合（Gmail はラベル ID と名前を両方持っている）。
 */
export function getLabelNotesByIds(labelIds: string[], allLabels: { id: string; name: string }[]): LabelNote[] {
  const names = labelIds
    .map((id) => allLabels.find((l) => l.id === id)?.name)
    .filter((n): n is string => !!n);
  const notes: LabelNote[] = [];
  for (const name of names) {
    const note = readLabelNote(name);
    if (note) notes.push(note);
  }
  return notes;
}

/**
 * ラベル名が変更されたとき、Obsidian 側のファイルもリネームする。
 * ファイルが存在しない場合は何もしない（best-effort）。
 */
export function renameLabelNote(oldName: string, newName: string): void {
  try {
    const oldPath = getLabelPath(oldName);
    const newPath = getLabelPath(newName);
    if (!oldPath || !newPath) return;
    if (!fs.existsSync(oldPath)) return;
    // 新しいパスに既存ファイルがなければリネーム、あれば上書き
    fs.renameSync(oldPath, newPath);
    // frontmatter 内の labelName も更新
    const raw = fs.readFileSync(newPath, "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    meta.labelName = newName;
    fs.writeFileSync(newPath, serializeFrontmatter(meta, body), "utf-8");
  } catch {
    // best-effort
  }
}

export function shouldExcludeFromLearning(
  labelIds: string[],
  allLabels: { id: string; name: string }[]
): boolean {
  const notes = getLabelNotesByIds(labelIds, allLabels);
  return notes.some((n) => n.excludeFromLearning);
}

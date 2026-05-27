import fs from "fs";
import path from "path";
import { isSafeUserPath } from "@/lib/path-validator";
import { initCmailFolderStructure } from "@/lib/obsidian";

/**
 * Cmail's settings file lives in the per-user app data folder when running
 * inside Electron (so packaged installations under Program Files can still
 * write to it), and falls back to the project root in dev / web mode.
 *
 * `CMAIL_USER_DATA_DIR` is injected by electron/main.js (= app.getPath('userData')).
 */
function getSettingsDir(): string {
  return process.env.CMAIL_USER_DATA_DIR || process.cwd();
}

function getSettingsFile(): string {
  return path.join(getSettingsDir(), "cmail-settings.json");
}

export interface CmailSettings {
  obsidianCmailPath: string;
  language: "ja" | "en" | "ko" | "es" | "zh";
  theme: "light" | "dark" | "system";
  /** Claude (Anthropic) API key — BYOK. Never exposed to the client in plaintext. */
  aiApiKey: string;
  /**
   * 学習データとして使う Cmail/ 直下の .md ファイルのホワイトリスト。
   * undefined / 空配列なら「全ファイル使う」（後方互換）。
   * 設定画面のチェックボックスで操作。
   */
  obsidianSelectedFiles?: string[];
}

/** Map a BCP-47-ish locale string (e.g. "en-US", "ja", "zh-Hant") onto one
 *  of Cmail's supported language codes. Falls back to English. */
function detectDefaultLanguage(): CmailSettings["language"] {
  const raw = (process.env.CMAIL_DEFAULT_LANGUAGE || "").toLowerCase();
  if (!raw) return "en";
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("ko")) return "ko";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("zh")) return "zh";
  if (raw.startsWith("en")) return "en";
  return "en";
}

const DEFAULT_SETTINGS: CmailSettings = {
  obsidianCmailPath: process.env.OBSIDIAN_VAULT_PATH
    ? path.join(process.env.OBSIDIAN_VAULT_PATH, "Main Brain", "Cmail")
    : "",
  language: detectDefaultLanguage(),
  theme: "light",
  aiApiKey: "",
  obsidianSelectedFiles: [],
};

/** One-time migration: if a legacy settings file exists in cwd, copy it into userData. */
let migrationDone = false;
function migrateLegacyIfNeeded() {
  if (migrationDone) return;
  migrationDone = true;
  const target = getSettingsFile();
  if (fs.existsSync(target)) return;
  const legacy = path.join(process.cwd(), "cmail-settings.json");
  if (legacy === target) return;
  try {
    if (fs.existsSync(legacy)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(legacy, target);
    }
  } catch {
    // best-effort
  }
}

export function getSettings(): CmailSettings {
  try {
    migrateLegacyIfNeeded();
    const file = getSettingsFile();
    if (!fs.existsSync(file)) return { ...DEFAULT_SETTINGS };
    const raw = fs.readFileSync(file, "utf-8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch: Partial<CmailSettings>): CmailSettings {
  // Defense-in-depth: re-validate path even if the API layer already checked.
  if (patch.obsidianCmailPath !== undefined) {
    const check = isSafeUserPath(patch.obsidianCmailPath);
    if (!check.ok) {
      throw new Error(check.reason || "不正なパスです");
    }
  }
  const current = getSettings();
  const updated: CmailSettings = { ...current, ...patch };
  const file = getSettingsFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(updated, null, 2), "utf-8");

  // Obsidian Cmail フォルダの中身を初回作成する（contacts/, labels/, my-preferences.md, reply-patterns.json）。
  // settings.ts ⇄ obsidian.ts の循環参照は両者とも top-level で関数を呼ばないので live binding で解決される。
  if (patch.obsidianCmailPath !== undefined && patch.obsidianCmailPath) {
    try {
      initCmailFolderStructure(patch.obsidianCmailPath);
    } catch {
      // best-effort
    }
  }

  return updated;
}

export function getCmailDir(): string {
  const settings = getSettings();
  return settings.obsidianCmailPath || "";
}

/** Strip / mask secret fields before sending settings to the client. */
export function maskSettings(s: CmailSettings): Omit<CmailSettings, "aiApiKey"> & {
  aiApiKey: string;
  aiApiKeySet: boolean;
} {
  const key = s.aiApiKey || "";
  const masked = key
    ? `${key.slice(0, 7)}…${key.slice(-4)}`
    : "";
  return {
    obsidianCmailPath: s.obsidianCmailPath,
    language: s.language,
    theme: s.theme,
    aiApiKey: masked,
    aiApiKeySet: key.length > 0,
    obsidianSelectedFiles: s.obsidianSelectedFiles ?? [],
  };
}

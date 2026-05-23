import path from "path";
import os from "os";

/**
 * Validate a user-provided filesystem path before reading/writing.
 * Blocks:
 *   - Non-absolute paths
 *   - Paths containing `..` segments
 *   - Windows system directories (C:\Windows, C:\Program Files, etc.)
 *   - The app installation directory itself (so users cannot overwrite app files)
 * Empty string is allowed (meaning "feature disabled").
 */
export function isSafeUserPath(p: unknown): { ok: boolean; reason?: string } {
  if (p === "" || p === undefined || p === null) return { ok: true };
  if (typeof p !== "string") return { ok: false, reason: "パスは文字列で指定してください" };

  // Disallow null bytes (defense in depth — Node would already reject these)
  if (p.includes("\0")) return { ok: false, reason: "無効な文字が含まれています" };

  if (!path.isAbsolute(p)) return { ok: false, reason: "絶対パスを指定してください" };

  // Normalize and check for `..` traversal segments (after normalize, none should remain
  // if the path is well-formed; if any `..` survives normalization, reject).
  const normalized = path.normalize(p);
  const segments = normalized.split(/[\\/]+/);
  if (segments.includes("..")) {
    return { ok: false, reason: "親ディレクトリ参照 (..) は使用できません" };
  }

  const lower = normalized.toLowerCase();

  // Reject Windows system / program directories outright.
  const forbiddenRoots: string[] = [];
  if (process.platform === "win32") {
    const winDir = (process.env.WINDIR || "C:\\Windows").toLowerCase();
    const sysDrive = (process.env.SYSTEMDRIVE || "C:").toLowerCase();
    const programFiles = (process.env["PROGRAMFILES"] || `${sysDrive}\\Program Files`).toLowerCase();
    const programFilesX86 = (process.env["PROGRAMFILES(X86)"] || `${sysDrive}\\Program Files (x86)`).toLowerCase();
    const programData = (process.env.PROGRAMDATA || `${sysDrive}\\ProgramData`).toLowerCase();
    forbiddenRoots.push(winDir, programFiles, programFilesX86, programData);
  } else {
    forbiddenRoots.push("/etc", "/sys", "/proc", "/dev", "/boot", "/usr/bin", "/usr/sbin", "/sbin", "/bin");
  }

  for (const root of forbiddenRoots) {
    if (lower === root || lower.startsWith(root + path.sep) || lower.startsWith(root + "/")) {
      return { ok: false, reason: `システムディレクトリ (${root}) は指定できません` };
    }
  }

  // Reject the app installation directory if known.
  // CMAIL_APP_DIR is set by electron/main.js at startup (app.getAppPath()).
  const appDir = process.env.CMAIL_APP_DIR;
  if (appDir) {
    const appLower = path.normalize(appDir).toLowerCase();
    if (lower === appLower || lower.startsWith(appLower + path.sep)) {
      return { ok: false, reason: "アプリインストールフォルダ配下は指定できません" };
    }
  }

  // Soft suggestion: warn if outside user's home directory, but allow it.
  // (Some users have Obsidian vaults on other drives — don't block them.)
  void os.homedir(); // referenced for future use; no enforcement here.

  return { ok: true };
}

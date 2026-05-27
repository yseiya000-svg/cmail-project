/**
 * モバイル PWA のユーザー設定を localStorage で永続化するヘルパー。
 *
 * BYOK 思想と整合し、デバイスごとに独立した設定を持つ。
 * （複数デバイス間の同期はやっていない。サーバー側ストレージレスを維持するため。）
 */
import type { Language } from "./i18n";

export type Theme = "light" | "dark" | "system";

const KEY_LANGUAGE = "cmail_language";
const KEY_THEME = "cmail_theme";

const LANGS: Language[] = ["ja", "en", "ko", "es", "zh"];
const THEMES: Theme[] = ["light", "dark", "system"];

function detectDefaultLanguage(): Language {
  if (typeof navigator === "undefined") return "ja";
  const raw = (navigator.language || "").toLowerCase();
  if (raw.startsWith("ja")) return "ja";
  if (raw.startsWith("ko")) return "ko";
  if (raw.startsWith("es")) return "es";
  if (raw.startsWith("zh")) return "zh";
  return "en";
}

export function getLanguage(): Language {
  try {
    const v = localStorage.getItem(KEY_LANGUAGE);
    if (v && (LANGS as string[]).includes(v)) return v as Language;
  } catch {
    // ignore
  }
  return detectDefaultLanguage();
}

export function setLanguage(l: Language): void {
  try {
    localStorage.setItem(KEY_LANGUAGE, l);
  } catch {
    // ignore
  }
}

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY_THEME);
    if (v && (THEMES as string[]).includes(v)) return v as Theme;
  } catch {
    // ignore
  }
  return "system";
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(KEY_THEME, t);
  } catch {
    // ignore
  }
}

/**
 * data-theme 属性 + lang 属性を <html> に反映する副作用。
 * SettingsContext からマウント時と変更時に呼ぶ。
 */
export function applyDocumentAttrs(language: Language, theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dataset.theme = theme;
}

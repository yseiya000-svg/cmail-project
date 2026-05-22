"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Language } from "@/lib/i18n";
import { t as translate, tf as translateFormat } from "@/lib/i18n";

export type Theme = "light" | "dark" | "system";

export interface CmailSettings {
  obsidianCmailPath: string;
  language: Language;
  theme: Theme;
  /** Masked preview of the stored key (e.g. "sk-ant-…abcd") — never the real value. */
  aiApiKey: string;
  /** True if a non-empty key is stored on the server. */
  aiApiKeySet: boolean;
}

const DEFAULTS: CmailSettings = {
  obsidianCmailPath: "",
  language: "ja",
  theme: "light",
  aiApiKey: "",
  aiApiKeySet: false,
};

interface SettingsContextValue {
  settings: CmailSettings;
  loaded: boolean;
  setLocal: (patch: Partial<CmailSettings>) => void;
  save: (patch?: Partial<CmailSettings>) => Promise<{ ok: boolean; error?: string }>;
  refresh: () => Promise<void>;
  t: (key: string) => string;
  /** Like t() but replaces {n} with the given value. */
  tf: (key: string, n: number | string) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);
  root.dataset.theme = theme;
}

function applyLanguage(lang: Language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<CmailSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const r = await fetch("/api/settings");
      if (!r.ok) throw new Error("settings fetch failed");
      const data = await r.json();
      const next = { ...DEFAULTS, ...data };
      setSettings(next);
      applyTheme(next.theme);
      applyLanguage(next.language);
    } catch {
      applyTheme(DEFAULTS.theme);
      applyLanguage(DEFAULTS.language);
    }
  }, []);

  useEffect(() => {
    fetchSettings().finally(() => setLoaded(true));
  }, [fetchSettings]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [settings.theme]);

  const setLocal = useCallback((patch: Partial<CmailSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.theme !== undefined) applyTheme(next.theme);
      if (patch.language !== undefined) applyLanguage(next.language);
      return next;
    });
  }, []);

  const save = useCallback(
    async (patch?: Partial<CmailSettings>): Promise<{ ok: boolean; error?: string }> => {
      const merged = patch ? { ...settings, ...patch } : settings;
      // Don't ship the masked aiApiKey back as-is — use the sentinel so the
      // server keeps the real value untouched unless the user actually typed
      // a new one.
      const payload: Record<string, unknown> = {
        obsidianCmailPath: merged.obsidianCmailPath,
        language: merged.language,
        theme: merged.theme,
      };
      if (patch && typeof patch.aiApiKey === "string") {
        payload.aiApiKey = patch.aiApiKey;
      }
      try {
        const res = await fetch("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data?.error || "保存に失敗しました" };
        const next = { ...DEFAULTS, ...data };
        setSettings(next);
        applyTheme(next.theme);
        applyLanguage(next.language);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message || "通信エラー" };
      }
    },
    [settings]
  );

  const t = useCallback(
    (key: string) => translate(key, settings.language),
    [settings.language]
  );

  const tf = useCallback(
    (key: string, n: number | string) => translateFormat(key, settings.language, n),
    [settings.language]
  );

  return (
    <SettingsContext.Provider
      value={{ settings, loaded, setLocal, save, refresh: fetchSettings, t, tf }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

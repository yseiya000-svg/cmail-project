import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { t as translate, tf as translateFormat, type Language } from "../lib/i18n";
import {
  applyDocumentAttrs,
  getLanguage,
  getTheme,
  setLanguage as persistLanguage,
  setTheme as persistTheme,
  type Theme,
} from "../lib/settings";

interface SettingsContextValue {
  language: Language;
  theme: Theme;
  setLanguage: (l: Language) => void;
  setTheme: (t: Theme) => void;
  t: (key: string) => string;
  tf: (key: string, n: number | string) => string;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => getLanguage());
  const [theme, setThemeState] = useState<Theme>(() => getTheme());

  // 初回マウントと変更時に <html> 属性を同期
  useEffect(() => {
    applyDocumentAttrs(language, theme);
  }, [language, theme]);

  const setLanguage = useCallback((l: Language) => {
    persistLanguage(l);
    setLanguageState(l);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    persistTheme(t);
    setThemeState(t);
  }, []);

  const t = useCallback((key: string) => translate(key, language), [language]);
  const tf = useCallback(
    (key: string, n: number | string) => translateFormat(key, language, n),
    [language]
  );

  const value = useMemo(
    () => ({ language, theme, setLanguage, setTheme, t, tf }),
    [language, theme, setLanguage, setTheme, t, tf]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

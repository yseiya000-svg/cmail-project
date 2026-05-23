import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "cmail_auth_token";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://cmail-project-backend.vercel.app";

type AuthContextType = {
  token: string | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 起動時に保存済みトークンを読み込む
    Preferences.get({ key: TOKEN_KEY }).then(({ value }) => {
      setToken(value);
      setLoading(false);
    });

    // cmail://auth/callback?token=... をキャッチ
    const listenerPromise = CapacitorApp.addListener("appUrlOpen", async (data) => {
      try {
        const url = new URL(data.url);
        if (url.hostname === "auth" && url.pathname === "/callback") {
          const incoming = url.searchParams.get("token");
          await Browser.close();
          if (incoming) {
            await Preferences.set({ key: TOKEN_KEY, value: incoming });
            setToken(incoming);
          }
        }
      } catch {
        // malformed URL は無視
      }
    });

    return () => {
      listenerPromise.then((l) => l.remove());
    };
  }, []);

  async function signIn() {
    await Browser.open({
      url: `${BACKEND_URL}/api/auth/mobile/signin`,
      presentationStyle: "popover",
    });
  }

  async function signOut() {
    await Preferences.remove({ key: TOKEN_KEY });
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

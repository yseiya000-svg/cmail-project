import { createContext, useContext, useState, type ReactNode } from "react";

const TOKEN_KEY = "cmail_auth_token";
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://cmail-project-backend.vercel.app";

type AuthContextType = {
  token: string | null;
  signIn: () => void;
  signOut: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );

  function signIn() {
    window.location.href = `${BACKEND_URL}/api/auth/mobile/signin`;
  }

  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  // OAuth コールバックページから呼ばれる
  function storeAndActivate(incoming: string) {
    localStorage.setItem(TOKEN_KEY, incoming);
    setToken(incoming);
  }

  return (
    <AuthContext.Provider value={{ token, signIn, signOut }}>
      {/* storeAndActivate は AuthCallback が直接 localStorage を操作するので不要 */}
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

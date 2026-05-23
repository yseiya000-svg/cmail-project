import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// アクセストークンをリフレッシュトークンを使って更新
async function refreshAccessToken(token: any) {
  try {
    const url = "https://oauth2.googleapis.com/token";
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + (refreshed.expires_in ?? 3600),
      // refresh_token は再発行されないことがあるため、既存のものを保持
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error("Failed to refresh access token", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
            "https://www.googleapis.com/auth/gmail.send",
            "https://www.googleapis.com/auth/gmail.labels",
            "https://www.googleapis.com/auth/gmail.modify",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // 初回サインイン時：アカウント情報をトークンに保存
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
        };
      }

      // 期限切れチェック（60秒の余裕を持たせる）
      const now = Math.floor(Date.now() / 1000);
      if (token.expiresAt && now < (token.expiresAt as number) - 60) {
        return token; // まだ有効
      }

      // 期限切れ → リフレッシュ
      if (token.refreshToken) {
        return await refreshAccessToken(token);
      }

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      (session as any).error = token.error;
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
};

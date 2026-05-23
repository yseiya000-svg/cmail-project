import { NextRequest, NextResponse } from "next/server";
import { createMobileJwt } from "@/lib/mobile-jwt";

export const runtime = "nodejs";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function errorRedirect(reason: string) {
  const mobileUrl = process.env.CMAIL_MOBILE_URL ?? "http://localhost:5173";
  return NextResponse.redirect(`${mobileUrl}/auth/callback?error=${encodeURIComponent(reason)}`);
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return errorRedirect(error ?? "no_code");
  }

  // Google へコードをトークンに交換
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXTAUTH_URL}/api/auth/mobile/callback`,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    return errorRedirect("token_exchange_failed");
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!tokens.access_token) {
    return errorRedirect("no_access_token");
  }

  // ユーザー情報を取得
  const userRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!userRes.ok) {
    return errorRedirect("userinfo_failed");
  }

  const user = await userRes.json() as { email: string; name: string };

  // モバイル用 JWT を生成してアプリにリダイレクト
  const jwt = await createMobileJwt({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? "",
    accessTokenExpiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    email: user.email,
    name: user.name,
  });

  const mobileUrl = process.env.CMAIL_MOBILE_URL ?? "http://localhost:5173";
  return NextResponse.redirect(`${mobileUrl}/auth/callback?token=${encodeURIComponent(jwt)}`);
}

import { createMobileJwt, type MobileJwtPayload } from "./mobile-jwt";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

/**
 * Google access_token が失効間近 or 失効済みなら refresh_token で更新する。
 * - 返り値の accessToken は必ず有効なもの
 * - 更新が走ったときだけ newJwt が返る（クライアントに保存し直してもらう）
 */
export async function getValidAccessToken(payload: MobileJwtPayload): Promise<{
  accessToken: string;
  newJwt?: string;
}> {
  const now = Date.now();
  const buffer = 60 * 1000; // 1分のバッファ

  if (payload.accessTokenExpiresAt && payload.accessTokenExpiresAt - buffer > now) {
    return { accessToken: payload.accessToken };
  }

  if (!payload.refreshToken) {
    throw new Error("No refresh token — user must sign in again");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: payload.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: HTTP ${res.status}`);
  }

  const tokens = await res.json() as { access_token: string; expires_in?: number };
  const newAccessToken = tokens.access_token;
  const newExpiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;

  const newJwt = await createMobileJwt({
    accessToken: newAccessToken,
    refreshToken: payload.refreshToken,
    accessTokenExpiresAt: newExpiresAt,
    email: payload.email,
    name: payload.name,
  });

  return { accessToken: newAccessToken, newJwt };
}

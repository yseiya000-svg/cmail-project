import { NextRequest, NextResponse } from "next/server";

// PWA がホストされているオリジンのみ許可
function allowedOrigins(): string[] {
  return [
    process.env.CMAIL_MOBILE_URL,
    "http://localhost:5173", // Vite dev サーバー
  ].filter((s): s is string => Boolean(s));
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  const isAllowed = !!origin && allowedOrigins().includes(origin);

  // CORS プリフライト
  if (request.method === "OPTIONS") {
    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": isAllowed ? origin : "",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  const response = NextResponse.next();
  if (isAllowed) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Vary", "Origin");
  }
  return response;
}

export const config = {
  matcher: "/api/:path*",
};

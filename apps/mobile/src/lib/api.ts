const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://cmail-project-backend.vercel.app";
const TOKEN_KEY = "cmail_auth_token";

export type Email = {
  id: string;
  threadId: string;
  subject: string;
  fromName: string;
  from: string;
  to?: string;
  snippet: string;
  date: string;
  body?: string;
  bodyHtml?: string;
  isRead: boolean;
  isStarred: boolean;
  messageIdHeader?: string;
  references?: string;
};

/**
 * バックエンドが access_token をリフレッシュした際に
 * X-Cmail-New-Token ヘッダで新しい JWT を返してくる。
 * これを localStorage に保存し、AuthContext にも通知する。
 */
function captureRefreshedToken(res: Response) {
  const newToken = res.headers.get("X-Cmail-New-Token");
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
    window.dispatchEvent(new CustomEvent("cmail-token-refresh", { detail: newToken }));
  }
}

async function authedFetch(token: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
  captureRefreshedToken(res);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res;
}

export async function fetchMessages(
  token: string,
  pageToken?: string
): Promise<{ messages: Email[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: "30" });
  if (pageToken) params.set("pageToken", pageToken);
  const res = await authedFetch(token, `${BACKEND_URL}/api/gmail/messages?${params}`);
  return res.json();
}

export async function fetchMessage(token: string, id: string): Promise<Email> {
  const res = await authedFetch(token, `${BACKEND_URL}/api/gmail/message?id=${encodeURIComponent(id)}`);
  const data = await res.json();
  return data.message;
}

export type SendParams = {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
};

export async function sendMessage(token: string, params: SendParams): Promise<void> {
  await authedFetch(token, `${BACKEND_URL}/api/gmail/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
}

export type ReplyTone = "business" | "casual" | "polite" | "brief";

export type AiReplyParams = {
  emailFrom: string;
  emailSubject: string;
  emailBody: string;
  tone: ReplyTone;
  hint?: string;
};

export async function generateAiReply(
  token: string,
  aiKey: string,
  params: AiReplyParams
): Promise<string> {
  const res = await authedFetch(token, `${BACKEND_URL}/api/ai/reply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cmail-AI-Key": aiKey,
    },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  return data.reply;
}

export async function debugObsidian(token: string): Promise<unknown> {
  const res = await authedFetch(token, `${BACKEND_URL}/api/debug/obsidian`);
  return res.json();
}

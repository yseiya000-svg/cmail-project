const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://cmail-project-backend.vercel.app";

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

export async function fetchMessages(
  token: string,
  pageToken?: string
): Promise<{ messages: Email[]; nextPageToken?: string }> {
  const params = new URLSearchParams({ maxResults: "30" });
  if (pageToken) params.set("pageToken", pageToken);

  const res = await fetch(`${BACKEND_URL}/api/gmail/messages?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
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
  const res = await fetch(`${BACKEND_URL}/api/gmail/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
}

export async function fetchMessage(token: string, id: string): Promise<Email> {
  const res = await fetch(`${BACKEND_URL}/api/gmail/message?id=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.message;
}

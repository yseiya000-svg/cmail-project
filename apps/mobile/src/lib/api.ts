const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? "https://cmail-project-backend.vercel.app";

export type Email = {
  id: string;
  threadId: string;
  subject: string;
  fromName: string;
  from: string;
  snippet: string;
  date: string;
  isRead: boolean;
  isStarred: boolean;
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

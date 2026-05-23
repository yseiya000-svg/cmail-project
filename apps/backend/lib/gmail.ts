import { google } from "googleapis";
import he from "he";
import type { EmailMessage } from "@/types";

function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.gmail({ version: "v1", auth });
}

function decodeBase64Url(str: string): string {
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";
  function walk(part: any) {
    if (!part) return;
    if (part.mimeType === "text/plain" && part.body?.data) {
      text = decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      html = decodeBase64Url(part.body.data);
    } else if (part.parts) {
      part.parts.forEach(walk);
    }
  }
  walk(payload);
  return { text, html };
}

function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^(.*?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/"/g, ""), email: match[2] };
  return { name: from, email: from };
}

function buildEmailMessage(msg: any): EmailMessage {
  const headers = msg.payload?.headers || [];
  const get = (name: string) =>
    headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

  const from = get("From");
  const { name: fromName, email: fromEmail } = parseFrom(from);
  const hasBody = !!msg.payload && (!!msg.payload.body?.data || !!msg.payload.parts);
  const { text, html } = hasBody ? extractBody(msg.payload) : { text: "", html: "" };
  const snippet = he.decode(msg.snippet || "");

  return {
    id: msg.id!,
    threadId: msg.threadId!,
    subject: get("Subject") || "(件名なし)",
    from: fromEmail,
    fromName,
    to: get("To"),
    date: get("Date"),
    snippet,
    body: hasBody ? (text || he.decode(html.replace(/<[^>]+>/g, ""))) : undefined,
    bodyHtml: html || undefined,
    isRead: !msg.labelIds?.includes("UNREAD"),
    isStarred: msg.labelIds?.includes("STARRED") ?? false,
    labelIds: msg.labelIds || [],
    messageIdHeader: get("Message-ID") || get("Message-Id") || undefined,
    references: get("References") || undefined,
  };
}

export async function listMessages(
  accessToken: string,
  labelIds: string[] = ["INBOX"],
  maxResults = 30,
  pageToken?: string
): Promise<{ messages: EmailMessage[]; nextPageToken?: string }> {
  const gmail = getGmailClient(accessToken);

  const listRes = await gmail.users.messages.list({
    userId: "me",
    labelIds,
    maxResults,
    pageToken,
  });

  const ids = listRes.data.messages || [];
  if (ids.length === 0) return { messages: [] };

  const metadataHeaders = ["From", "To", "Subject", "Date", "Message-ID", "References"];
  const details = await Promise.all(
    ids.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "metadata",
        metadataHeaders,
      })
    )
  );

  return {
    messages: details.map((res) => buildEmailMessage(res.data)),
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

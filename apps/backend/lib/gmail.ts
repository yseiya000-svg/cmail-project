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

/**
 * 非 ASCII を含むヘッダ値を RFC 2047 "encoded-word" でラップ。
 * これがないと Subject / To が文字化けする受信側がある。
 */
function encodeHeaderWord(text: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

function encodeAddressHeader(value: string): string {
  return value
    .split(",")
    .map((entry) => {
      const trimmed = entry.trim();
      const m = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
      if (m) {
        const name = m[1].replace(/^"|"$/g, "");
        const addr = m[2];
        return name ? `${encodeHeaderWord(name)} <${addr}>` : `<${addr}>`;
      }
      return encodeHeaderWord(trimmed);
    })
    .join(", ");
}

export interface SendReplyHeaders {
  inReplyTo?: string;
  references?: string;
}

export async function sendMessage(
  accessToken: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string,
  replyHeaders?: SendReplyHeaders
): Promise<{ id?: string; threadId?: string }> {
  const gmail = getGmailClient(accessToken);

  function normalizeMessageId(id: string | undefined): string {
    if (!id) return "";
    const trimmed = id.trim();
    if (!trimmed) return "";
    return /^<.*>$/.test(trimmed) ? trimmed : `<${trimmed}>`;
  }

  const inReplyTo = normalizeMessageId(replyHeaders?.inReplyTo);
  const refsChain = [replyHeaders?.references?.trim(), inReplyTo]
    .filter(Boolean)
    .join(" ")
    .trim();

  const headerLines: string[] = [
    `To: ${encodeAddressHeader(to)}`,
    `Subject: ${encodeHeaderWord(subject)}`,
    "Content-Type: text/plain; charset=utf-8",
    "MIME-Version: 1.0",
    "Content-Transfer-Encoding: 8bit",
  ];
  if (inReplyTo) headerLines.push(`In-Reply-To: ${inReplyTo}`);
  if (refsChain) headerLines.push(`References: ${refsChain}`);

  const raw = Buffer.from([...headerLines, "", body].join("\r\n"), "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw, threadId },
  });
  return { id: res.data.id ?? undefined, threadId: res.data.threadId ?? undefined };
}

export async function getMessage(accessToken: string, id: string): Promise<EmailMessage> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.messages.get({
    userId: "me",
    id,
    format: "full",
  });
  return buildEmailMessage(res.data);
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

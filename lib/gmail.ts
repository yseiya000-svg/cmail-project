import { google } from "googleapis";
import he from "he";
import type { EmailMessage, GmailLabel } from "@/types";

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

export async function listMessages(
  accessToken: string,
  labelIds: string[] = ["INBOX"],
  maxResults = 50,
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

  const details = await Promise.all(
    ids.map((m) =>
      gmail.users.messages.get({
        userId: "me",
        id: m.id!,
        format: "full",
      })
    )
  );

  const messages: EmailMessage[] = details.map((res) => {
    const msg = res.data;
    const headers = msg.payload?.headers || [];
    const get = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || "";

    const from = get("From");
    const { name: fromName, email: fromEmail } = parseFrom(from);
    const { text, html } = extractBody(msg.payload);
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
      body: text || he.decode(html.replace(/<[^>]+>/g, "")),
      bodyHtml: html || undefined,
      isRead: !msg.labelIds?.includes("UNREAD"),
      isStarred: msg.labelIds?.includes("STARRED") ?? false,
      labelIds: msg.labelIds || [],
      messageIdHeader: get("Message-ID") || get("Message-Id") || undefined,
      references: get("References") || undefined,
    };
  });

  return {
    messages,
    nextPageToken: listRes.data.nextPageToken ?? undefined,
  };
}

/**
 * Wraps a header value in an RFC 2047 "encoded-word" if it contains any
 * non-ASCII byte. Without this, raw UTF-8 in a Subject / To header is
 * decoded as Latin-1 by mail clients and shows up as mojibake (Ã£Â€Â…).
 */
function encodeHeaderWord(text: string): string {
  // Fast path: pure ASCII is allowed verbatim by RFC 5322.
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(text)) return text;
  const b64 = Buffer.from(text, "utf-8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}

/**
 * Encodes an address-list header value (To, Cc, ...). If the value has the
 * "Display Name <addr@host>" form, only the display name is wrapped — the
 * angle-bracketed address must remain ASCII for SMTP. Plain addresses pass
 * through unchanged.
 */
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
  /** Original "Message-ID:" of the email we're replying to. Must keep the
   *  surrounding angle brackets. Without this, the recipient's mail client
   *  treats the reply as a brand-new message instead of part of the thread. */
  inReplyTo?: string;
  /** Existing "References:" chain from the original message (or empty). */
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

  // Normalize the Message-ID — Gmail sometimes returns it with extra
  // whitespace or missing brackets. Threading is strict on the spec form.
  function normalizeMessageId(id: string | undefined): string {
    if (!id) return "";
    const trimmed = id.trim();
    if (!trimmed) return "";
    return /^<.*>$/.test(trimmed) ? trimmed : `<${trimmed}>`;
  }

  const inReplyTo = normalizeMessageId(replyHeaders?.inReplyTo);
  // References should be the chain so far + the message we're replying to.
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

  const emailLines = [...headerLines, "", body];

  const raw = Buffer.from(emailLines.join("\r\n"), "utf-8")
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

export async function listLabels(accessToken: string): Promise<GmailLabel[]> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.labels.list({ userId: "me" });
  return (res.data.labels || []).map((l) => ({
    id: l.id!,
    name: l.name!,
    type: l.type || "user",
    messagesUnread: l.messagesUnread ?? 0,
    messagesTotal: l.messagesTotal ?? 0,
  }));
}

export async function modifyMessage(
  accessToken: string,
  messageId: string,
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
}

/** 複数メッセージを一括でラベル変更（追加・削除）。 */
export async function modifyMessages(
  accessToken: string,
  messageIds: string[],
  addLabelIds: string[] = [],
  removeLabelIds: string[] = []
): Promise<void> {
  const gmail = getGmailClient(accessToken);
  // Gmail にはバッチ batchModify があるのでそれを使う（1リクエスト最大 1000 件）
  await gmail.users.messages.batchModify({
    userId: "me",
    requestBody: {
      ids: messageIds,
      addLabelIds,
      removeLabelIds,
    },
  });
}

export async function createLabel(
  accessToken: string,
  name: string
): Promise<GmailLabel> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.labels.create({
    userId: "me",
    requestBody: {
      name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    },
  });
  const l = res.data;
  return {
    id: l.id!,
    name: l.name!,
    type: l.type || "user",
    messagesUnread: 0,
    messagesTotal: 0,
  };
}

export async function deleteLabel(accessToken: string, id: string): Promise<void> {
  const gmail = getGmailClient(accessToken);
  await gmail.users.labels.delete({ userId: "me", id });
}

export async function patchLabel(
  accessToken: string,
  id: string,
  name: string
): Promise<GmailLabel> {
  const gmail = getGmailClient(accessToken);
  const res = await gmail.users.labels.patch({
    userId: "me",
    id,
    requestBody: { name },
  });
  const l = res.data;
  return {
    id: l.id!,
    name: l.name!,
    type: l.type || "user",
    messagesUnread: 0,
    messagesTotal: 0,
  };
}

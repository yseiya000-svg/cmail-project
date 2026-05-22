export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  snippet: string;
  body: string;
  bodyHtml?: string;
  isRead: boolean;
  isStarred: boolean;
  labelIds: string[];
  /** Original "Message-ID:" header (incl. angle brackets) — needed so our
   *  reply's In-Reply-To/References cause the recipient's mail client to
   *  thread it instead of treating it as a brand-new message. */
  messageIdHeader?: string;
  /** Space-separated chain from the original "References:" header. */
  references?: string;
}

export interface GmailLabel {
  id: string;
  name: string;
  type: string;
  messagesUnread?: number;
  messagesTotal?: number;
}

export interface ReplyPattern {
  id: string;
  date: string;
  emailSubject: string;
  emailFrom: string;
  tone: ReplyTone;
  hint: string;
  aiGenerated: string;
  finalSent: string;
  edited: boolean;
}

export type ReplyTone = "business" | "casual" | "polite" | "brief";

export const TONE_LABELS: Record<ReplyTone, string> = {
  business: "ビジネス",
  casual: "カジュアル",
  polite: "丁寧",
  brief: "簡潔",
};

export interface AccountInfo {
  email: string;
  name: string;
  image?: string;
  accessToken: string;
}

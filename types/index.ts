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
  /** 返信時：受信者のメール、送信時：宛先のメール */
  emailFrom: string;
  tone: ReplyTone;
  hint: string;
  aiGenerated: string;
  finalSent: string;
  edited: boolean;
  /** "reply"（既存）or "compose"（新規送信）。未指定は "reply" 扱い */
  kind?: "reply" | "compose";
}

/** Contact note — frontmatter + メモ本文（contacts/<email>.md に保存） */
export interface ContactNote {
  email: string;
  name?: string;
  exchangeCount?: number;
  firstSeen?: string;
  lastSeen?: string;
  /** Markdown ボディ — AI 生成の特徴・プロジェクト・口調メモなど */
  body: string;
}

/** Label note — frontmatter + ラベルの内容（labels/<name>.md に保存） */
export interface LabelNote {
  labelId: string;
  labelName: string;
  excludeFromLearning: boolean;
  /** Markdown ボディ — このラベルが付くメールに注入する文脈 */
  body: string;
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

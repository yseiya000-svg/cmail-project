export interface EmailMessage {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  fromName: string;
  to: string;
  date: string;
  snippet: string;
  body?: string;
  bodyHtml?: string;
  isRead: boolean;
  isStarred: boolean;
  labelIds: string[];
  messageIdHeader?: string;
  references?: string;
}

import Anthropic from "@anthropic-ai/sdk";

export class MissingApiKeyError extends Error {
  code = "MISSING_API_KEY" as const;
  constructor() {
    super("AI API キーが設定されていません");
  }
}

export type ReplyTone = "business" | "casual" | "polite" | "brief";

const TONE_INSTRUCTIONS: Record<ReplyTone, string> = {
  business: "ビジネスメールとして丁寧かつ簡潔に、敬語を使って書いてください。",
  casual: "フレンドリーで自然な口調で書いてください。",
  polite: "非常に丁寧で礼儀正しい文体で書いてください。",
  brief: "要点だけを短くまとめて書いてください。",
};

/**
 * モバイル版の返信生成。デスクトップ版と違って Obsidian の学習データは
 * 持ち込めないので、純粋にメール内容 + トーン + ヒントだけで生成する。
 */
export async function generateReply(params: {
  apiKey: string;
  emailFrom: string;
  emailSubject: string;
  emailBody: string;
  tone: ReplyTone;
  hint?: string;
  userName?: string;
}): Promise<string> {
  if (!params.apiKey) throw new MissingApiKeyError();

  const client = new Anthropic({ apiKey: params.apiKey });

  const systemPrompt = `あなたは${params.userName || "ユーザー"}のメール返信アシスタントです。
ユーザーに代わって自然で適切なメール返信文を作成します。

【厳守ルール】
- 返信の本文のみを出力してください（挨拶から署名まで）。
- 件名（Subject）は出力しないでください。「件名：」「Subject:」「Re:」で始まる行を本文の先頭に書いてはいけません。
- 「返信:」「以下が返信です:」などの前置き・メタコメントは一切不要です。
- 出力は受信者にそのまま送信できる完成形である必要があります。

${TONE_INSTRUCTIONS[params.tone]}`;

  const userMessage = `以下のメールへの返信を作成してください。

## 受信メール
送信者: ${params.emailFrom}
件名: ${params.emailSubject}
本文:
${params.emailBody}
${params.hint ? `\n## 返信のヒント\n${params.hint}` : ""}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (!block || block.type !== "text") throw new Error("Unexpected response type");
  return stripLeadingSubject(block.text);
}

function stripLeadingSubject(text: string): string {
  const lines = text.split(/\r?\n/);
  const subjectLine = /^\s*(件名|subject)\s*[:：]/i;
  while (lines.length > 0 && (subjectLine.test(lines[0]) || lines[0].trim() === "")) {
    lines.shift();
  }
  return lines.join("\n").trimStart();
}

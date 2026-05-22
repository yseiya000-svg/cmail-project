import Anthropic from "@anthropic-ai/sdk";
import { getSimilarPatterns, readUserProfile, readUserPreferences } from "./obsidian";
import { getSettings } from "./settings";
import type { ReplyTone } from "@/types";

/** Throws a typed error if no API key is configured. */
export class MissingApiKeyError extends Error {
  code = "MISSING_API_KEY" as const;
  constructor() {
    super("AI APIキーが設定されていません。設定画面から登録してください。");
  }
}

function getAnthropicClient(): Anthropic {
  // Priority: per-user setting (BYOK) > .env fallback (dev convenience).
  const fromSettings = getSettings().aiApiKey?.trim();
  const apiKey = fromSettings || process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) throw new MissingApiKeyError();
  return new Anthropic({ apiKey });
}

const TONE_INSTRUCTIONS: Record<ReplyTone, string> = {
  business: "ビジネスメールとして丁寧かつ簡潔に、敬語を使って書いてください。",
  casual: "フレンドリーで自然な口調で書いてください。",
  polite: "非常に丁寧で礼儀正しい文体で書いてください。",
  brief: "要点だけを短くまとめて書いてください。",
};

export async function generateReply(params: {
  emailFrom: string;
  emailSubject: string;
  emailBody: string;
  tone: ReplyTone;
  hint?: string;
}): Promise<string> {
  const { emailFrom, emailSubject, emailBody, tone, hint } = params;

  const client = getAnthropicClient();

  const userProfile = readUserProfile();
  const userPreferences = readUserPreferences();
  const similarPatterns = getSimilarPatterns(emailFrom, tone, 5);

  const patternContext =
    similarPatterns.length > 0
      ? `\n## 過去の返信パターン（学習済み）\n` +
        similarPatterns
          .map(
            (p, i) =>
              `### パターン${i + 1}（${p.edited ? "ユーザーが編集して送信" : "AIのままで送信"}）\n受信件名: ${p.emailSubject}\n実際に送った返信:\n${p.finalSent}`
          )
          .join("\n\n")
      : "";

  const profileContext = userProfile
    ? `\n## ユーザープロフィール\n${userProfile.slice(0, 600)}`
    : "";

  const preferencesContext = userPreferences
    ? `\n## ユーザーの返信スタイル・好み（最優先で反映すること）\n${userPreferences}`
    : "";

  const systemPrompt = `あなたは山崎 Seiya のメール返信アシスタントです。
ユーザーに代わって自然で適切なメール返信文を作成します。

【厳守ルール】
- 返信の本文のみを出力してください（挨拶から署名まで）。
- 件名（Subject）は出力しないでください。「件名：」「Subject:」「Re:」で始まる行を本文の先頭に書いてはいけません。件名は別途システムが付与します。
- 「返信:」「以下が返信です:」などの前置き・メタコメントは一切不要です。
- 出力は受信者にそのまま送信できる完成形である必要があります。

${TONE_INSTRUCTIONS[tone]}
${preferencesContext}
${profileContext}
${patternContext}`;

  const userMessage = `以下のメールへの返信を作成してください。

## 受信メール
送信者: ${emailFrom}
件名: ${emailSubject}
本文:
${emailBody}
${hint ? `\n## 返信のヒント\n${hint}` : ""}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });

  const block = response.content[0];
  if (block.type !== "text") throw new Error("Unexpected response type");
  return stripLeadingSubject(block.text);
}

/**
 * Belt-and-suspenders: even with the system prompt, a model will occasionally
 * lead with a "件名:" / "Subject:" line. The subject is set elsewhere — strip
 * any such header lines from the very top of the reply.
 */
function stripLeadingSubject(text: string): string {
  const lines = text.split(/\r?\n/);
  const subjectLine = /^\s*(件名|subject)\s*[:：]/i;
  while (lines.length > 0 && (subjectLine.test(lines[0]) || lines[0].trim() === "")) {
    lines.shift();
  }
  return lines.join("\n").trimStart();
}

/** Lightweight key probe used by /api/claude/test. Returns true on success. */
export async function testApiKey(candidate: string): Promise<{ ok: boolean; error?: string }> {
  if (!candidate || candidate.length < 8) {
    return { ok: false, error: "キーが空、または短すぎます" };
  }
  try {
    const probe = new Anthropic({ apiKey: candidate });
    await probe.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
    });
    return { ok: true };
  } catch (err: any) {
    const msg = err?.error?.error?.message || err?.message || "不明なエラー";
    return { ok: false, error: msg };
  }
}

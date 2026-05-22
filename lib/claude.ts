import Anthropic from "@anthropic-ai/sdk";
import {
  getSimilarPatterns,
  readUserProfile,
  readUserPreferences,
  writeUserPreferences,
  readContact,
  writeContact,
  readReplyPatterns,
  getLabelNotesByIds,
} from "./obsidian";
import { getSettings } from "./settings";
import type { ReplyTone, ContactNote, LabelNote } from "@/types";

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

function buildContactContext(email: string): string {
  if (!email) return "";
  const note = readContact(email);
  if (!note || !note.body) return "";
  return `\n## 相手の情報（連絡先ノート）\n相手: ${note.name || note.email}\n${note.body.slice(0, 800)}`;
}

function buildLabelContext(notes: LabelNote[]): string {
  if (!notes.length) return "";
  const sections = notes
    .filter((n) => n.body && n.body.trim().length > 0)
    .map((n) => `### ラベル「${n.labelName}」\n${n.body.slice(0, 800)}`);
  if (!sections.length) return "";
  return `\n## このメールに付いているラベルの文脈\n${sections.join("\n\n")}`;
}

export async function generateReply(params: {
  emailFrom: string;
  emailSubject: string;
  emailBody: string;
  tone: ReplyTone;
  hint?: string;
  /** 受信メールの labelIds と全ラベル一覧（ラベルノート注入用） */
  labelIds?: string[];
  allLabels?: { id: string; name: string }[];
}): Promise<string> {
  const { emailFrom, emailSubject, emailBody, tone, hint, labelIds, allLabels } = params;

  const client = getAnthropicClient();

  const userProfile = readUserProfile();
  const userPreferences = readUserPreferences();
  const similarPatterns = getSimilarPatterns(emailFrom, tone, 5);
  const contactContext = buildContactContext(emailFrom);
  const labelNotes = labelIds && allLabels ? getLabelNotesByIds(labelIds, allLabels) : [];
  const labelContext = buildLabelContext(labelNotes);

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
${contactContext}
${labelContext}
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

export async function generateCompose(params: {
  to: string;
  subject: string;
  draft: string;
  tone: ReplyTone;
  /** 送信時に既に付けるラベル ID 一覧（プロジェクト文脈の注入用） */
  labelIds?: string[];
  allLabels?: { id: string; name: string }[];
}): Promise<string> {
  const { to, subject, draft, tone, labelIds, allLabels } = params;

  const client = getAnthropicClient();

  const userProfile = readUserProfile();
  const userPreferences = readUserPreferences();
  const contactContext = buildContactContext(to);
  const labelNotes = labelIds && allLabels ? getLabelNotesByIds(labelIds, allLabels) : [];
  const labelContext = buildLabelContext(labelNotes);

  const profileContext = userProfile
    ? `\n## ユーザープロフィール\n${userProfile.slice(0, 600)}`
    : "";

  const preferencesContext = userPreferences
    ? `\n## ユーザーの文章スタイル・好み（最優先で反映すること）\n${userPreferences}`
    : "";

  const systemPrompt = `あなたは山崎 Seiya のメール作成アシスタントです。
ユーザーが書いた下書きやヒントをもとに、送信できる完成形のメール本文を作成します。

【厳守ルール】
- 本文のみを出力してください（挨拶から署名まで）。
- 件名（Subject）は出力しないでください。「件名：」「Subject:」で始まる行を書いてはいけません。
- 「以下がメール本文です:」などの前置き・メタコメントは一切不要です。
- 出力は受信者にそのまま送信できる完成形である必要があります。

${TONE_INSTRUCTIONS[tone]}
${preferencesContext}
${profileContext}
${contactContext}
${labelContext}`;

  const userMessage = `以下の情報をもとに、メール本文を作成してください。

宛先: ${to || "（未入力）"}
件名: ${subject || "（未入力）"}
${draft ? `\n下書き・ヒント:\n${draft}` : "（下書きなし — 件名から推測して作成してください）"}`;

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
 * その相手とのやり取り履歴 (reply-patterns.json) を Claude に分析させ、
 * 連絡先ノートの本文 (Markdown) を生成して保存する。
 */
export async function analyzeContact(email: string, displayName?: string): Promise<ContactNote> {
  if (!email) throw new Error("メールアドレスが指定されていません");

  const client = getAnthropicClient();
  const allPatterns = readReplyPatterns();
  const own = allPatterns.filter((p) => p.emailFrom === email);

  const existing = readContact(email);

  if (own.length === 0) {
    const note: ContactNote = {
      email,
      name: displayName || existing?.name,
      exchangeCount: existing?.exchangeCount ?? 0,
      firstSeen: existing?.firstSeen,
      lastSeen: existing?.lastSeen,
      body: "## メモ\n（まだやり取りがないため AI が分析できる情報がありません）\n",
    };
    writeContact(note);
    return note;
  }

  const samples = own
    .slice(-15)
    .map(
      (p, i) =>
        `--- ${i + 1}件目 (${p.kind === "compose" ? "新規送信" : "返信"}, ${p.date.slice(0, 10)}) ---\n件名: ${p.emailSubject}\n相手の文 / 文脈ヒント: ${p.hint || "(なし)"}\nSeiya が送った文:\n${p.finalSent.slice(0, 600)}`
    )
    .join("\n\n");

  const prompt = `以下は山崎 Seiya が「${displayName || email}」（${email}）と交わしたメールの記録です。
これを読み、この相手についての連絡先ノートを書いてください。

【出力フォーマット（Markdown のみ。前置きやコードフェンス禁止）】
## メモ

### 基本情報
- 推測される所属 / 役職:
- 想定される関係性:

### 取り組んでいるプロジェクト・話題
- （箇条書き）

### コミュニケーション傾向
- Seiya 側がよく取るトーン:
- 文の長さ・特徴:
- この人特有の話題・関心:

### 注意点 / メモ
- （ある場合のみ）

---
やり取り履歴：
${samples}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1200,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  const body = block.type === "text" ? block.text.trim() : "## メモ\n（生成失敗）";

  const note: ContactNote = {
    email,
    name: displayName || existing?.name,
    exchangeCount: existing?.exchangeCount ?? own.length,
    firstSeen: existing?.firstSeen,
    lastSeen: existing?.lastSeen || new Date().toISOString().slice(0, 10),
    body,
  };
  writeContact(note);
  return note;
}

/**
 * `reply-patterns.json` 全件を Claude に分析させ、`my-preferences.md` を再生成する。
 * 設定ページの「再生成」ボタンから呼ばれる。
 */
export async function regeneratePreferences(): Promise<string> {
  const client = getAnthropicClient();
  const all = readReplyPatterns();

  if (all.length < 3) {
    const minimal = `# 返信スタイル・好み

> まだ十分な送受信履歴がないため、自動分析できませんでした（${all.length} 件）。
> もう少しメールを送ったあとに再生成すると、より精度高くまとまります。
`;
    writeUserPreferences(minimal);
    return minimal;
  }

  const samples = all
    .slice(-40)
    .map(
      (p) =>
        `[${p.kind === "compose" ? "新規" : "返信"} / ${p.tone} / edited=${p.edited}] 件名: ${p.emailSubject}\n本文:\n${p.finalSent.slice(0, 500)}`
    )
    .join("\n\n");

  const prompt = `以下は山崎 Seiya が AI 補助で書いた / 編集した過去のメール ${Math.min(all.length, 40)} 件です。
これを読み、Seiya 個人の **メール返信スタイル・好み** を箇条書きで Markdown にまとめてください。
このファイルは今後の AI 返信生成で **最優先で参照** されるプロフィールになります。

【出力フォーマット（Markdown のみ。前置き禁止）】
# 返信スタイル・好み

## 文体
- （観察された特徴を具体的に。例: 「敬語と砕けた表現を混ぜる」「最後に「では、よろしくお願いいたします」で締めることが多い」）

## 構成
- （定型的な書き出し、段落の作り方、改行の癖、署名の有無など）

## トーン別の使い分け
- ビジネス:
- カジュアル:
- 丁寧:
- 簡潔:

## 好む表現 / よく使う言い回し
- （箇条書き）

## 避ける表現 / 編集で削られがちな箇所
- （edited=true のサンプルから推測）

---
サンプル：
${samples}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
  });
  const block = response.content[0];
  const content = block.type === "text" ? block.text.trim() : "";
  if (!content) throw new Error("再生成に失敗しました");

  writeUserPreferences(content);
  return content;
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

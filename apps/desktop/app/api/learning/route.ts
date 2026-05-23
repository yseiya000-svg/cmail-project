import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import {
  saveReplyPattern,
  readReplyPatterns,
  shouldExcludeFromLearning,
  bumpContact,
} from "@/lib/obsidian";
import { listLabels } from "@/lib/gmail";
import { authOptions } from "@/lib/authOptions";
import type { ReplyPattern } from "@/types";

interface LearningPayload extends ReplyPattern {
  /** 元メールの labelIds — excludeFromLearning 判定用 */
  sourceLabelIds?: string[];
  /** 相手の表示名（連絡先 stub 用） */
  contactDisplayName?: string;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patterns = readReplyPatterns();
  return NextResponse.json({ patterns });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req.json()) as LearningPayload;
  const { sourceLabelIds, contactDisplayName, ...pattern } = payload;

  // 学習除外フラグの付いたラベルがあれば、reply-patterns には保存しない。
  // ただし連絡先の往来カウントは更新する（除外は「AI学習データ」のみ）。
  let excluded = false;
  if (sourceLabelIds && sourceLabelIds.length > 0) {
    try {
      const all = await listLabels(session.accessToken as string);
      excluded = shouldExcludeFromLearning(sourceLabelIds, all);
    } catch {
      // ラベル取得失敗時は安全側で保存しない … と言いたいが、ユーザーに無感の損失が出るので保存側に倒す
      excluded = false;
    }
  }

  if (!excluded) {
    saveReplyPattern(pattern as ReplyPattern);
  }

  if (pattern.emailFrom) {
    bumpContact(pattern.emailFrom, contactDisplayName);
  }

  return NextResponse.json({ ok: true, excluded });
}

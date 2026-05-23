"use client";

import { useState } from "react";
import type { ReplyTone, ReplyPattern, GmailLabel } from "@/types";
import { TONE_LABELS } from "@/types";

interface ComposeModalProps {
  onClose: () => void;
  /** Sidebar から渡される。送信時にラベルを付けるためのドロップダウンに使う */
  labels?: GmailLabel[];
  /** 送信成功時に呼ばれる（メール一覧の再読み込みなど） */
  onSent?: () => void;
}

export default function ComposeModal({ onClose, labels = [], onSent }: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // AI 下書き支援
  const [draft, setDraft] = useState("");
  const [tone, setTone] = useState<ReplyTone>("business");
  const [aiGenerated, setAiGenerated] = useState("");
  const [generating, setGenerating] = useState(false);

  // 送信時に付けるラベル
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  const tones = Object.entries(TONE_LABELS) as [ReplyTone, string][];
  const userLabels = labels.filter((l) => l.type === "user" && !l.name.startsWith("["));

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/claude/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, draft, tone, labelIds: selectedLabelIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成エラー");
      setBody(data.body);
      setAiGenerated(data.body);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!to || !subject || !body) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          subject,
          body,
          labelIds: selectedLabelIds,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "送信エラー");
      }

      // 学習データに「新規送信」として記録（kind: "compose"）。
      // 学習除外ラベル付きならサーバ側で弾かれる。
      const pattern: ReplyPattern & { sourceLabelIds?: string[] } = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: new Date().toISOString(),
        emailSubject: subject,
        emailFrom: to,
        tone,
        hint: draft,
        aiGenerated,
        finalSent: body,
        edited: aiGenerated !== body,
        kind: "compose",
        sourceLabelIds: selectedLabelIds,
      };
      await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pattern),
      }).catch(() => null);

      onSent?.();
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  function toggleLabel(id: string) {
    setSelectedLabelIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  return (
    // バックドロップなし — 右下に固定配置のみ
    <div className="fixed bottom-0 right-0 p-6 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[560px] flex flex-col" style={{ height: "580px" }}>

        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-800 rounded-t-xl">
          <span className="text-white text-sm font-medium">新規メール</span>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 宛先 */}
          <input
            type="email"
            placeholder="宛先"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="px-4 py-2 border-b border-gray-200 text-sm outline-none"
          />
          {/* 件名 */}
          <input
            type="text"
            placeholder="件名"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="px-4 py-2 border-b border-gray-200 text-sm outline-none"
          />

          {/* AI 下書き支援エリア */}
          <div className="px-4 py-2 border-b border-gray-100 bg-violet-50">
            <div className="flex items-center gap-1.5 mb-1.5">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#7c3aed">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
              </svg>
              <span className="text-xs text-violet-700 font-medium">Claude AI で下書き生成</span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && handleGenerate()}
              placeholder="下書きやヒントを入力（例：会議の日程調整をお願いする）　Ctrl+Enter で生成"
              rows={3}
              className="w-full text-xs bg-white border border-violet-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400 placeholder-gray-400 resize-none mb-1.5"
            />
            <div className="flex gap-2">
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as ReplyTone)}
                className="text-xs border border-violet-200 rounded-lg px-2 py-1.5 bg-white outline-none focus:border-violet-400 text-gray-700"
              >
                {tones.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-1.5 bg-violet-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors whitespace-nowrap"
              >
                {generating ? (
                  <>
                    <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    生成中
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                    </svg>
                    生成
                  </>
                )}
              </button>
            </div>
          </div>

          {/* 本文 */}
          <textarea
            placeholder="本文　（Ctrl+Enter で送信）"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSend();
            }}
            className="flex-1 px-4 py-3 text-sm outline-none resize-none placeholder-gray-400"
          />
        </div>

        {error && <div className="px-4 pb-1 text-xs text-red-500">{error}</div>}

        {/* フッター：送信ボタン + ラベル選択 */}
        <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-100">
          <button
            onClick={handleSend}
            disabled={sending || !to || !subject || !body}
            className="flex items-center gap-1.5 bg-violet-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            {sending ? "送信中..." : "送信"}
          </button>

          {/* ラベル選択 */}
          <div className="relative">
            <button
              onClick={() => setShowLabelPicker((v) => !v)}
              className="flex items-center gap-1.5 text-xs text-gray-600 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              title="送信時に付けるラベル"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
              </svg>
              {selectedLabelIds.length === 0 ? "ラベル" : `ラベル (${selectedLabelIds.length})`}
            </button>
            {showLabelPicker && (
              <div className="absolute bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-[180px] max-h-60 overflow-y-auto">
                {userLabels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">ラベルがありません</div>
                ) : (
                  userLabels.map((l) => (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedLabelIds.includes(l.id)}
                        onChange={() => toggleLabel(l.id)}
                        className="w-3.5 h-3.5 accent-violet-600"
                      />
                      <span className="truncate text-gray-700">{l.name}</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import type { ReplyTone } from "@/types";
import { TONE_LABELS } from "@/types";

interface ComposeModalProps {
  onClose: () => void;
}

export default function ComposeModal({ onClose }: ComposeModalProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // AI 下書き支援
  const [draft, setDraft] = useState("");
  const [tone, setTone] = useState<ReplyTone>("business");
  const [generating, setGenerating] = useState(false);

  const tones = Object.entries(TONE_LABELS) as [ReplyTone, string][];

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/claude/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, draft, tone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成エラー");
      setBody(data.body);
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
        body: JSON.stringify({ to, subject, body }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "送信エラー");
      }
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
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

        {/* フッター */}
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
        </div>
      </div>
    </div>
  );
}

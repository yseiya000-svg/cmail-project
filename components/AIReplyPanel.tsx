"use client";

import { useState, useRef, useCallback } from "react";
import type { EmailMessage, ReplyTone, ReplyPattern } from "@/types";
import { TONE_LABELS } from "@/types";

interface AIReplyPanelProps {
  message: EmailMessage;
  onClose: () => void;
  onSent: () => void;
}

export default function AIReplyPanel({ message, onClose, onSent }: AIReplyPanelProps) {
  const [tone, setTone] = useState<ReplyTone>("business");
  const [hint, setHint] = useState("");
  const [reply, setReply] = useState("");
  const [aiGenerated, setAiGenerated] = useState("");
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // リサイズ用 state（デフォルト: 画面縦幅の25%）
  const [textareaHeight, setTextareaHeight] = useState<number>(
    typeof window !== "undefined" ? Math.floor(window.innerHeight * 0.25) : 200
  );
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const tones = Object.entries(TONE_LABELS) as [ReplyTone, string][];

  // ドラッグ開始
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = textareaHeight;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = dragStartY.current - e.clientY; // 上にドラッグ → 高くなる
      const newHeight = Math.max(80, Math.min(window.innerHeight * 0.7, dragStartHeight.current + delta));
      setTextareaHeight(newHeight);
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }, [textareaHeight]);

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/claude/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailFrom: message.from,
          emailSubject: message.subject,
          emailBody: message.body,
          tone,
          hint,
          labelIds: message.labelIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成エラー");
      setReply(data.reply);
      setAiGenerated(data.reply);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSend() {
    if (!reply.trim()) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/gmail/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: message.from,
          subject: /^re:\s*/i.test(message.subject)
            ? message.subject
            : `Re: ${message.subject}`,
          body: reply,
          threadId: message.threadId,
          // Threading headers — the recipient's mail client uses these
          // (not threadId) to decide whether this reply belongs to the
          // original conversation.
          inReplyTo: message.messageIdHeader,
          references: message.references,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "送信エラー");
      }

      const pattern: ReplyPattern & {
        sourceLabelIds?: string[];
        contactDisplayName?: string;
      } = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date: new Date().toISOString(),
        emailSubject: message.subject,
        emailFrom: message.from,
        tone,
        hint,
        aiGenerated,
        finalSent: reply,
        edited: aiGenerated !== reply,
        kind: "reply",
        sourceLabelIds: message.labelIds,
        contactDisplayName: message.fromName,
      };
      await fetch("/api/learning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pattern),
      });

      onSent();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-gray-200 bg-white shadow-lg flex flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">To:</span>
          <span className="text-xs font-medium text-gray-700">{message.from}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </div>

      {/* Claude AI hint area */}
      <div className="px-4 py-2 border-b border-gray-100 bg-violet-50">
        <div className="flex items-center gap-1.5 mb-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#7c3aed">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
          </svg>
          <span className="text-xs text-violet-700 font-medium">Claude AI で下書き生成</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && handleGenerate()}
            placeholder="ヒント（例：丁寧にお断りして、来週の提案をする）　Ctrl+Enter で生成"
            className="flex-1 text-xs bg-white border border-violet-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400 placeholder-gray-400"
          />
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as ReplyTone)}
            className="text-xs border border-violet-200 rounded-lg px-2 py-2 bg-white outline-none focus:border-violet-400 text-gray-700"
          >
            {tones.map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 bg-violet-600 text-white text-xs px-3 py-2 rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors whitespace-nowrap"
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

      {/* ドラッグハンドル */}
      <div
        onMouseDown={handleDragStart}
        className="h-2 bg-gray-100 hover:bg-violet-100 cursor-row-resize flex items-center justify-center transition-colors group"
        title="ドラッグで高さを調整"
      >
        <div className="w-8 h-0.5 bg-gray-300 group-hover:bg-violet-400 rounded-full transition-colors" />
      </div>

      {/* Reply textarea（高さをドラッグで変更） */}
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        placeholder="返信を入力... （Ctrl+Enter で送信）"
        style={{ height: textareaHeight }}
        className="px-4 py-3 text-sm text-gray-800 outline-none resize-none placeholder-gray-400"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSend();
        }}
      />

      {error && <div className="px-4 pb-1 text-xs text-red-500">{error}</div>}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-100">
        <div className="flex items-center gap-3">
          <button
            onClick={handleSend}
            disabled={sending || !reply.trim()}
            className="flex items-center gap-1.5 bg-violet-600 text-white text-sm px-4 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
            {sending ? "送信中..." : "送信"}
          </button>
          <button className="text-gray-400 hover:text-gray-600">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16.5 6v11.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V5c0-1.38 1.12-2.5 2.5-2.5s2.5 1.12 2.5 2.5v10.5c0 .55-.45 1-1 1s-1-.45-1-1V6H10v9.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5V5c0-2.21-1.79-4-4-4S7 2.79 7 5v12.5c0 3.04 2.46 5.5 5.5 5.5s5.5-2.46 5.5-5.5V6h-1.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

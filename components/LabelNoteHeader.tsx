"use client";

import { useEffect, useState } from "react";
import type { GmailLabel, LabelNote } from "@/types";

interface LabelNoteHeaderProps {
  label: GmailLabel;
}

/**
 * ラベル絞込中に「件名」エリアに表示されるノートエディタ。
 * ラベルごとの文脈（プロジェクト概要など）と「学習対象から除外」フラグを編集できる。
 * 保存内容は AI 返信生成時にそのラベル付きメールへ自動注入される。
 */
export default function LabelNoteHeader({ label }: LabelNoteHeaderProps) {
  const [note, setNote] = useState<LabelNote>({
    labelId: label.id,
    labelName: label.name,
    excludeFromLearning: false,
    body: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(true);

  // ラベルが切り替わったら読み直し
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    fetch(`/api/labels/notes?labelName=${encodeURIComponent(label.name)}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.note) {
          setNote({
            labelId: d.note.labelId || label.id,
            labelName: d.note.labelName || label.name,
            excludeFromLearning: !!d.note.excludeFromLearning,
            body: d.note.body || "",
          });
        } else {
          setNote({
            labelId: label.id,
            labelName: label.name,
            excludeFromLearning: false,
            body: "",
          });
        }
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [label.id, label.name]);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/labels/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "保存エラー");
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-violet-100 bg-gradient-to-b from-violet-50 to-white">
      {/* 上段：ラベル名 + 除外チェック + 折りたたみ */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#7c3aed" className="flex-shrink-0">
            <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
          </svg>
          <span className="text-sm font-semibold text-violet-900 truncate">{label.name}</span>
          <span className="text-xs text-violet-400 ml-1">ラベルノート</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={note.excludeFromLearning}
              onChange={(e) => setNote({ ...note, excludeFromLearning: e.target.checked })}
              className="w-3.5 h-3.5 accent-violet-600"
            />
            学習対象から除外
          </label>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-400 hover:text-gray-600"
            title={expanded ? "折りたたむ" : "展開"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* 中段：ノート本文 textarea */}
      {expanded && (
        <div className="px-6 pb-3">
          {loading ? (
            <div className="text-xs text-gray-400 py-2">読み込み中...</div>
          ) : (
            <>
              <textarea
                value={note.body}
                onChange={(e) => setNote({ ...note, body: e.target.value })}
                placeholder="このラベルが付いたメールへの返信生成時に AI に渡される文脈をここに書きます。例：プロジェクトの概要、相手との関係性、注意事項など。"
                rows={4}
                className="w-full text-xs bg-white border border-violet-200 rounded-lg px-3 py-2 outline-none focus:border-violet-400 placeholder-gray-400 resize-y text-gray-700"
              />
              <div className="flex items-center justify-between mt-2">
                {error ? (
                  <span className="text-xs text-red-500">{error}</span>
                ) : savedAt ? (
                  <span className="text-xs text-green-600">保存しました</span>
                ) : (
                  <span className="text-xs text-gray-400">
                    {note.excludeFromLearning
                      ? "このラベル付きのメールは学習データから除外されます"
                      : "保存内容は返信生成時に AI に注入されます"}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 disabled:opacity-60 transition-colors"
                >
                  {saving ? "保存中..." : "保存"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

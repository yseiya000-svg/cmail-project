"use client";

import type { EmailMessage } from "@/types";
import { formatDistanceToNow, isValid } from "date-fns";
import { ja } from "date-fns/locale";

interface EmailListProps {
  messages: EmailMessage[];
  selectedId: string | null;
  onSelect: (msg: EmailMessage) => void;
  loading: boolean;
  /** 複数選択用 — 設定されていればチェックボックスを表示 */
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (!isValid(d)) return dateStr;
    return formatDistanceToNow(d, { addSuffix: false, locale: ja });
  } catch {
    return dateStr;
  }
}

export default function EmailList({
  messages,
  selectedId,
  onSelect,
  loading,
  selectedIds,
  onToggleSelect,
}: EmailListProps) {
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        読み込み中...
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        メールがありません
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.map((msg) => {
        const isChecked = selectedIds?.has(msg.id) ?? false;
        return (
          <div
            key={msg.id}
            className={`group flex items-start gap-2 px-3 py-3 border-b border-gray-100 transition-colors cursor-pointer ${
              selectedId === msg.id
                ? "bg-violet-50 border-l-2 border-l-violet-500"
                : isChecked
                ? "bg-violet-50/40"
                : "hover:bg-gray-50"
            }`}
            onClick={() => onSelect(msg)}
          >
            {onToggleSelect && (
              <input
                type="checkbox"
                checked={isChecked}
                onChange={(e) => {
                  e.stopPropagation();
                  onToggleSelect(msg.id);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-4 h-4 mt-0.5 accent-violet-600 flex-shrink-0"
                aria-label="選択"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  {!msg.isRead && (
                    <div className="w-2 h-2 bg-violet-600 rounded-full flex-shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${
                      msg.isRead ? "text-gray-600 font-normal" : "text-gray-900 font-semibold"
                    }`}
                  >
                    {msg.fromName || msg.from}
                  </span>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatDate(msg.date)}
                </span>
              </div>
              <div
                className={`text-sm truncate ${
                  msg.isRead ? "text-gray-500" : "text-gray-800 font-medium"
                }`}
              >
                {msg.subject}
              </div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{msg.snippet}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

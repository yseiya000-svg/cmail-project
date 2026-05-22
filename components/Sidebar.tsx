"use client";

import { useSession, signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { GmailLabel } from "@/types";
import { useSettings } from "@/contexts/SettingsContext";

interface SidebarProps {
  activeLabelId: string;
  onLabelChange: (id: string) => void;
  labels: GmailLabel[];
  onCompose: () => void;
  /** ラベル作成成功時に親に通知（ラベル一覧の再取得用） */
  onLabelsChanged?: () => void;
}

function LabelIcon({ id }: { id: string }) {
  const cls = "w-4 h-4 text-gray-500";
  switch (id) {
    case "INBOX":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12h-4c0 1.66-1.34 3-3 3s-3-1.34-3-3H5V5h14v10z" />
        </svg>
      );
    case "STARRED":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      );
    case "SENT":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      );
    case "DRAFT":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
        </svg>
      );
    case "TRASH":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
        </svg>
      );
    case "SPAM":
      // 八角形の警告アイコン（!マーク入り）— 添付画像風だが線で軽量化してUIに馴染ませる
      return (
        <svg
          className={cls}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z" />
          <line x1="12" y1="8" x2="12" y2="13" />
          <circle cx="12" cy="16.2" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
    default:
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20 6H10v2h10V6zm0 4H10v2h10v-2zm0 4H10v2h10v-2zM4 6h2v2H4V6zm0 4h2v2H4v-2zm0 4h2v2H4v-2z" />
        </svg>
      );
  }
}

export default function Sidebar({
  activeLabelId,
  onLabelChange,
  labels,
  onCompose,
  onLabelsChanged,
}: SidebarProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const { t, tf } = useSettings();
  const [showAccountPopup, setShowAccountPopup] = useState(false);
  const accountSectionRef = useRef<HTMLDivElement>(null);
  const [creatingLabel, setCreatingLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [labelError, setLabelError] = useState("");

  // 右クリックコンテキストメニュー
  type ContextMenu = { x: number; y: number; label: GmailLabel } | null;
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // ラベルリネーム
  const [renamingLabelId, setRenamingLabelId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function handleCreateLabel() {
    const name = newLabelName.trim();
    if (!name) return;
    setLabelError("");
    try {
      const res = await fetch("/api/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "作成エラー");
      setNewLabelName("");
      setCreatingLabel(false);
      onLabelsChanged?.();
    } catch (e: any) {
      setLabelError(e.message);
    }
  }

  async function handleRenameLabel(label: GmailLabel) {
    const name = renameValue.trim();
    if (!name || name === label.name) {
      setRenamingLabelId(null);
      return;
    }
    try {
      const res = await fetch("/api/labels", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: label.id, name, oldName: label.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "名前変更エラー");
      setRenamingLabelId(null);
      onLabelsChanged?.();
    } catch (e: any) {
      setLabelError(e.message);
      setRenamingLabelId(null);
    }
  }

  async function handleDeleteLabel(label: GmailLabel) {
    setContextMenu(null);
    if (!confirm(tf("deleteLabelConfirm", label.name))) return;
    try {
      const res = await fetch(`/api/labels?id=${encodeURIComponent(label.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "削除エラー");
      }
      onLabelsChanged?.();
    } catch (e: any) {
      setLabelError(e.message);
    }
  }

  // コンテキストメニューの外クリックで閉じる（メニュー内クリックは生かす）
  useEffect(() => {
    if (!contextMenu) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        contextMenuRef.current &&
        !contextMenuRef.current.contains(e.target as Node)
      ) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [contextMenu]);

  const SYSTEM_LABELS = [
    { id: "INBOX", name: t("inbox") },
    { id: "STARRED", name: t("starred") },
    { id: "SENT", name: t("sent") },
    { id: "DRAFT", name: t("draft") },
    { id: "ALL", name: t("allMail") },
    { id: "TRASH", name: t("trash") },
    { id: "SPAM", name: t("spam") },
  ];

  const userLabels = labels.filter(
    (l) => l.type === "user" && !l.name.startsWith("[")
  );

  const getUnread = (id: string) => {
    const label = labels.find((l) => l.id === id);
    return label?.messagesUnread ?? 0;
  };

  // ポップアップの外をクリックしたら閉じる
  useEffect(() => {
    if (!showAccountPopup) return;
    function handleMouseDown(e: MouseEvent) {
      if (
        accountSectionRef.current &&
        !accountSectionRef.current.contains(e.target as Node)
      ) {
        setShowAccountPopup(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showAccountPopup]);

  return (
    <aside className="w-52 flex-shrink-0 flex flex-col h-full bg-white border-r border-gray-100">
      {/* Header */}
      <div className="p-4 flex items-center gap-2 border-b border-gray-100">
        <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
          </svg>
        </div>
        <span className="font-bold text-gray-800 text-lg">Cmail</span>
      </div>

      {/* Compose */}
      <div className="p-3">
        <button
          onClick={onCompose}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
          {t("compose")}
        </button>
      </div>

      {/* System labels */}
      <nav className="flex-1 overflow-y-auto px-2">
        {SYSTEM_LABELS.map((label) => {
          const unread = getUnread(label.id);
          const isActive = activeLabelId === label.id;
          return (
            <button
              key={label.id}
              onClick={() => onLabelChange(label.id)}
              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm mb-0.5 transition-colors ${
                isActive
                  ? "bg-violet-50 text-violet-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <LabelIcon id={label.id} />
              <span className="flex-1 text-left truncate">{label.name}</span>
              {unread > 0 && (
                <span className="text-xs font-medium text-gray-600">{unread}</span>
              )}
            </button>
          );
        })}

        {/* User labels */}
        <div className="flex items-center justify-between px-3 pt-4 pb-1">
          <span className="text-xs text-gray-400 font-medium">{t("labels")}</span>
          <button
            onClick={() => setCreatingLabel((v) => !v)}
            className="text-gray-400 hover:text-violet-600 transition-colors"
            title={t("createLabelTitle")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
            </svg>
          </button>
        </div>
        {creatingLabel && (
          <div className="px-3 pb-2">
            <input
              type="text"
              autoFocus
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateLabel();
                else if (e.key === "Escape") {
                  setCreatingLabel(false);
                  setNewLabelName("");
                  setLabelError("");
                }
              }}
              placeholder={t("labelNamePlaceholder")}
              className="w-full text-xs border border-violet-200 rounded-lg px-2 py-1 outline-none focus:border-violet-400 text-gray-700"
            />
            {labelError && (
              <div className="text-[10px] text-red-500 mt-0.5">{labelError}</div>
            )}
          </div>
        )}
        {userLabels.map((label) =>
          renamingLabelId === label.id ? (
            // インラインリネーム入力
            <div key={label.id} className="px-3 py-1 mb-0.5">
              <input
                type="text"
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRenameLabel(label);
                  else if (e.key === "Escape") setRenamingLabelId(null);
                }}
                onBlur={() => handleRenameLabel(label)}
                placeholder={t("newLabelNamePlaceholder")}
                className="w-full text-xs border border-violet-300 rounded-lg px-2 py-1 outline-none focus:border-violet-500 text-gray-700 bg-white"
              />
            </div>
          ) : (
            <button
              key={label.id}
              onClick={() => onLabelChange(label.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.clientX, y: e.clientY, label });
              }}
              className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-sm mb-0.5 transition-colors ${
                activeLabelId === label.id
                  ? "bg-violet-50 text-violet-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <svg className="w-3 h-3 text-violet-400 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
              </svg>
              <span className="flex-1 text-left truncate">{label.name}</span>
            </button>
          )
        )}

        {/* 右クリックコンテキストメニュー */}
        {contextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[140px]"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
            <button
              onClick={() => {
                setRenameValue(contextMenu.label.name);
                setRenamingLabelId(contextMenu.label.id);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
              </svg>
              {t("renameLabel")}
            </button>
            <button
              onClick={() => handleDeleteLabel(contextMenu.label)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
              {t("deleteLabel")}
            </button>
          </div>
        )}
      </nav>

      {/* Account section — relative wrapper so popup anchors here */}
      {session?.user && (
        <div ref={accountSectionRef} className="relative p-3 border-t border-gray-100">
          {/* アカウントポップアップ */}
          {showAccountPopup && (
            <div className="absolute bottom-full left-2 right-2 mb-2 bg-white border border-gray-200 rounded-xl shadow-xl p-3 z-50">
              <div className="text-xs text-gray-400 font-medium mb-2 px-1">{t("account")}</div>

              {/* 現在のアカウント */}
              <label className="flex items-center gap-2 px-1 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked
                  readOnly
                  className="w-3.5 h-3.5 accent-violet-600 flex-shrink-0"
                />
                {session.user.image ? (
                  <img
                    src={session.user.image}
                    alt="avatar"
                    className="w-5 h-5 rounded-full flex-shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 text-xs font-bold flex-shrink-0">
                    {session.user.name?.[0] ?? "U"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-gray-700 truncate">
                    {session.user.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">{session.user.email}</div>
                </div>
              </label>

              <div className="border-t border-gray-100 my-2" />

              {/* アカウント追加ボタン */}
              <button
                onClick={() => {
                  setShowAccountPopup(false);
                  signIn("google", { prompt: "select_account" });
                }}
                className="w-full flex items-center gap-2 px-1 py-1.5 rounded-lg text-xs text-violet-600 hover:bg-violet-50 transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                </svg>
                {t("addAccount")}
              </button>
            </div>
          )}

          {/* アカウントボタン */}
          <button
            onClick={() => setShowAccountPopup((v) => !v)}
            className="w-full flex items-center gap-2 hover:bg-gray-50 rounded-lg px-1 py-1.5 transition-colors"
          >
            {session.user.image ? (
              <img
                src={session.user.image}
                alt="avatar"
                className="w-7 h-7 rounded-full flex-shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-violet-200 flex items-center justify-center text-violet-700 text-xs font-bold flex-shrink-0">
                {session.user.name?.[0] ?? "U"}
              </div>
            )}
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-medium text-gray-700 truncate">
                {session.user.name}
              </div>
              <div className="text-xs text-gray-400 truncate">{t("account")}</div>
            </div>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`text-gray-400 flex-shrink-0 transition-transform ${showAccountPopup ? "rotate-180" : ""}`}
            >
              <path d="M7 10l5 5 5-5z" />
            </svg>
          </button>

          {/* 設定ボタン */}
          <button
            onClick={() => router.push("/settings")}
            className="w-full flex items-center gap-2 px-2 py-1.5 mt-0.5 rounded-lg text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            {t("settings")}
          </button>
        </div>
      )}
    </aside>
  );
}

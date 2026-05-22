"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo } from "react";
import Sidebar from "@/components/Sidebar";
import EmailList from "@/components/EmailList";
import EmailView from "@/components/EmailView";
import ComposeModal from "@/components/ComposeModal";
import OnboardingModal from "@/components/OnboardingModal";
import LabelNoteHeader from "@/components/LabelNoteHeader";
import type { EmailMessage, GmailLabel } from "@/types";
import { useSettings } from "@/contexts/SettingsContext";

const SYSTEM_LABEL_IDS = new Set([
  "INBOX", "STARRED", "SENT", "DRAFT", "ALL", "TRASH", "SPAM", "UNREAD", "IMPORTANT",
  "CATEGORY_PERSONAL", "CATEGORY_SOCIAL", "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES", "CATEGORY_FORUMS",
]);

export default function MailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, tf, settings, loaded: settingsLoaded } = useSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [activeLabelId, setActiveLabelId] = useState("INBOX");
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 複数選択
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkLabelMenu, setShowBulkLabelMenu] = useState(false);
  const [showSelectMenu, setShowSelectMenu] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated" && settingsLoaded && !settings.aiApiKeySet) {
      setShowOnboarding(true);
    }
  }, [status, settingsLoaded, settings.aiApiKeySet]);

  // ラベル読み込み
  const loadLabels = useCallback(() => {
    if (status !== "authenticated") return;
    fetch("/api/gmail/labels")
      .then((r) => r.json())
      .then((d) => setLabels(d.labels || []))
      .catch(console.error);
  }, [status]);

  useEffect(() => {
    loadLabels();
  }, [loadLabels]);

  // メール読み込み
  const loadMessages = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoadingMessages(true);
    setSelectedMessage(null);
    setSelectedIds(new Set());
    setErrorMsg(null);
    try {
      const params = new URLSearchParams();
      if (activeLabelId !== "ALL") params.set("labelIds", activeLabelId);
      params.set("maxResults", "50");
      const res = await fetch(`/api/gmail/messages?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(
          data.error?.includes("invalid") || data.error?.includes("expired") || res.status === 401
            ? t("sessionExpired")
            : `${t("mailFetchError")}: ${data.error || res.status}`
        );
        setMessages([]);
        return;
      }
      setMessages(data.messages || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`${t("networkError")}: ${err.message}`);
    } finally {
      setLoadingMessages(false);
    }
  }, [activeLabelId, status, t]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSelectMessage = useCallback(
    (msg: EmailMessage) => {
      setSelectedMessage(msg);
      if (!msg.isRead) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? { ...m, isRead: true } : m))
        );
        fetch("/api/gmail/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: msg.id }),
        }).catch((err) => console.error("mark-read failed:", err));
      }
    },
    []
  );

  const filteredMessages = useMemo(
    () =>
      searchQuery
        ? messages.filter(
            (m) =>
              m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
              m.fromName.toLowerCase().includes(searchQuery.toLowerCase()) ||
              m.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
              m.snippet.toLowerCase().includes(searchQuery.toLowerCase())
          )
        : messages,
    [searchQuery, messages]
  );

  // ----- 選択操作 -----
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAll() {
    setSelectedIds(new Set(filteredMessages.map((m) => m.id)));
  }
  function selectUnread() {
    setSelectedIds(new Set(filteredMessages.filter((m) => !m.isRead).map((m) => m.id)));
  }
  function selectNone() {
    setSelectedIds(new Set());
  }

  // ----- ラベル操作 -----
  async function applyLabelToSelected(labelId: string, remove = false) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch("/api/gmail/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds: ids,
          addLabelIds: remove ? [] : [labelId],
          removeLabelIds: remove ? [labelId] : [],
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "ラベル変更エラー");
      }
      // 楽観更新
      setMessages((prev) =>
        prev.map((m) =>
          ids.includes(m.id)
            ? {
                ...m,
                labelIds: remove
                  ? m.labelIds.filter((id) => id !== labelId)
                  : Array.from(new Set([...m.labelIds, labelId])),
              }
            : m
        )
      );
      setShowBulkLabelMenu(false);
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  }

  async function toggleLabelOnMessage(messageId: string, labelId: string, remove: boolean) {
    try {
      const res = await fetch("/api/gmail/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds: [messageId],
          addLabelIds: remove ? [] : [labelId],
          removeLabelIds: remove ? [labelId] : [],
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "ラベル変更エラー");
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                labelIds: remove
                  ? m.labelIds.filter((id) => id !== labelId)
                  : Array.from(new Set([...m.labelIds, labelId])),
              }
            : m
        )
      );
      if (selectedMessage?.id === messageId) {
        setSelectedMessage((prev) =>
          prev
            ? {
                ...prev,
                labelIds: remove
                  ? prev.labelIds.filter((id) => id !== labelId)
                  : Array.from(new Set([...prev.labelIds, labelId])),
              }
            : prev
        );
      }
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  }

  async function markSelectedRead(read: boolean) {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      await fetch("/api/gmail/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds: ids,
          addLabelIds: read ? [] : ["UNREAD"],
          removeLabelIds: read ? ["UNREAD"] : [],
        }),
      });
      setMessages((prev) =>
        prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: read } : m))
      );
      selectNone();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  }

  async function deleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(tf("deleteConfirm", ids.length))) return;
    try {
      await fetch("/api/gmail/modify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageIds: ids,
          addLabelIds: ["TRASH"],
          removeLabelIds: ["INBOX"],
        }),
      });
      setMessages((prev) => prev.filter((m) => !ids.includes(m.id)));
      selectNone();
    } catch (e: any) {
      setErrorMsg(e.message);
    }
  }

  // 絞込中のラベルがユーザーラベルかどうか（→ LabelNoteHeader を表示）
  const activeUserLabel = useMemo(
    () => labels.find((l) => l.id === activeLabelId && l.type === "user" && !SYSTEM_LABEL_IDS.has(l.id)),
    [labels, activeLabelId]
  );

  const userLabels = useMemo(
    () => labels.filter((l) => l.type === "user" && !l.name.startsWith("[")),
    [labels]
  );

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        {t("loading")}
      </div>
    );
  }

  const selectionCount = selectedIds.size;

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <Sidebar
        activeLabelId={activeLabelId}
        onLabelChange={(id) => setActiveLabelId(id)}
        labels={labels}
        onCompose={() => setShowCompose(true)}
        onLabelsChanged={loadLabels}
      />

      {/* Email list column */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-gray-100 bg-white">
        {/* Search bar */}
        <div className="p-3 border-b border-gray-100">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
            </svg>
            <input
              type="text"
              placeholder={t("searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-sm outline-none flex-1 text-gray-700 placeholder-gray-400"
            />
          </div>
        </div>

        {/* List controls — マルチセレクト対応版 */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100 relative">
          <div className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selectionCount > 0 && selectionCount === filteredMessages.length}
              ref={(el) => {
                if (el) el.indeterminate = selectionCount > 0 && selectionCount < filteredMessages.length;
              }}
              onChange={(e) => (e.target.checked ? selectAll() : selectNone())}
              className="w-4 h-4 accent-violet-600"
              aria-label="全選択"
            />
            <button
              onClick={() => setShowSelectMenu((v) => !v)}
              className="text-gray-400 hover:text-gray-600 px-0.5"
              title="選択メニュー"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {showSelectMenu && (
              <div className="absolute top-full left-2 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[140px]">
                <button
                  onClick={() => { selectAll(); setShowSelectMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  {t("selectAll")}
                </button>
                <button
                  onClick={() => { selectUnread(); setShowSelectMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  {t("selectUnread")}
                </button>
                <button
                  onClick={() => { selectNone(); setShowSelectMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  {t("selectNone")}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {selectionCount > 0
                ? `${selectionCount}${t("itemsSelected")}`
                : `${filteredMessages.length}${t("countDisplayed")}`}
            </span>
            <button
              onClick={loadMessages}
              className="text-gray-400 hover:text-gray-600"
              title={t("refresh")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
              </svg>
            </button>
          </div>
        </div>

        {/* アクションバー — 選択時のみ表示 */}
        {selectionCount > 0 && (
          <div className="flex items-center gap-1 px-3 py-2 bg-violet-50 border-b border-violet-100 relative">
            <button
              onClick={() => setShowBulkLabelMenu((v) => !v)}
              className="flex items-center gap-1 text-xs bg-white border border-violet-200 px-2 py-1 rounded hover:bg-violet-100 transition-colors"
              title={t("addLabelTitle")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#7c3aed">
                <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
              </svg>
              {t("labelBtn")}
            </button>
            {showBulkLabelMenu && (
              <div className="absolute top-full left-3 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-30 min-w-[180px] max-h-60 overflow-y-auto">
                {userLabels.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-400">{t("noLabels")}</div>
                ) : (
                  userLabels.map((l) => (
                    <button
                      key={l.id}
                      onClick={() => applyLabelToSelected(l.id)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 flex items-center gap-2"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="#7c3aed">
                        <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
                      </svg>
                      <span className="truncate text-gray-700">{l.name}</span>
                    </button>
                  ))
                )}
              </div>
            )}
            <button
              onClick={() => markSelectedRead(true)}
              className="text-xs bg-white border border-violet-200 px-2 py-1 rounded hover:bg-violet-100 transition-colors"
            >
              {t("markRead")}
            </button>
            <button
              onClick={() => markSelectedRead(false)}
              className="text-xs bg-white border border-violet-200 px-2 py-1 rounded hover:bg-violet-100 transition-colors"
            >
              {t("markUnread")}
            </button>
            <button
              onClick={deleteSelected}
              className="text-xs bg-white border border-red-200 text-red-600 px-2 py-1 rounded hover:bg-red-50 transition-colors ml-auto"
            >
              {t("deleteBtn")}
            </button>
          </div>
        )}

        {errorMsg && (
          <div className="mx-3 my-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {errorMsg}
          </div>
        )}
        <EmailList
          messages={filteredMessages}
          selectedId={selectedMessage?.id ?? null}
          onSelect={handleSelectMessage}
          loading={loadingMessages}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      </div>

      {/* 右側パネル — ラベル絞込中はノートヘッダ、その下に詳細 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeUserLabel && <LabelNoteHeader label={activeUserLabel} />}
        <EmailView
          message={selectedMessage}
          onReplyLearned={loadMessages}
          labels={labels}
          onAddLabel={(mid, lid) => toggleLabelOnMessage(mid, lid, false)}
          onRemoveLabel={(mid, lid) => toggleLabelOnMessage(mid, lid, true)}
        />
      </div>

      {/* Compose modal */}
      {showCompose && (
        <ComposeModal
          onClose={() => setShowCompose(false)}
          labels={labels}
          onSent={loadMessages}
        />
      )}

      {/* First-run onboarding */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}

      {/* 余白クリックでメニュー閉じる */}
      {(showBulkLabelMenu || showSelectMenu) && (
        <div
          className="fixed inset-0 z-20"
          onClick={() => {
            setShowBulkLabelMenu(false);
            setShowSelectMenu(false);
          }}
        />
      )}
    </div>
  );
}

"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Sidebar from "@/components/Sidebar";
import EmailList from "@/components/EmailList";
import EmailView from "@/components/EmailView";
import ComposeModal from "@/components/ComposeModal";
import OnboardingModal from "@/components/OnboardingModal";
import type { EmailMessage, GmailLabel } from "@/types";
import { useSettings } from "@/contexts/SettingsContext";

export default function MailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, settings, loaded: settingsLoaded } = useSettings();
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [activeLabelId, setActiveLabelId] = useState("INBOX");
  const [labels, setLabels] = useState<GmailLabel[]>([]);
  const [messages, setMessages] = useState<EmailMessage[]>([]);
  const [selectedMessage, setSelectedMessage] = useState<EmailMessage | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showCompose, setShowCompose] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  // First-run: if no AI key configured, prompt the user.
  useEffect(() => {
    if (status === "authenticated" && settingsLoaded && !settings.aiApiKeySet) {
      setShowOnboarding(true);
    }
  }, [status, settingsLoaded, settings.aiApiKeySet]);

  // Load labels
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/gmail/labels")
      .then((r) => r.json())
      .then((d) => setLabels(d.labels || []))
      .catch(console.error);
  }, [status]);

  // Load messages when label changes
  const loadMessages = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoadingMessages(true);
    setSelectedMessage(null);
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

  // Mirror Gmail/Outlook: opening an email marks it read both locally
  // (instant feedback, removes the violet unread dot) and on Gmail's side
  // (so the unread count syncs everywhere). The server call is fire-and-
  // forget — if it fails we just log; the next refresh will reconcile.
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

  const filteredMessages = searchQuery
    ? messages.filter(
        (m) =>
          m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.fromName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.snippet.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen text-gray-400">
        {t("loading")}
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <Sidebar
        activeLabelId={activeLabelId}
        onLabelChange={(id) => setActiveLabelId(id)}
        labels={labels}
        onCompose={() => setShowCompose(true)}
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

        {/* List controls */}
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <input type="checkbox" className="w-4 h-4 accent-violet-600" />
            <button className="text-gray-400 hover:text-gray-600">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {filteredMessages.length}{t("countDisplayed")}
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
        />
      </div>

      {/* Email view */}
      <EmailView
        message={selectedMessage}
        onReplyLearned={loadMessages}
      />

      {/* Compose modal */}
      {showCompose && <ComposeModal onClose={() => setShowCompose(false)} />}

      {/* First-run onboarding */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
    </div>
  );
}

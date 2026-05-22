"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailMessage, GmailLabel } from "@/types";
import AIReplyPanel from "./AIReplyPanel";
import ContactPanel from "./ContactPanel";
import { useSettings } from "@/contexts/SettingsContext";

interface EmailViewProps {
  message: EmailMessage | null;
  onReplyLearned: () => void;
  /** 全ラベル — labelId → name 変換と chips 表示用 */
  labels?: GmailLabel[];
  /** ラベル追加・削除 — 親が Gmail API 呼び出し */
  onAddLabel?: (messageId: string, labelId: string) => void;
  onRemoveLabel?: (messageId: string, labelId: string) => void;
}

/**
 * Wrap arbitrary email HTML with a strict CSP and dark-mode-friendly base styles.
 * The iframe sandbox attribute prevents script execution regardless of CSP,
 * but CSP is the second layer of defense and also blocks remote images
 * (tracking pixels) unless the user opts in.
 */
function buildSrcDoc(html: string, allowImages: boolean): string {
  const csp = allowImages
    ? "default-src 'none'; img-src 'self' data: https:; style-src 'unsafe-inline'; font-src data: https:;"
    : "default-src 'none'; img-src 'none'; style-src 'unsafe-inline'; font-src data:;";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    color: #374151;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  img { max-width: 100%; height: auto; }
  a { color: #7c3aed; }
  pre, code { white-space: pre-wrap; }
  table { max-width: 100% !important; }
</style>
</head>
<body>${html}</body>
</html>`;
}

export default function EmailView({
  message,
  onReplyLearned,
  labels = [],
  onAddLabel,
  onRemoveLabel,
}: EmailViewProps) {
  const { t } = useSettings();
  const [showReply, setShowReply] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showLabelMenu, setShowLabelMenu] = useState(false);
  // Load images by default (matches Gmail/Outlook behavior). Scripts are still
  // blocked by the iframe sandbox, so the worst case is a tracking pixel —
  // a reasonable trade for a usable inbox. Users who want stricter privacy
  // can revoke per-message via a future setting.
  const [allowImages, setAllowImages] = useState(true);
  const [iframeHeight, setIframeHeight] = useState(400);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const userLabels = labels.filter((l) => l.type === "user" && !l.name.startsWith("["));
  const attachedLabels = message
    ? userLabels.filter((l) => message.labelIds.includes(l.id))
    : [];

  // Reset image state when the message changes.
  useEffect(() => {
    setAllowImages(true);
    setIframeHeight(400);
  }, [message?.id]);

  function handleIframeLoad() {
    const ifr = iframeRef.current;
    if (!ifr) return;
    try {
      const body = ifr.contentDocument?.body;
      if (body) {
        // +20 to avoid a phantom scrollbar from rounding
        setIframeHeight(Math.max(120, body.scrollHeight + 20));
      }
    } catch {
      // Cross-origin or sandbox restriction — keep default height
    }
  }

  if (!message) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm bg-gray-50">
        {t("selectEmail")}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Email header */}
      <div className="px-6 py-4 border-b border-gray-100 bg-white">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{message.subject}</h2>
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1 overflow-hidden">
            <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-sm font-bold leading-none flex-shrink-0">
              <span className="-mt-px">
                {(message.fromName || message.from)[0]?.toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 truncate">
                {message.fromName || message.from}
              </div>
              <div className="text-xs text-gray-400 truncate">
                To: {message.to || "me"} · {message.date}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* 連絡先パネル */}
            <button
              onClick={() => setShowContact(true)}
              className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              title={t("contactNoteTitle")}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
              </svg>
              {t("contactsBtn")}
            </button>

            {/* ラベル追加メニュー */}
            <div className="relative">
              <button
                onClick={() => setShowLabelMenu((v) => !v)}
                className="flex items-center gap-1 text-xs text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                title={t("addLabelTitle")}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.63 5.84C17.27 5.33 16.67 5 16 5L5 5.01C3.9 5.01 3 5.9 3 7v10c0 1.1.9 1.99 2 1.99L16 19c.67 0 1.27-.33 1.63-.84L22 12l-4.37-6.16z" />
                </svg>
                {t("labelBtn")}
              </button>
              {showLabelMenu && (
                <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[200px] max-h-72 overflow-y-auto">
                  {userLabels.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-gray-400">{t("noLabels")}</div>
                  ) : (
                    userLabels.map((l) => {
                      const checked = message.labelIds.includes(l.id);
                      return (
                        <label
                          key={l.id}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) onRemoveLabel?.(message.id, l.id);
                              else onAddLabel?.(message.id, l.id);
                            }}
                            className="w-3.5 h-3.5 accent-violet-600"
                          />
                          <span className="truncate text-gray-700">{l.name}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowReply((v) => !v)}
              className="flex items-center gap-1.5 text-sm bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />
              </svg>
              {t("replyBtn")}
            </button>
          </div>
        </div>

        {/* 付いているラベル chips */}
        {attachedLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {attachedLabels.map((l) => (
              <span
                key={l.id}
                className="inline-flex items-center gap-1 text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full border border-violet-100"
              >
                {l.name}
                <button
                  onClick={() => onRemoveLabel?.(message.id, l.id)}
                  className="text-violet-400 hover:text-violet-700"
                  aria-label={t("removeLabelAria")}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Email body */}
      <div className="flex-1 overflow-y-auto bg-white">
        {message.bodyHtml === undefined && message.body === undefined ? (
          // Body is still being lazy-loaded (list was fetched with metadata only).
          // Show the cached snippet so the screen isn't blank, plus a subtle hint.
          <div className="p-6 text-sm text-gray-500 leading-relaxed">
            <div className="text-gray-700 whitespace-pre-wrap">{message.snippet}</div>
            <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
              <svg
                className="w-3 h-3 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M21 12a9 9 0 11-6.219-8.56" strokeLinecap="round" />
              </svg>
              {t("loading")}
            </div>
          </div>
        ) : message.bodyHtml ? (
          <>
            {!allowImages && /<img[\s>]/i.test(message.bodyHtml) && (
              <div className="mx-6 mt-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between text-xs text-amber-800">
                <span>{t("imageTrackingWarning")}</span>
                <button
                  onClick={() => setAllowImages(true)}
                  className="text-xs font-medium text-amber-900 hover:text-amber-700 underline ml-3 whitespace-nowrap"
                >
                  {t("loadImages")}
                </button>
              </div>
            )}
            <iframe
              ref={iframeRef}
              title="Email body"
              // `allow-same-origin` only — NO `allow-scripts`, so JS in email never executes.
              // `allow-popups` lets target=_blank links open in the system browser
              // (which Electron routes through shell.openExternal).
              sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
              srcDoc={buildSrcDoc(message.bodyHtml, allowImages)}
              onLoad={handleIframeLoad}
              style={{ height: iframeHeight }}
              className="w-full px-6 pt-4 pb-6 border-0 bg-white"
            />
          </>
        ) : (
          <div className="p-6 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {message.body}
          </div>
        )}
      </div>

      {/* AI Reply panel */}
      {showReply && (
        <AIReplyPanel
          message={message}
          onClose={() => setShowReply(false)}
          onSent={() => {
            setShowReply(false);
            onReplyLearned();
          }}
        />
      )}

      {/* 連絡先ノートパネル */}
      {showContact && (
        <ContactPanel
          email={message.from}
          displayName={message.fromName}
          onClose={() => setShowContact(false)}
        />
      )}

      {/* 余白クリックでラベルメニューを閉じる */}
      {showLabelMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setShowLabelMenu(false)}
        />
      )}
    </div>
  );
}
